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
import { useRouter } from "@tanstack/react-router";
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
  markPracticeReportCorrected,
  archivePracticeClient,
  resolvePracticeException,
  reopenPracticeException,
  savePracticeFirm,
  resolvePracticeReview,
  runPracticeRecon,
  sendPracticeFollowUp,
  setPracticeChaseStatus,
  snoozePracticeChase,
  signOffPracticeReport,
  updatePracticeClient,
} from "@/lib/practice/practice.functions";
import type { AgentKey, LiveRun } from "./agents";
import { setSigningOutByUser } from "./sessionWatch";
import { openExceptions } from "./lib/exceptions";
import { parsePeriod } from "@/lib/practice/core";

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
  source: "Manual" | "Gmail" | "WhatsApp" | "Zoho Books";
  /** Uploading (in the browser) → Queued → Processing → Parsed / Needs review / Failed. */
  status: "Uploading" | "Queued" | "Processing" | "Parsed" | "Needs review" | "Failed";
  /** When a temporary failure will be retried automatically. */
  retryAt?: string;
  attempts?: number;
  /** A likely client for an unassigned arrival. A person must confirm it. */
  suggestedClientId?: string;
  suggestedBy?: string;
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
  /** GST/TDS/payroll/gateway files: summarised, not reconciled. */
  register?: { kind: string; label: string; entries: number; totals: { label: string; amount: number }[]; groups?: { key: string; amount: number; count: number }[]; checks?: { ok: boolean; label: string; detail: string }[]; note: string };
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
  candidateAmounts?: number[];
  /** The bank line or book entry this exception is about. */
  txnId?: string;
  /** Learned from an earlier decision on the same kind of line: proposed, never applied by itself. */
  precedent?: { action: string; note: string; times: number; at: string; by: string | null };
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
  /** Matched lines for the month changed after this report was generated. */
  stale?: boolean;
  status?: string;
  correction?: { note: string; at: string; byName?: string | null; resolvedAt?: string | null; resolvedByName?: string | null; resolution?: string | null };
  revenue: number;
  expenses: number;
  sources: { revenue: Txn[]; expenses: Txn[] };
  /** Cash that moved but is not revenue or expense: taxes, advances, loans, transfers. */
  otherFlows?: { key: string; label: string; direction: "in" | "out"; amount: number; count: number; rows: Txn[]; net?: number; in?: number; out?: number }[];
  signedOffWithOpen?: { exceptions: number; review: number; unmatched: number } | null;
  /** Gateway payouts grossed up from the settlement report. */
  gateway?: { payouts: number; fees: number; gst_on_fees: number; settlements: string[] } | null;
  /** Exception and Review Summary: every line decided by a person this period. */
  /** Statutory due dates that follow from this month's payments (TDS by the 7th, PF/ESI by the 15th, GSTR-3B by the 20th). */
  statutory?: { label: string; due: string }[];
  decisions?: { date: string | null; particulars: string; side: string | null; amount: number; reason: string; outcome: string; note: string }[];
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
  /** A tester account: a sandbox that is never billed, reported or messaged for real. */
  isTest?: boolean;
};

