/**
 * FynHelp v2 practice workspace — store backed by the practice backend.
 *
 * Every client, document, review item, exception, report and chase shown here
 * is a real row, read and changed through the server functions in
 * `@/lib/practice/practice.functions`. The agents (Extract, Recon, Narrate,
 * Chaser) run on the server; the browser only uploads files, shows progress
 * and reloads the workspace after each action. Figures are always derived
 * from transactions read out of files the practice actually uploaded.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createPracticeChase,
  createPracticeClient,
  generatePracticeReport,
  assignPracticeDocument,
  getPracticeDocumentUrl,
  getPracticeWorkspace,
  reprocessPracticeDocument,
  registerPracticeUpload,
  requestPracticeReportCorrection,
  resolvePracticeException,
  savePracticeFirm,
  resolvePracticeReview,
  runPracticeRecon,
  sendPracticeFollowUp,
  setPracticeChaseStatus,
  signOffPracticeReport,
  updatePracticeClient,
} from "@/lib/practice/practice.functions";
import type { AgentKey } from "./agents";

export type Txn = {
  counterparty?: string | null;
  reference?: string | null;
  id?: string;
  date: string;
  particulars: string;
  amount: number;
  matchStatus?: string;
  side?: string;
};

export type Client = {
  id: string;
  name: string;
  entityType: string;
  gstin?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  lastMis?: string;
  doNotDisturb?: boolean;
};

export type Doc = {
  id: string;
  name: string;
  clientId: string;
  source: "Manual" | "Gmail" | "WhatsApp";
  status: "Processing" | "Parsed" | "Failed";
  date: string;
  rows: Txn[];
  side?: "bank" | "books";
  kind?: string;
  error?: string;
  txnCount?: number;
  reviewCount?: number;
  duplicateCount?: number;
  sender?: string;
  subject?: string;
};

export type ReviewItem = {
  id: string;
  clientId: string;
  docId?: string;
  docName: string;
  rawText: string;
  suggestion: Txn;
  confidence: number;
  reason?: string;
  status: "open" | "confirmed" | "discarded";
};

export const EXCEPTION_REASONS = [
  "Amount mismatch",
  "Date gap",
  "No candidate",
  "Duplicate suspect",
  "Missing counterparty",
  "Partial payment suspect",
  "Reference mismatch",
] as const;

export type Exception = {
  id: string;
  clientId: string;
  reason: (typeof EXCEPTION_REASONS)[number];
  reasonCode?: string;
  amount: number;
  date: string;
  narration: string;
  detail?: string;
  side?: "bank" | "books";
  stage?: string;
  candidates: string[];
  candidateIds?: string[];
  status: "open" | "resolved" | "ignored";
};

export type Report = {
  id: string;
  clientId: string;
  period: string;
  template: ReportTemplate;
  generated: string;
  /** Rows deliberately excluded because recon could not match them. */
  excluded: number;
  signedOff?: { by: string; at: string };
  correction?: { note: string; at: string };
  revenue: number;
  expenses: number;
  sources: { revenue: Txn[]; expenses: Txn[] };
  insights: {
    text: string;
    source: string;
    cited_transaction_ids?: string[];
    origin?: "rules" | "ai";
  }[];
  variances: {
    label: string;
    current: number;
    prior: number;
    change_pct?: number | null;
  }[];
  bankSummary: {
    label: string;
    value: number;
    rows: Txn[];
    unit?: "inr" | "count";
    key?: string;
  }[];
  warnings?: string[];
};

export const REPORT_TEMPLATES = [
  "Monthly MIS",
  "Bank Reconciliation Summary",
  "Key Variances",
  "Working Paper",
  "Exception and Review Summary",
] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

export type Firm = {
  name: string;
  partnerName: string;
  email: string;
  city: string;
  frn: string;
  gmailConnected: boolean;
};

export type Chase = {
  id: string;
  clientId: string;
  type: string;
  contact: string;
  phone: string;
  email?: string;
  due: string;
  note: string;
  followUps: number;
  status: "Open" | "Following Up" | "Escalated" | "Resolved";
  nextFollowUp?: string;
  timeline: { at: string; text: string; agent?: AgentKey }[];
};