export type Chase = {
  id: string;
  clientId: string;
  type: string;
  contact: string;
  phone: string;
  email?: string;
  /** How the Chaser reaches the client. Chases made before this option have none (email, with WhatsApp from the second reminder when switched on). */
  channel?: "email" | "whatsapp" | "both";
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

/** One recorded run of an agent (Extract / Recon / Narrate / Chaser). */
export type AgentRunRecord = {
  id: string;
  clientId: string;
  agent: string;
  trigger: string;
  period?: string;
  subjectId?: string;
  subject?: string;
  status: string;
  attempt: number;
  summary: string;
  error?: string;
  retryAt?: string;
  memoryReleased: number;
  at: string;
  ms?: number;
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
const monthKey = (d: Date) => d.getFullYear() * 100 + d.getMonth();
/** "2025-07-14" → "July 2025". */
export function monthOf(iso: string): string | null {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
/** The month being closed: in the first half of a month that is still last month. */
export const DEFAULT_PERIOD = new Date().getDate() <= 15 ? PERIODS[1] : PERIODS[0];

export type AgentRun = LiveRun & {
  /** Documents with this run's file name that existed before it started (an older copy is not this upload). */
  knownDocIds?: string[];
  /** entity this run belongs to: doc id, client id or report id */
  target: string;
  /** client the run is for, so every screen of that client can show it */
  clientId?: string;
};

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const today = () => iso(0);
const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
const safeName = (s: string) =>
  s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "document";
/** Set by the provider: called when the server rejects an expired session. */
let onSessionEnded: (() => void) | null = null;
/** Any thrown value as words: Error, a server error object, or a plain string. Never "[object Object]". */
function messageOf(e: unknown): string {
  if (e instanceof Error && typeof e.message === "string" && e.message && e.message !== "[object Object]") return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown; statusText?: unknown };
    for (const v of [o.message, o.error, o.statusText]) {
      if (typeof v === "string" && v) return v;
      if (v && typeof v === "object" && typeof (v as { message?: unknown }).message === "string") return (v as { message: string }).message;
    }
  }
  return "Something went wrong. Please try again.";
}
/** The server cut the call off: the read is closed as Failed (with Retry) on the next load after 90 s. */
const isTimeout = (e: unknown) => /error occurred with your deployment|FUNCTION_INVOCATION_TIMEOUT|gateway time-?out|\b504\b/i.test(messageOf(e));
const errMsg = (e: unknown) => {
  const m = messageOf(e);
  if (/^Unauthorized\b/.test(m)) {
    onSessionEnded?.();
    return "Your session has ended. Please sign in again.";
  }
  // People using FynHelp are accountants, not engineers: say what happened
  // and what to do, and keep the technical detail in the console.
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    console.error("[v2]", m);
    return "Can't reach FynHelp right now. Check your internet connection and try again.";
  }
  // Vercel's own page when a server call runs past its time limit.
  if (/error occurred with your deployment|FUNCTION_INVOCATION_TIMEOUT|gateway time-?out|\b504\b/i.test(m)) {
    console.error("[v2]", m);
    return "This took longer than the server allows and was stopped. Nothing was lost: press Retry. If it stops again, send the file as CSV or Excel.";
  }
  if (/violates|constraint|relation "|syntax error|unexpected token|is not valid json|internal server error|\b5\d\d\b|timed? ?out|econn|fetch failed/i.test(m)) {
    console.error("[v2]", m);
    return "Something went wrong on our side. Please try again in a minute; if it keeps happening, write to support@fynhelp.com.";
  }
  return m;
};

type Workspace = Awaited<ReturnType<typeof getPracticeWorkspace>>;