export type ReconResult = {
  matched: number;
  exceptions: number;
  bank: number;
  at: string;
  period?: string;
};

export type Activity = {
  id: string;
  clientId: string;
  at: string;
  text: string;
  agent?: AgentKey;
};

export type Role = "Partner" | "Junior";

/** The monthly close cycle every client moves through. */
export const CLOSE_STAGES = [
  "Documents",
  "Review",
  "Recon",
  "Exceptions",
  "MIS",
] as const;
export type CloseStage = (typeof CLOSE_STAGES)[number];

export type CloseStep = { stage: CloseStage; done: boolean; detail: string };

export type CloseState = {
  steps: CloseStep[];
  percent: number;
  stage: CloseStage;
  /** The single most useful thing to do next for this client. */
  next: {
    label: string;
    why: string;
    tab: string;
    action?: "recon" | "mis" | "upload";
  };
};

function periodList() {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(x.toLocaleDateString("en-IN", { month: "long", year: "numeric" }));
  }
  return out;
}
export const PERIODS = periodList();

export type AgentRun = {
  id: string;
  agent: AgentKey;
  title: string;
  steps: string[];
  current: number;
  /** entity this run belongs to: doc id, client id or report id */
  target: string;
};

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const today = () => iso(0);
const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
const safeName = (s: string) =>
  s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "document";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Workspace = Awaited<ReturnType<typeof getPracticeWorkspace>>;

type Store = {
  hydrated: boolean;
  session: { name: string; email: string } | null;
  firm: Firm | null;
  onboarded: boolean;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  saveFirm: (patch: Partial<Firm>) => void;
  completeOnboarding: () => Promise<void>;
  refresh: () => Promise<void>;
  /** The practice id (null until onboarding creates it). */
  firmId: string | null;
  /** Resolves with the practice id once onboarding has created it. */
  firmIdReady: () => Promise<string | null>;
  /** Re-run the Extract agent on a document (retry after a failure). */
  reprocessDoc: (id: string) => Promise<void>;
  /** File an unassigned document under a client (and bank/books side); it is re-extracted. */
  assignDoc: (
    id: string,
    clientId: string,
    side?: "bank" | "books",
  ) => Promise<void>;
  /** Opens the original file in a new tab (short-lived signed link). */
  openDocument: (id: string) => Promise<void>;
  clients: Client[];
  docs: Doc[];
  review: ReviewItem[];
  exceptions: Exception[];
  reports: Report[];
  chases: Chase[];
  runs: AgentRun[];
  recon: Record<string, ReconResult>;
  runsFor: (target: string) => AgentRun[];
  addClient: (c: Omit<Client, "id">) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  addDoc: (
    name: string,
    clientId: string,
    source?: Doc["source"],
    file?: File,
  ) => void;
  resolveReview: (
    id: string,
    status: "confirmed" | "discarded",
    patch?: Txn,
  ) => void;
  setExceptionStatus: (
    id: string,
    status: Exception["status"],
    opts?: {
      action?: "match" | "reconciled_external";
      counterpartIds?: string[];
      note?: string;
    },
  ) => void;
  runRecon: (clientId: string, onDone?: (r: ReconResult) => void) => void;
  generateReport: (
    clientId: string,
    period: string,
    template: ReportTemplate,
    onDone: (r: Report) => void,
  ) => void;
  addChase: (
    c: Omit<Chase, "id" | "timeline" | "status" | "followUps">,
  ) => void;
  sendFollowUp: (id: string, channel: "Email" | "WhatsApp") => void;
  setChaseStatus: (id: string, status: Chase["status"], note?: string) => void;
  clientName: (id: string) => string;
  clientTxns: (clientId: string) => Txn[];
  matchedTxns: (clientId: string) => Txn[];
  signOffReport: (reportId: string, by: string) => void;
  requestCorrection: (reportId: string, note: string) => void;
  period: string;
  setPeriod: (p: string) => void;
  role: Role;
  setRole: (r: Role) => void;
  activity: Activity[];
  activityFor: (clientId: string) => Activity[];
  closeStateFor: (clientId: string) => CloseState;
};

const Ctx = createContext<Store | null>(null);
const PREF_KEY = "fynhelp.v2.prefs";

const sb = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  auth: typeof supabase.auth;
  storage: typeof supabase.storage;
};

export function V2StoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [chases, setChases] = useState<Chase[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [recon, setRecon] = useState<Record<string, ReconResult>>({});
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Store["session"]>(null);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [role, setRole] = useState<Role>("Partner");
  const [activity, setActivity] = useState<Activity[]>([]);

  const firmId = useRef<string | null>(null);
  const userId = useRef<string | null>(null);
  /** Resolves once the practice exists (onboarding creates it asynchronously). */
  const firmReady = useRef<Promise<string | null>>(Promise.resolve(null));
  /** Clients created in this session resolve once the server has them. */
  const pendingClients = useRef<Record<string, Promise<void>>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  // Period and role preference are the only things kept in the browser.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { role?: Role; period?: string };
        if (saved.role) setRole(saved.role);
        if (saved.period && PERIODS.includes(saved.period))
          setPeriod(saved.period);
      }
    } catch {
      /* first visit */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ role, period }));
    } catch {
      /* ignore */
    }
  }, [role, period]);

  const apply = useCallback((w: Workspace) => {
    setClients(w.clients as Client[]);
    setDocs(w.docs as Doc[]);
    setReview(w.review as ReviewItem[]);
    setExceptions(w.exceptions as Exception[]);
    setReports(w.reports as unknown as Report[]);
    setChases(w.chases as Chase[]);
    setRecon(w.recon);
    setActivity(w.activity as Activity[]);
  }, []);

  /** Reloads everything from the server; the server is the source of truth. */
  const refresh = useCallback(async () => {
    if (!firmId.current) return;
    try {
      apply(await getPracticeWorkspace());
    } catch (e) {
      console.error("[v2] workspace load failed", e);
    }
  }, [apply]);

  const boot = useCallback(async () => {
    const { data: auth } = await sb.auth.getUser();
    const user = auth?.user ?? null;
    if (!user) {
      setSession(null);
      setFirm(null);
      setHydrated(true);
      return;
    }
    userId.current = user.id;
    const meta = (user.user_metadata ?? {}) as { full_name?: string };
    setSession({
      name: meta.full_name ?? user.email ?? "",
      email: user.email ?? "",
    });
    let workspace: Workspace | null = null;
    try {
      workspace = await getPracticeWorkspace();
    } catch {
      workspace = null;
    }
    if (workspace) {
      firmId.current = workspace.firm.id;
      firmReady.current = Promise.resolve(workspace.firm.id);
      const { data: f } = await sb
        .from("ca_firms")
        .select("*")
        .eq("id", workspace.firm.id)
        .maybeSingle();
      setFirm({
        name: f?.firm_name ?? workspace.firm.name,
        partnerName: f?.ca_name ?? meta.full_name ?? "",
        email: f?.email ?? user.email ?? "",
        city: f?.city ?? "",
        frn: f?.membership_number ?? "",
        gmailConnected: false,
      });
      const { data: gmail } = await sb
        .from("ca_gmail_connections")
        .select("id")
        .eq("ca_firm_id", workspace.firm.id)
        .eq("is_active", true)
        .limit(1);
      if (gmail?.length)
        setFirm((p) => (p ? { ...p, gmailConnected: true } : p));
      apply(workspace);
    } else {
      setFirm(null);
    }
    setHydrated(true);
  }, [apply]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Signing out (here or in another tab) clears the workspace. Sign-in is picked
  // up by onboarding itself (completeOnboarding) or by the page load that follows
  // an email confirmation, so onboarding is never cut short.
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      userId.current = null;
      firmId.current = null;
      setSession(null);
      setFirm(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Documents from Gmail / WhatsApp and scheduled chaser emails arrive in the
  // background, so the workspace refreshes itself while the tab is open.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const signIn = useCallback(() => {
    /* authentication happens on the practice sign in page */
  }, []);
  const signOut = useCallback(() => {
    void sb.auth.signOut().then(() => {
      setSession(null);
      setFirm(null);
      firmId.current = null;
    });
  }, []);

  /** Creates or updates the real practice record for the signed in user. */
  const saveFirm = useCallback((patch: Partial<Firm>) => {
    setFirm((p) => ({
      name: "",
      partnerName: "",
      email: "",
      city: "",
      frn: "",
      gmailConnected: false,
      ...(p ?? {}),
      ...patch,
    }));
    firmReady.current = (async () => {
      // The user may have signed up on the previous onboarding step.
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        toast.error(
          "Confirm your email address, then sign in to finish setting up your practice.",
        );
        return firmId.current;
      }
      userId.current = sess.session.user.id;
      try {
        const res = await savePracticeFirm({
          data: {
            name: patch.name,
            city: patch.city,
            frn: patch.frn,
            email: patch.email,
            partnerName: patch.partnerName,
          },
        });
        firmId.current = res.id;
      } catch (e) {
        toast.error(errMsg(e));
      }
      return firmId.current;
    })();
  }, []);

  /** Loads the workspace for the practice onboarding just created; resolves when ready. */
  const completeOnboarding = useCallback(() => boot(), [boot]);

  /**
   * Shows an agent's steps while the real server call runs. Steps advance on a
   * timer but the run only finishes when the server answers.
   */
  const track = useCallback(
    <T,>(
      agent: AgentKey,
      title: string,
      steps: string[],
      target: string,
      work: Promise<T>,
    ): Promise<T> => {
      const id = uid();
      setRuns((p) => [...p, { id, agent, title, steps, current: 0, target }]);
      steps.slice(0, -1).forEach((_, i) => {
        timers.current.push(
          setTimeout(
            () =>
              setRuns((p) =>
                p.map((r) =>
                  r.id === id && r.current < i + 1
                    ? { ...r, current: i + 1 }
                    : r,
                ),
              ),
            700 * (i + 1),
          ),
        );
      });
      const done = () => setRuns((p) => p.filter((r) => r.id !== id));
      return work.then(
        (v) => {
          done();
          return v;
        },
        (e) => {
          done();
          throw e;
        },
      );
    },
    [],
  );

  const waitForClient = useCallback(async (clientId: string) => {
    await firmReady.current;
    const pending = pendingClients.current[clientId];
    if (pending) await pending;
  }, []);

  const addClient = useCallback(
    (c: Omit<Client, "id">) => {
      const id = uid();
      const created: Client = { ...c, id };
      setClients((p) => [created, ...p]);
      pendingClients.current[id] = (async () => {
        await firmReady.current;
        if (!firmId.current) firmId.current = (await firmReady.current) ?? null;
        try {
          await createPracticeClient({
            data: {
              id,
              name: c.name,
              entityType: c.entityType,
              gstin: c.gstin || undefined,
              contactName: c.contactName || undefined,
              email: c.email || undefined,
              phone: c.phone || undefined,
            },
          });
        } catch (e) {
          setClients((p) => p.filter((x) => x.id !== id));
          toast.error(`Could not add ${c.name}: ${errMsg(e)}`);
          throw e;
        } finally {
          delete pendingClients.current[id];
        }
        void refresh();
      })();
      pendingClients.current[id]?.catch(() => {
        /* reported above */
      });
      return created;
    },
    [refresh],
  );

  const updateClient = useCallback(
    (id: string, patch: Partial<Client>) => {
      setClients((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      void (async () => {
        await waitForClient(id);
        try {
          await updatePracticeClient({
            data: {
              id,
              patch: {
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.entityType !== undefined
                  ? { entityType: patch.entityType }
                  : {}),
                ...(patch.gstin !== undefined ? { gstin: patch.gstin } : {}),
                ...(patch.contactName !== undefined
                  ? { contactName: patch.contactName }
                  : {}),
                ...(patch.email !== undefined ? { email: patch.email } : {}),
                ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
                ...(patch.doNotDisturb !== undefined
                  ? { doNotDisturb: patch.doNotDisturb }
                  : {}),
                ...(patch.lastMis !== undefined
                  ? { lastMis: patch.lastMis }
                  : {}),
              },
            },
          });
        } catch (e) {
          toast.error(`Could not save the client: ${errMsg(e)}`);
          void refresh();
        }
      })();
    },
    [refresh, waitForClient],
  );

  /** Workflow A — upload the file, then the Extract agent reads it on the server. */
  const addDoc = useCallback(
    (
      name: string,
      clientId: string,
      source: Doc["source"] = "Manual",
      file?: File,
    ) => {
      if (!file) {
        toast.error("Choose a file to upload.");
        return;
      }
      const tempId = uid();
      setDocs((p) => [
        {
          id: tempId,
          name,
          clientId,
          source,
          status: "Processing",
          date: today(),
          rows: [],
        },
        ...p,
      ]);

      const work = (async () => {
        await waitForClient(clientId);
        const fid = firmId.current ?? (await firmReady.current);
        if (!fid) throw new Error("Create your practice first.");
        const path = `${fid}/${clientId}/v2/${Date.now()}_${safeName(name)}`;
        const { error: upErr } = await sb.storage
          .from("ca-client-documents")
          .upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        return registerPracticeUpload({
          data: {
            storage_path: path,
            filename: name,
            mime: file.type || null,
            business_id: clientId,
            source,
          },
        });
      })();

      void track(
        "extract",
        name,
        ["Reading file", "Identifying transaction lines", "Scoring confidence"],
        tempId,
        work,
      )
        .then((res) => {
          if (res.duplicate)
            toast.info(
              `${name} was already received earlier. Nothing was added twice.`,
            );
          else if (res.extract_status === "failed")
            toast.error(`${name}: ${res.error_message ?? "could not be read"}`);
          else if (res.review_count)
            toast.info(
              `${name}: ${res.txn_count ?? 0} transactions extracted, ${res.review_count} need review.`,
            );
          else if (res.extract_status === "parsed")
            toast.success(
              `${name}: ${res.txn_count ?? 0} transactions extracted.`,
            );
        })
        .catch((e) => {
          setDocs((p) =>
            p.map((d) =>
              d.id === tempId
                ? { ...d, status: "Failed", error: errMsg(e) }
                : d,
            ),
          );
          toast.error(`${name}: ${errMsg(e)}`);
        })
        .finally(() => {
          void refresh();
        });
    },
    [refresh, track, waitForClient],
  );

  const firmIdReady = useCallback(
    async () => (await firmReady.current) ?? firmId.current,
    [],
  );

  const reprocessDoc = useCallback(
    async (id: string) => {
      setDocs((p) =>
        p.map((d) =>
          d.id === id ? { ...d, status: "Processing", error: undefined } : d,
        ),
      );
      try {
        const r = await reprocessPracticeDocument({ data: { id } });
        if (r.status === "failed")
          toast.error(r.error ?? "The file still could not be read.");
        else
          toast.success(
            `Re-read: ${r.txns} transactions${r.review ? `, ${r.review} to review` : ""}.`,
          );
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        void refresh();
      }
    },
    [refresh],
  );

  const assignDoc = useCallback(
    async (id: string, clientId: string, side?: "bank" | "books") => {
      setDocs((p) =>
        p.map((d) =>
          d.id === id ? { ...d, clientId, status: "Processing" } : d,
        ),
      );
      try {
        await waitForClient(clientId);
        const r = await assignPracticeDocument({
          data: { id, business_id: clientId, ...(side ? { side } : {}) },
        });
        toast.success(
          `Filed and read: ${r.txns} transactions${r.review ? `, ${r.review} to review` : ""}.`,
        );
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        void refresh();
      }
    },
    [refresh, waitForClient],
  );

  const openDocument = useCallback(async (id: string) => {
    // Open the tab first so pop-up blockers allow it, then point it at the file.
    const tab = window.open("about:blank", "_blank");
    try {
      const { url } = await getPracticeDocumentUrl({ data: { id } });
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error(errMsg(e));
    }
  }, []);

  const resolveReview = useCallback(
    (id: string, status: "confirmed" | "discarded", patch?: Txn) => {
      setReview((p) =>
        p.map((r) =>
          r.id === id ? { ...r, status, suggestion: patch ?? r.suggestion } : r,
        ),
      );
      void resolvePracticeReview({
        data: {
          id,
          action: status === "confirmed" ? "confirm" : "discard",
          ...(patch
            ? {
                patch: {
                  date: patch.date,
                  amount: patch.amount,
                  particulars: patch.particulars,
                  ...(patch.counterparty !== undefined
                    ? { counterparty: patch.counterparty || null }
                    : {}),
                  ...(patch.reference !== undefined
                    ? { reference: patch.reference || null }
                    : {}),
                },
              }
            : {}),
        },
      })
        .catch((e) => toast.error(`Review item not saved: ${errMsg(e)}`))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  const setExceptionStatus = useCallback(
    (
      id: string,
      status: Exception["status"],
      opts?: {
        action?: "match" | "reconciled_external";
        counterpartIds?: string[];
        note?: string;
      },
    ) => {
      if (status === "open") return;
      const ex = exceptions.find((e) => e.id === id);
      setExceptions((p) => p.map((e) => (e.id === id ? { ...e, status } : e)));
      const action =
        status === "ignored"
          ? "ignore"
          : (opts?.action ?? "reconciled_external");
      void resolvePracticeException({
        data: {
          id,
          action,
          counterpart_ids:
            opts?.counterpartIds ??
            (action === "match" ? ex?.candidateIds?.slice(0, 1) : undefined),
          note: opts?.note,
        },
      })
        .catch((e) => {
          setExceptions((p) =>
            p.map((x) => (x.id === id ? { ...x, status: "open" } : x)),
          );
          toast.error(errMsg(e));
        })
        .finally(() => {
          void refresh();
        });
    },
    [exceptions, refresh],
  );

  const clientTxns = useCallback(
    (clientId: string) =>
      docs.filter((d) => d.clientId === clientId).flatMap((d) => d.rows),
    [docs],
  );

  /** Only transactions the Recon agent matched are allowed into an MIS. */
  const matchedTxns = useCallback(
    (clientId: string) =>
      clientTxns(clientId).filter((r) => r.matchStatus === "matched"),
    [clientTxns],
  );

  /** Workflow B — deterministic matching of bank lines against the books, on the server. */
  const runRecon = useCallback(
    (clientId: string, onDone?: (r: ReconResult) => void) => {
      const work = (async () => {
        await waitForClient(clientId);
        return runPracticeRecon({ data: { business_id: clientId, period } });
      })();
      void track(
        "recon",
        "Reconciling bank and books",
        [
          "Loading bank lines",
          "Exact match pass",
          "Fuzzy match pass",
          "Flagging exceptions",
        ],
        clientId,
        work,
      )
        .then((s) => {
          if (!s.run_id) {
            toast.info(s.message);
            return;
          }
          const result: ReconResult = {
            matched: s.matched_total,
            exceptions: s.exceptions,
            bank: s.bank + (s.matched_total - s.matched),
            at: today(),
            period: s.period.label,
          };
          setRecon((p) => ({ ...p, [clientId]: result }));
          onDone?.(result);
        })
        .catch((e) => toast.error(`Recon failed: ${errMsg(e)}`))
        .finally(() => {
          void refresh();
        });
    },
    [period, refresh, track, waitForClient],
  );

  /** Stage 7 — the partner either accepts the MIS or sends it back. */
  const signOffReport = useCallback(
    (reportId: string, by: string) => {
      setReports((p) =>
        p.map((r) =>
          r.id === reportId
            ? { ...r, signedOff: { by, at: today() }, correction: undefined }
            : r,
        ),
      );
      void signOffPracticeReport({ data: { id: reportId, by } })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  const requestCorrection = useCallback(
    (reportId: string, note: string) => {
      setReports((p) =>
        p.map((r) =>
          r.id === reportId
            ? { ...r, correction: { note, at: today() }, signedOff: undefined }
            : r,
        ),
      );
      void requestPracticeReportCorrection({ data: { id: reportId, note } })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  /** Workflow C — Narrate agent: numbers computed on the server, insights cited. */
  const generateReport = useCallback(
    (
      clientId: string,
      reportPeriod: string,
      template: ReportTemplate,
      onDone: (r: Report) => void,
    ) => {
      const work = (async () => {
        await waitForClient(clientId);
        return generatePracticeReport({
          data: { business_id: clientId, period: reportPeriod, template },
        });
      })();
      void track(
        "narrate",
        `${template} for ${reportPeriod}`,
        [
          "Collecting matched transactions",
          "Computing figures",
          "Writing insights",
        ],
        clientId,
        work,
      )
        .then(async (r) => {
          const c = r.content;
          const created: Report = {
            id: r.id,
            clientId,
            period: r.period,
            template,
            generated: today(),
            excluded: c.excluded,
            revenue: c.revenue,
            expenses: c.expenses,
            sources: c.sources,
            variances: c.variances,
            bankSummary: c.bankSummary,
            insights: c.insights,
            warnings: c.warnings,
          };
          setReports((p) => [created, ...p.filter((x) => x.id !== created.id)]);
          setClients((p) =>
            p.map((x) => (x.id === clientId ? { ...x, lastMis: today() } : x)),
          );
          onDone(created);
        })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh, track, waitForClient],
  );

  const addChase = useCallback(
    (c: Omit<Chase, "id" | "timeline" | "status" | "followUps">) => {
      const temp: Chase = {
        ...c,
        id: uid(),
        status: "Open",
        followUps: 0,
        timeline: [{ at: today(), text: "Chase created", agent: "chaser" }],
      };
      setChases((p) => [temp, ...p]);
      void (async () => {
        await waitForClient(c.clientId);
        await createPracticeChase({
          data: {
            business_id: c.clientId,
            type: c.type,
            contact: c.contact,
            phone: c.phone || undefined,
            due: c.due || null,
            note: c.note || undefined,
            period,
          },
        });
      })()
        .catch((e) => {
          setChases((p) => p.filter((x) => x.id !== temp.id));
          toast.error(`Chase not created: ${errMsg(e)}`);
        })
        .finally(() => {
          void refresh();
        });
    },
    [period, refresh, waitForClient],
  );

  /** Workflow D — email goes out from the server; WhatsApp is logged (the page opens wa.me). */
  const sendFollowUp = useCallback(
    (id: string, channel: "Email" | "WhatsApp") => {
      void sendPracticeFollowUp({ data: { id, channel } })
        .then((res) => {
          if (channel === "Email" && "simulated" in res && res.simulated)
            toast.info(
              "Email service is not configured yet, so the follow up was recorded but not sent.",
            );
          else if (channel === "Email") toast.success("Email follow up sent");
          else toast.success("Follow up logged on the timeline");
        })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  const setChaseStatus = useCallback(
    (id: string, status: Chase["status"], note?: string) => {
      const target = status === "Resolved" ? "Resolved" : "Open";
      setChases((p) =>
        p.map((c) =>
          c.id === id
            ? { ...c, status: target === "Resolved" ? "Resolved" : "Open" }
            : c,
        ),
      );
      void setPracticeChaseStatus({ data: { id, status: target, note } })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  const activityFor = useCallback(
    (clientId: string) => activity.filter((a) => a.clientId === clientId),
    [activity],
  );

  /**
   * Close progress for one client. The stages mirror how a CA firm actually
   * closes a month, and the next action is the single most useful step left.
   */
  const closeStateFor = useCallback(
    (clientId: string): CloseState => {
      const cDocs = docs.filter((d) => d.clientId === clientId);
      const parsed = cDocs.filter((d) => d.status === "Parsed");
      const openReview = review.filter(
        (r) => r.clientId === clientId && r.status === "open",
      );
      const openEx = exceptions.filter(
        (e) => e.clientId === clientId && e.status === "open",
      );
      const openChase = chases.filter(
        (c) => c.clientId === clientId && c.status !== "Resolved",
      );
      const run = recon[clientId];
      const reconRun =
        run && (!run.period || run.period === period) ? run : undefined;
      const mis = reports.filter(
        (r) => r.clientId === clientId && r.period === period,
      );

      const steps: CloseStep[] = [
        {
          stage: "Documents",
          done: parsed.length > 0 && openChase.length === 0,
          detail: openChase.length
            ? `${openChase.length} still being chased`
            : `${parsed.length} documents read`,
        },
        {
          stage: "Review",
          done: parsed.length > 0 && openReview.length === 0,
          detail: openReview.length
            ? `${openReview.length} rows to confirm`
            : "All rows confirmed",
        },
        {
          stage: "Recon",
          done: Boolean(reconRun),
          detail: reconRun
            ? `${reconRun.matched} of ${reconRun.bank} matched`
            : "Not run for this period",
        },
        {
          stage: "Exceptions",
          done: Boolean(reconRun) && openEx.length === 0,
          detail: openEx.length
            ? `${openEx.length} to clear`
            : "Nothing unmatched",
        },
        {
          stage: "MIS",
          done: mis.some((r) => r.signedOff),
          detail: mis.some((r) => r.signedOff)
            ? "Signed off by the partner"
            : mis.length
              ? "Waiting for partner sign off"
              : "Not generated yet",
        },
      ];

      const firstOpen = steps.find((s) => !s.done);
      const percent = Math.round(
        (steps.filter((s) => s.done).length / steps.length) * 100,
      );

      let next: CloseState["next"];
      if (!firstOpen) {
        next = {
          label: "This period is closed",
          why: "The partner has signed off and every figure still links to its source.",
          tab: "mis",
        };
      } else if (firstOpen.stage === "Documents") {
        next = openChase.length
          ? {
              label: "Follow up on pending documents",
              why: `${openChase.length} item${openChase.length > 1 ? "s are" : " is"} still with the client.`,
              tab: "chaser",
            }
          : {
              label: "Upload the first document",
              why: "Nothing has been collected for this client yet.",
              tab: "documents",
              action: "upload",
            };
      } else if (firstOpen.stage === "Review") {
        next = {
          label: `Confirm ${openReview.length} extracted row${openReview.length > 1 ? "s" : ""}`,
          why: "The Extract agent was unsure about these. Recon needs them confirmed first.",
          tab: "review",
        };
      } else if (firstOpen.stage === "Recon") {
        next = {
          label: "Run recon for this period",
          why: "Bank and books have not been matched yet.",
          tab: "recon",
          action: "recon",
        };
      } else if (firstOpen.stage === "Exceptions") {
        next = {
          label: `Clear ${openEx.length} exception${openEx.length > 1 ? "s" : ""}`,
          why: "Only matched transactions are allowed into the MIS.",
          tab: "exceptions",
        };
      } else {
        next = mis.length
          ? {
              label: "Send the MIS to the partner for sign off",
              why: "The report is ready and waiting for a partner to accept it.",
              tab: "mis",
            }
          : {
              label: `Generate the ${period} MIS`,
              why: "Recon is clean, so the numbers can be trusted.",
              tab: "mis",
              action: "mis",
            };
      }

      return {
        steps,
        percent,
        stage: firstOpen ? firstOpen.stage : "MIS",
        next,
      };
    },
    [docs, review, exceptions, chases, recon, reports, period],
  );

  const value = useMemo<Store>(
    () => ({
      hydrated,
      session,
      firm,
      onboarded: Boolean(firm),
      signIn,
      signOut,
      saveFirm,
      completeOnboarding,
      refresh,
      firmId: firmId.current,
      firmIdReady,
      reprocessDoc,
      assignDoc,
      openDocument,
      clients,
      docs,
      review,
      exceptions,
      reports,
      chases,
      runs,
      recon,
      runsFor: (target: string) => runs.filter((r) => r.target === target),
      addClient,
      updateClient,
      addDoc,
      resolveReview,
      setExceptionStatus,
      runRecon,
      generateReport,
      addChase,
      sendFollowUp,
      setChaseStatus,
      clientTxns,
      matchedTxns,
      signOffReport,
      requestCorrection,
      clientName: (id: string) =>
        clients.find((c) => c.id === id)?.name ?? "Unassigned",
      period,
      setPeriod,
      role,
      setRole,
      activity,
      activityFor,
      closeStateFor,
    }),
    [
      matchedTxns,
      signOffReport,
      requestCorrection,
      period,
      role,
      activity,
      activityFor,
      closeStateFor,
      hydrated,
      session,
      firm,
      signIn,
      signOut,
      saveFirm,
      completeOnboarding,
      refresh,
      firmIdReady,
      reprocessDoc,
      assignDoc,
      openDocument,
      clients,
      docs,
      review,
      exceptions,
      reports,
      chases,
      runs,
      recon,
      addClient,
      updateClient,
      addDoc,
      resolveReview,
      setExceptionStatus,
      runRecon,
      generateReport,
      addChase,
      sendFollowUp,
      setChaseStatus,
      clientTxns,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useV2() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useV2 must be used inside V2StoreProvider");
  return ctx;
}

export const ENTITY_TYPES = [
  "Private Limited",
  "LLP",
  "Partnership",
  "Proprietorship",
  "Public Limited",
  "Trust or Society",
];