type Store = {
  hydrated: boolean;
  session: { name: string; email: string } | null;
  firm: Firm | null;
  onboarded: boolean;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  /** Resolves true once the practice is saved on the server. */
  saveFirm: (patch: Partial<Firm>, opts?: { settings?: boolean }) => Promise<boolean>;
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
  /** True while this agent is already working on this target. */
  isRunning: (agent: AgentKey, target: string) => boolean;
  dismissRun: (id: string) => void;
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
    opts?: { action?: "match" | "reconciled_external"; counterpartIds?: string[]; note?: string; allowDifference?: boolean },
  ) => Promise<string | null>;
  reopenException: (id: string) => Promise<void>;
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
  /** The client promised the document by this date (YYYY-MM-DD): pause follow-ups until the day after. */
  snoozeChase: (id: string, promisedOn: string) => void;
  clientName: (id: string) => string;
  clientTxns: (clientId: string) => Txn[];
  matchedTxns: (clientId: string) => Txn[];
  signOffReport: (reportId: string, by: string, opts?: { acknowledgeOpen?: boolean; note?: string }) => Promise<boolean>;
  requestCorrection: (reportId: string, note: string) => void;
  markCorrected: (reportId: string, what?: string) => Promise<boolean>;
  archiveClient: (id: string, reason: string) => Promise<boolean>;
  period: string;
  setPeriod: (p: string) => void;
  /** The last 12 months plus every month that has transactions, newest first. */
  periods: string[];
  role: Role;
  setRole: (r: Role) => void;
  /** The person's real role in the firm, from the server. */
  firmRole: string | null;
  /** Owners, admins and partners may sign off an MIS and change firm automation. */
  canSignOff: boolean;
  /** Working as a Partner right now: may sign off, and sees partner tasks and controls. */
  partnerView: boolean;
  activity: Activity[];
  activityFor: (clientId: string) => Activity[];
  /** Recorded agent runs across the firm, newest first. */
  agentRuns: AgentRunRecord[];
  /** Recorded agent runs for one client, newest first. */
  agentRunsFor: (clientId: string) => AgentRunRecord[];
  /** True once the orchestrator found nothing left for a person in this month. */
  isReadyForMis: (clientId: string, period: string) => boolean;
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
  const router = useRouter();
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
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [role, setRole] = useState<Role>("Partner");
  const [firmRole, setFirmRole] = useState<string | null>(null);
  const canSignOff = firmRole === null || ["owner", "admin", "partner"].includes(firmRole);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunRecord[]>([]);
  const [readyForMis, setReadyForMis] = useState<{ clientId: string; period: string }[]>([]);

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
        const saved = JSON.parse(raw) as { role?: Role; period?: string; month?: string };
        if (saved.role) setRole(saved.role);
        // A period picked last month is stale: start from the month being closed.
        if (saved.period && /^[A-Za-z]+ \d{4}$/.test(saved.period) && saved.month === PERIODS[0])
          setPeriod(saved.period);
      }
    } catch {
      /* first visit */
    }
  }, []);
  // Saved only when a person changes it (an effect would also write the default
  // on mount, before the saved choice is restored, and lose it on reload).
  const prefs = useRef({ role: "Partner" as Role, period: DEFAULT_PERIOD });
  prefs.current = { role, period };
  const savePrefs = useCallback((patch: { role?: Role; period?: string }) => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs.current, ...patch, month: PERIODS[0] }));
    } catch {
      /* ignore */
    }
  }, []);
  const choosePeriod = useCallback((p: string) => {
    setPeriod(p);
    savePrefs({ period: p });
  }, [savePrefs]);
  const chooseRole = useCallback((r: Role) => {
    setRole(r);
    savePrefs({ role: r });
  }, [savePrefs]);

  const apply = useCallback((w: Workspace) => {
    setClients(w.clients as Client[]);
    setDocs(w.docs as Doc[]);
    setReview(w.review as ReviewItem[]);
    setExceptions(w.exceptions as Exception[]);
    setReports(w.reports as unknown as Report[]);
    setChases(w.chases as Chase[]);
    setRecon(w.recon);
    setActivity(w.activity as Activity[]);
    setAgentRuns((w.agentRuns ?? []) as AgentRunRecord[]);
    const r = String(w.firm?.role ?? "");
    setFirmRole(r || null);
    // Teammates who cannot sign off work in the junior view.
    if (r && !["owner", "admin", "partner"].includes(r)) setRole("Junior");
    setReadyForMis(w.readyForMis ?? []);
  }, []);

  /** Reloads everything from the server; the server is the source of truth. */
  const refresh = useCallback(async () => {
    if (!firmId.current) return;
    try {
      apply(await getPracticeWorkspace());
    } catch (e) {
      console.error("[v2] workspace load failed", errMsg(e));
    }
  }, [apply]);

  const booting = useRef<Promise<void> | null>(null);
  const boot = useCallback(() => {
    // One start-up at a time: the auth listener and the first render both ask for it.
    if (booting.current) return booting.current;
    booting.current = bootOnce().finally(() => {
      booting.current = null;
    });
    return booting.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bootOnce = async () => {
    // The session is read locally (no network); the server checks it on every call.
    const { data: auth } = await sb.auth.getSession();
    const user = auth?.session?.user ?? null;
    if (!user) {
      setSession(null);
      setFirm(null);
      setHydrated(true);
      return;
    }
    userId.current = user.id;
    // Remembered so an expired session later offers "Sign in", not "Create account".
    try {
      localStorage.setItem("fynhelp.v2.known", "1");
    } catch {
      /* private mode */
    }
    const meta = (user.user_metadata ?? {}) as { full_name?: string };
    setSession({
      name: meta.full_name ?? user.email ?? "",
      email: user.email ?? "",
    });
    let workspace: Workspace | null = null;
    // Confirm the session is still live with the auth server, in parallel with
    // the workspace (a token can outlive a session revoked on another device).
    const live = sb.auth.getUser().then(
      (r) => Boolean(r.data?.user) && !r.error,
      () => true, // offline: let the workspace call decide
    );
    try {
      const [ok, w] = await Promise.all([live, getPracticeWorkspace()]);
      if (!ok) throw new Error("Unauthorized: session ended");
      workspace = w;
    } catch (e) {
      // The local session was revoked elsewhere (password changed, signed out
      // on another device): sign in again instead of starting a new firm.
      if (/^Unauthorized\b|jwt|session/i.test(messageOf(e))) {
        try {
          sessionStorage.setItem("fynhelp.v2.expired", "1");
        } catch {
          /* private mode */
        }
        await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
        userId.current = null;
        setSession(null);
        setFirm(null);
        setHydrated(true);
        return;
      }
      workspace = null;
    }
    if (workspace) {
      firmId.current = workspace.firm.id;
      firmReady.current = Promise.resolve(workspace.firm.id);
      const wf = workspace.firm;
      setFirm({
        name: wf.name,
        partnerName: wf.partnerName ?? meta.full_name ?? "",
        email: wf.email ?? user.email ?? "",
        city: wf.city ?? "",
        frn: wf.frn ?? "",
        gmailConnected: Boolean(wf.gmailConnected),
        isTest: Boolean((wf as { isTest?: boolean }).isTest),
      });
      apply(workspace);
    } else {
      setFirm(null);
    }
    setHydrated(true);
  };

  useEffect(() => {
    void boot();
  }, [boot]);

  // A server call that comes back Unauthorized means the session is gone:
  // sign out locally so the Shell sends the user to sign in.
  useEffect(() => {
    let fired = false;
    onSessionEnded = () => {
      if (fired || !userId.current) return;
      fired = true;
      void sb.auth.signOut({ scope: "local" }).finally(() => {
        fired = false;
      });
    };
    return () => {
      onSessionEnded = null;
    };
  }, []);

  // Signing out (here or in another tab) clears the workspace. Sign-in is picked
  // up by onboarding itself (completeOnboarding) or by the page load that follows
  // an email confirmation, so onboarding is never cut short.
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      // Arriving from an email link (confirmation, invite) or signing in in
      // another tab: load that user's practice once.
      if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session?.user &&
        session.user.id !== userId.current
      ) {
        userId.current = session.user.id;
        setTimeout(() => void boot(), 0);
        return;
      }
      if (event !== "SIGNED_OUT") return;
      userId.current = null;
      firmId.current = null;
      setSession(null);
      setFirm(null);
    });
    return () => data.subscription.unsubscribe();
  }, [boot]);

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
    setSigningOutByUser();
    void sb.auth.signOut().then(() => {
      setSession(null);
      setFirm(null);
      firmId.current = null;
    });
  }, []);

  /** Creates or updates the real practice record for the signed in user. */
  const saveFirm = useCallback((patch: Partial<Firm>, opts: { settings?: boolean } = {}): Promise<boolean> => {
    if (opts.settings) {
      // An edit from Settings: the server decides who may change the firm's details.
      return savePracticeFirm({ data: { name: patch.name, city: patch.city, frn: patch.frn, email: patch.email, settings: true } })
        .then(() => {
          setFirm((p) => (p ? { ...p, ...patch } : p));
          return true;
        })
        .catch((e) => {
          toast.error(errMsg(e));
          return false;
        });
    }
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
        return null;
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
        return null;
      }
      return firmId.current;
    })();
    return firmReady.current.then((id) => Boolean(id));
  }, []);

  /** Loads the workspace for the practice onboarding just created; resolves when ready. */
  const completeOnboarding = useCallback(() => boot(), [boot]);

  const runsRef = useRef<AgentRun[]>([]);
  const docsRef = useRef<Doc[]>([]);
  docsRef.current = docs;
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  /** True while this agent is already working on this target (blocks double triggers). */
  const isRunning = useCallback(
    (agent: AgentKey, target: string) =>
      runsRef.current.some(
        (r) => r.agent === agent && r.target === target && r.status === "running",
      ),
    [],
  );

  const dismissRun = useCallback((id: string) => {
    setRuns((p) => p.filter((r) => r.id !== id));
  }, []);

  /**
   * Shows an agent working while the real call runs. The stage text changes
   * only when the work itself moves on (e.g. upload finished, server reading);
   * nothing advances on a timer. The card then shows the real outcome, or the
   * reason it failed with a way to try again.
   */
  const track = useCallback(
    <T,>(
      agent: AgentKey,
      title: string,
      target: string,
      opts: {
        stage: string;
        clientId?: string;
        describe: (v: T) => string;
        onRetry?: () => void;
      },
      work: (setStage: (stage: string) => void) => Promise<T>,
    ): Promise<T> => {
      const id = uid();
      // Registered synchronously so a second click in the same tick is refused too.
      const run: AgentRun = {
        id,
        agent,
        title,
        target,
        clientId: opts.clientId,
        stage: opts.stage,
        status: "running",
        startedAt: Date.now(),
        knownDocIds: agent === "extract" ? docsRef.current.filter((d) => d.name === title).map((d) => d.id) : undefined,
      };
      runsRef.current = [...runsRef.current, run];
      setRuns((p) => [...p, run]);
      const patch = (next: Partial<AgentRun>) =>
        setRuns((p) => p.map((r) => (r.id === id ? { ...r, ...next } : r)));
      const later = (ms: number) =>
        timers.current.push(setTimeout(() => dismissRun(id), ms));
      const settle = () => {
        runsRef.current = runsRef.current.map((r) =>
          r.id === id ? { ...r, status: "succeeded" } : r,
        );
      };
      // Each real step that finishes stays visible as a ticked line.
      const advance = (stage: string) =>
        setRuns((p) =>
          p.map((r) =>
            r.id === id && r.stage !== stage ? { ...r, trail: [...(r.trail ?? []), r.stage.replace(/^Uploading securely$/, "Uploaded securely")], stage } : r,
          ),
        );
      return work(advance).then(
        (v) => {
          settle();
          patch({ status: "succeeded", result: opts.describe(v), finishedAt: Date.now() });
          later(3500);
          return v;
        },
        (e) => {
          settle();
          patch({
            status: "failed",
            error: errMsg(e),
            finishedAt: Date.now(),
            onRetry: opts.onRetry
              ? () => {
                  dismissRun(id);
                  opts.onRetry?.();
                }
              : undefined,
          });
          later(30000);
          throw e;
        },
      );
    },
    [dismissRun],
  );

  // An upload's card says "reading" only while the file is being read: once the
  // file shows as read, the card moves on to the Recon check that follows.
  useEffect(() => {
    const done = new Set(["Parsed", "Needs review", "Failed"]);
    setRuns((p) => {
      let changed = false;
      const next = p.map((r) => {
        if (r.agent !== "extract" || r.status !== "running" || r.stage.startsWith("Read.")) return r;
        const d = docs.find((x) => x.name === r.title && (!r.clientId || x.clientId === r.clientId) && done.has(x.status) && x.id !== r.target && !(r as AgentRun).knownDocIds?.includes(x.id));
        if (!d) return r;
        changed = true;
        // The file is read: the card says so and closes, instead of lingering
        // while the follow-up checks finish in the background.
        const n = d.rows?.length ?? 0;
        const result =
          d.status === "Failed"
            ? `Could not be read${d.error ? `: ${d.error}` : ""}`
            : d.status === "Needs review"
              ? `Read: ${n} line${n === 1 ? "" : "s"}, some wait in the Review Queue`
              : n
                ? `Read: ${n} transaction${n === 1 ? "" : "s"}`
                : "Read";
        timers.current.push(setTimeout(() => dismissRun(r.id), d.status === "Failed" ? 12000 : 3500));
        return { ...r, trail: [...(r.trail ?? []), r.stage.replace(/^Uploading securely$/, "Uploaded securely")], status: d.status === "Failed" ? "failed" : "succeeded", result, error: d.status === "Failed" ? d.error ?? "Could not be read" : undefined, finishedAt: Date.now() } as AgentRun;
      });
      return changed ? next : p;
    });
  }, [docs, dismissRun]);

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
  /** A file whose lines are all from another month than the one on screen: say so and offer that month. */
  const warnIfOtherMonth = useCallback((name: string, months: Record<string, number>) => {
    const keys = Object.keys(months);
    if (!keys.length) return;
    let current = "";
    try {
      current = parsePeriod(prefs.current.period).start.slice(0, 7);
    } catch {
      return;
    }
    if (keys.includes(current)) return;
    const [top] = keys.sort((a, b) => months[b] - months[a]);
    const label = new Date(`${top}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const total = keys.reduce((n, k) => n + months[k], 0);
    toast.warning(`${name}: none of its ${total} line${total === 1 ? " is" : "s are"} dated in ${prefs.current.period}. Most are from ${label}.`, {
      description: "Recon and the MIS use the month selected at the top. Switch to the file's month, or check you uploaded the right file.",
      action: { label: `Open ${label}`, onClick: () => choosePeriod(label) },
      duration: 15000,
    });
  }, [choosePeriod]);

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
      if (file.size === 0) {
        toast.error(`${name} is empty.`);
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${name} is larger than 25 MB. Split it or export a smaller range.`);
        return;
      }
      const tempId = uid();
      setDocs((p) => [
        {
          id: tempId,
          name,
          clientId,
          source,
          status: "Uploading",
          date: today(),
          rows: [],
        },
        ...p,
      ]);

      const work = async (setStage: (s: string) => void) => {
        await waitForClient(clientId);
        const fid = firmId.current ?? (await firmReady.current);
        if (!fid) throw new Error("Create your practice first.");
        const path = `${fid}/${clientId}/app/${Date.now()}_${safeName(name)}`;
        setStage("Uploading securely");
        const { error: upErr } = await sb.storage
          .from("ca-client-documents")
          .upload(path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        setDocs((p) =>
          p.map((d) => (d.id === tempId ? { ...d, status: "Processing" } : d)),
        );
        setStage(
          /statement|bank/i.test(name)
            ? "Extract agent is reading the statement"
            : "Extract agent is structuring the document",
        );
        return registerPracticeUpload({
          data: {
            storage_path: path,
            filename: name,
            mime: file.type || null,
            business_id: clientId,
            source,
          },
        });
      };

      void track(
        "extract",
        name,
        tempId,
        {
          stage: "Uploading securely",
          clientId,
          describe: (res) =>
            res.duplicate
              ? "Already received earlier. Nothing was added twice."
              : res.extract_status === "failed"
                ? `Could not be read: ${res.error_message ?? "unknown reason"}`
                : res.register
                  ? `Read as ${res.register.label}: ${res.register.entries} entr${res.register.entries === 1 ? "y" : "ies"}, kept as a register`
                  : `${res.txn_count ?? 0} transaction${res.txn_count === 1 ? "" : "s"} structured${res.review_count ? `, ${res.review_count} sent to Review Queue` : ""}${res.duplicate_count ? `, ${res.duplicate_count} duplicates skipped` : ""}`,
        },
        work,
      )
        .then((res) => {
          // The live Extract card already shows the outcome; only problems also toast.
          if (res.duplicate) {
            const ex = res.existing;
            const open = () => {
              if (ex?.clientId) void router.navigate({ to: "/app/clients/$clientId", params: { clientId: ex.clientId }, search: { tab: "documents", doc: ex.id } as never });
              else void router.navigate({ to: "/app/documents" });
            };
            if (ex && !ex.sameClient && clientId)
              toast.info(
                ex.clientId
                  ? `${name} is already filed under ${ex.clientName ?? "another client"} (as ${ex.filename}, ${ex.at}). Nothing was added twice.`
                  : `${name} is already in Unassigned (as ${ex.filename}). Nothing was added twice.`,
                {
                  duration: 15000,
                  action: { label: "Move it here", onClick: () => void assignDocRef.current?.(ex.id, clientId) },
                  cancel: { label: "Open it", onClick: open },
                },
              );
            else
              toast.info(`${name} was already received${ex?.at ? ` on ${ex.at}` : " earlier"}${ex?.filename && ex.filename !== name ? ` as ${ex.filename}` : ""}. Nothing was added twice.`, {
                duration: 9000,
                ...(ex ? { action: { label: "Open it", onClick: open } } : {}),
              });
          }
          else if (res.extract_status === "failed")
            toast.error(`${name}: ${res.error_message ?? "could not be read"}`);
          else warnIfOtherMonth(name, res.months ?? {});
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
          if (isTimeout(e)) setTimeout(() => void refresh(), 35_000);
        })
        .finally(() => {
          void refresh();
        });
    },
    [refresh, track, waitForClient, warnIfOtherMonth],
  );

  const firmIdReady = useCallback(
    async () => (await firmReady.current) ?? firmId.current,
    [],
  );

  const reprocessDoc = useCallback(
    async (id: string) => {
      if (isRunning("extract", id)) return;
      const doc = docs.find((d) => d.id === id);
      setDocs((p) =>
        p.map((d) =>
          d.id === id ? { ...d, status: "Processing", error: undefined, retryAt: undefined } : d,
        ),
      );
      try {
        await track(
          "extract",
          doc?.name ?? "Document",
          id,
          {
            stage: "Extract agent is reading the document again",
            clientId: doc?.clientId || undefined,
            describe: (r) =>
              r.status === "failed"
                ? `Still could not be read: ${r.error ?? "unknown reason"}${r.retry_at ? ". Another automatic try is scheduled." : ""}`
                : `${r.txns} transactions structured${r.review ? `, ${r.review} sent to Review Queue` : ""}`,
            onRetry: () => void reprocessDoc(id),
          },
          () => reprocessPracticeDocument({ data: { id } }),
        );
      } catch (e) {
        toast.error(errMsg(e));
        if (isTimeout(e)) setTimeout(() => void refresh(), 35_000);
      } finally {
        void refresh();
      }
    },
    [refresh, track, isRunning, docs],
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
  const assignDocRef = useRef(assignDoc);
  assignDocRef.current = assignDoc;

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

  /** Resolves true when the server accepted the decision. */
  const setExceptionStatus = useCallback(
    async (
      id: string,
      status: Exception["status"],
      opts?: {
        action?: "match" | "reconciled_external";
        counterpartIds?: string[];
        note?: string;
        allowDifference?: boolean;
      },
    ) => {
      if (status === "open") return "This line is already open.";
      const ex = exceptions.find((e) => e.id === id);
      const action =
        status === "ignored"
          ? "ignore"
          : (opts?.action ?? "reconciled_external");
      const counterpartIds =
        opts?.counterpartIds ??
        (action === "match" ? ex?.candidateIds?.slice(0, 1) : undefined);
      // The counterpart's own exception closes with it (no twin left open).
      const closing = new Set([id, ...exceptions.filter((e) => e.txnId && counterpartIds?.includes(e.txnId)).map((e) => e.id)]);
      setExceptions((p) => p.map((e) => (closing.has(e.id) ? { ...e, status } : e)));
      try {
        await resolvePracticeException({
          data: { id, action, counterpart_ids: counterpartIds, note: opts?.note, allow_difference: opts?.allowDifference },
        });
        return null;
      } catch (e) {
        setExceptions((p) => p.map((x) => (closing.has(x.id) ? { ...x, status: "open" } : x)));
        const msg = errMsg(e);
        toast.error(msg);
        return msg;
      } finally {
        void refresh();
      }
    },
    [exceptions, refresh],
  );

  const reopenException = useCallback(
    async (id: string) => {
      // Back in the list at once; the server confirms in the background.
      const before = exceptions;
      setExceptions((p) => p.map((e) => (e.id === id ? { ...e, status: "open" } : e)));
      try {
        await reopenPracticeException({ data: { id } });
        toast.success("Undone. The line is back in the queue.");
      } catch (e) {
        setExceptions(before);
        toast.error(errMsg(e));
      } finally {
        void refresh();
      }
    },
    [refresh, exceptions],
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
      if (isRunning("recon", clientId)) {
        toast.info("Recon is already matching this client. It will finish shortly.");
        return;
      }
      void track(
        "recon",
        `Reconciling ${period}`,
        clientId,
        {
          stage: "Recon agent is matching transactions",
          clientId,
          describe: (s) =>
            s.run_id
              ? `${s.matched_total} matched · ${s.exceptions} exception${s.exceptions === 1 ? "" : "s"} with reason codes`
              : s.message,
          onRetry: () => runRecon(clientId, onDone),
        },
        async () => {
          await waitForClient(clientId);
          return runPracticeRecon({ data: { business_id: clientId, period } });
        },
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
    [period, refresh, track, waitForClient, isRunning],
  );

  /** Stage 7 — the partner either accepts the MIS or sends it back. */
  /** Resolves true when signed off; the server refuses open items unless acknowledged. */
  const signOffReport = useCallback(
    async (reportId: string, by: string, opts: { acknowledgeOpen?: boolean; note?: string } = {}) => {
      try {
        await signOffPracticeReport({ data: { id: reportId, by, acknowledge_open: opts.acknowledgeOpen, note: opts.note } });
        // Show the signed-off state at once; the refresh only fills in details.
        setReports((p) => p.map((r) => (r.id === reportId ? { ...r, signedOff: { by, at: new Date().toISOString() }, correction: undefined } : r)));
        toast.success("Report signed off");
        return true;
      } catch (e) {
        toast.error(errMsg(e));
        return false;
      } finally {
        void refresh();
      }
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

  const archiveClient = useCallback(
    async (id: string, reason: string) => {
      try {
        await archivePracticeClient({ data: { id, reason } });
        setClients((p) => p.filter((c) => c.id !== id));
        toast.success("Client archived. Its history is kept.");
        return true;
      } catch (e) {
        toast.error(errMsg(e));
        return false;
      } finally {
        void refresh();
      }
    },
    [refresh],
  );

  const markCorrected = useCallback(
    async (reportId: string, what?: string) => {
      setReports((p) =>
        p.map((r) => (r.id === reportId && r.correction ? { ...r, correction: { ...r.correction, resolvedAt: new Date().toISOString(), resolution: what ?? null } } : r)),
      );
      try {
        await markPracticeReportCorrected({ data: { id: reportId, what } });
        toast.success("Marked corrected. The partner can sign off now.", { duration: 3000 });
        return true;
      } catch (e) {
        toast.error(errMsg(e));
        return false;
      } finally {
        void refresh();
      }
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
      if (isRunning("narrate", clientId)) {
        toast.info("Narrate is already preparing an MIS for this client.");
        return;
      }
      void track(
        "narrate",
        `${template} for ${reportPeriod}`,
        clientId,
        {
          stage: "Narrate agent is preparing MIS from matched transactions",
          clientId,
          describe: (r) =>
            `Ready. ${r.content.insights?.length ?? 0} cited insight${(r.content.insights?.length ?? 0) === 1 ? "" : "s"}; every number is source-traceable.`,
          onRetry: () => generateReport(clientId, reportPeriod, template, onDone),
        },
        async () => {
          await waitForClient(clientId);
          return generatePracticeReport({
            data: { business_id: clientId, period: reportPeriod, template },
          });
        },
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
            otherFlows: c.other_flows as Report["otherFlows"],
            gateway: c.gateway as Report["gateway"],
            decisions: c.decisions as Report["decisions"],
            statutory: c.statutory as Report["statutory"],
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
            email: c.email?.trim() || undefined,
            phone: c.phone || undefined,
            due: c.due || null,
            note: c.note || undefined,
            period,
            channels: c.channel,
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
      if (isRunning("chaser", id)) return;
      const chase = chases.find((c) => c.id === id);
      void track(
        "chaser",
        chase ? `${chase.type} · ${clients.find((c) => c.id === chase.clientId)?.name ?? ""}` : "Follow up",
        id,
        {
          stage: channel === "Email" ? "Chaser is sending follow-up" : "Chaser is logging the WhatsApp follow-up",
          clientId: chase?.clientId,
          describe: (res) =>
            channel === "Email" && "simulated" in res && res.simulated
              ? "Recorded on the timeline. Email is not connected yet, so nothing was sent."
              : channel === "Email"
                ? "Follow-up emailed and logged. The chase stops automatically when the document arrives."
                : "via" in res && res.via === "api"
                  ? "WhatsApp message sent and tracked. The chase stops automatically when the document arrives."
                  : "WhatsApp follow-up logged on the timeline.",
        },
        () => sendPracticeFollowUp({ data: { id, channel } }),
      )
        .then((res) => {
          if (channel === "Email" && "simulated" in res && res.simulated)
            toast.info(
              "Email service is not configured yet, so the follow up was recorded but not sent.",
            );
          else if (channel === "Email") toast.success("Email follow up sent");
          else if ("via" in res && res.via === "api") toast.success("WhatsApp message sent");
          else toast.success("Follow up logged on the timeline");
        })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh, track, isRunning, chases, clients],
  );

  const setChaseStatus = useCallback(
    (id: string, status: Chase["status"], note?: string) => {
      const target: "Resolved" | "Open" | "Escalated" =
        status === "Resolved" ? "Resolved" : status === "Escalated" ? "Escalated" : "Open";
      setChases((p) =>
        p.map((c) => (c.id === id ? { ...c, status: target } : c)),
      );
      void setPracticeChaseStatus({ data: { id, status: target, note } })
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  const snoozeChase = useCallback(
    (id: string, promisedOn: string) => {
      void snoozePracticeChase({ data: { id, promised_on: promisedOn } })
        .then(() => toast.success("Paused. Follow-ups resume the day after the promised date."))
        .catch((e) => toast.error(errMsg(e)))
        .finally(() => {
          void refresh();
        });
    },
    [refresh],
  );

  const agentRunsFor = useCallback(
    (clientId: string) => agentRuns.filter((r) => r.clientId === clientId),
    [agentRuns],
  );
  const isReadyForMis = useCallback(
    (clientId: string, p: string) =>
      readyForMis.some((r) => r.clientId === clientId && r.period === p),
    [readyForMis],
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
      // Only files with lines in this month count for this month's close.
      const range = (() => {
        try {
          return parsePeriod(period);
        } catch {
          return null;
        }
      })();
      const inMonth = (d: Doc) =>
        !range ||
        d.rows.some((r) => r.date >= range.start && r.date <= range.end) ||
        (!d.rows.length && d.date >= range.start && d.date <= range.end);
      const parsed = cDocs.filter(
        (d) => (d.status === "Parsed" || d.status === "Needs review") && inMonth(d),
      );
      const openReview = review.filter(
        (r) => r.clientId === clientId && r.status === "open",
      );
      // The month on screen only: older months' exceptions belong to their own close.
      const openEx = openExceptions(exceptions).filter((e) => e.clientId === clientId && monthOf(e.date) === period);
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
          : cDocs.length
            ? {
                label: `Upload the ${period} documents`,
                why: `No bank statement or books with ${period} entries yet.`,
                tab: "documents",
                action: "upload",
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

  // Any month with data can be opened, however old (not just the last 12).
  const periods = useMemo(() => {
    const keyed = new Map<string, number>();
    PERIODS.forEach((p, i) => {
      const d = new Date();
      keyed.set(p, monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    });
    for (const doc of docs)
      for (const r of doc.rows) {
        if (!r.date) continue;
        const label = monthOf(r.date);
        if (label && !keyed.has(label)) keyed.set(label, monthKey(new Date(`${r.date.slice(0, 10)}T00:00:00`)));
      }
    if (!keyed.has(period)) keyed.set(period, -1);
    return [...keyed.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }, [docs, period]);

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
      isRunning,
      dismissRun,
      addClient,
      updateClient,
      addDoc,
      resolveReview,
      setExceptionStatus,
      reopenException,
      runRecon,
      generateReport,
      addChase,
      sendFollowUp,
      setChaseStatus,
      snoozeChase,
      clientTxns,
      matchedTxns,
      signOffReport,
      requestCorrection,
      markCorrected,
      archiveClient,
      clientName: (id: string) =>
        clients.find((c) => c.id === id)?.name ?? "Unassigned",
      period,
      setPeriod: choosePeriod,
      periods,
      role,
      setRole: chooseRole,
      firmRole,
      canSignOff,
      partnerView: canSignOff && role === "Partner",
      activity,
      activityFor,
      agentRunsFor,
      agentRuns,
      isReadyForMis,
      closeStateFor,
    }),
    [
      firmRole,
      canSignOff,
      isRunning,
      dismissRun,
      agentRunsFor,
      agentRuns,
      isReadyForMis,
      matchedTxns,
      signOffReport,
      requestCorrection,
      markCorrected,
      archiveClient,
      period,
      periods,
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
      reopenException,
      runRecon,
      generateReport,
      addChase,
      sendFollowUp,
      setChaseStatus,
      snoozeChase,
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
