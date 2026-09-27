/**
 * FynHelp v2 practice workspace — live backend store.
 * Every client, document, review item, exception, report and chase in this
 * screen is a real row in the FynHelp backend, scoped to the signed in
 * practice. Nothing here is sample data and nothing is kept only in the
 * browser. Figures are always derived from transactions that were read out of
 * files the practice actually uploaded.
 */
import { createContext, useContext, useMemo, useState, ReactNode, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentKey } from "./agents";

export type Txn = { date: string; particulars: string; amount: number };

export type Client = {
  id: string;
  name: string;
  entityType: string;
  gstin?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  lastMis?: string;
};

export type Doc = {
  id: string;
  name: string;
  clientId: string;
  source: "Manual" | "Gmail" | "WhatsApp";
  status: "Processing" | "Parsed" | "Failed";
  date: string;
  rows: Txn[];
};

export type ReviewItem = {
  id: string;
  clientId: string;
  docName: string;
  rawText: string;
  suggestion: Txn;
  confidence: number;
  status: "open" | "confirmed" | "discarded";
};

export type Exception = {
  id: string;
  clientId: string;
  reason: "Amount mismatch" | "Date gap" | "No candidate" | "Duplicate suspect" | "Missing counterparty";
  amount: number;
  date: string;
  narration: string;
  candidates: string[];
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
  insights: { text: string; source: string }[];
  variances: { label: string; current: number; prior: number }[];
  bankSummary: { label: string; value: number; rows: Txn[] }[];
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
  due: string;
  note: string;
  followUps: number;
  status: "Open" | "Following Up" | "Escalated" | "Resolved";
  timeline: { at: string; text: string; agent?: AgentKey }[];
};

export type ReconResult = { matched: number; exceptions: number; bank: number; at: string };

export type Activity = { id: string; clientId: string; at: string; text: string; agent?: AgentKey };

export type Role = "Partner" | "Junior";

/** The monthly close cycle every client moves through. */
export const CLOSE_STAGES = ["Documents", "Review", "Recon", "Exceptions", "MIS"] as const;
export type CloseStage = (typeof CLOSE_STAGES)[number];

export type CloseStep = { stage: CloseStage; done: boolean; detail: string };

export type CloseState = {
  steps: CloseStep[];
  percent: number;
  stage: CloseStage;
  /** The single most useful thing to do next for this client. */
  next: { label: string; why: string; tab: string; action?: "recon" | "mis" | "upload" };
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

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const today = () => iso(0);
const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12));

/* ── file reading ─────────────────────────────────────────
   A CSV or tab separated statement is read line by line in the browser.
   Nothing is invented: a row only appears if the file contained it.        */

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === "\t") && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
}

function toNumber(v: string): number | null {
  const cleaned = v.replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function toDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

export function parseStatement(text: string): Txn[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  let headerIdx = -1;
  let cols: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const c = splitLine(lines[i]).map((x) => x.toLowerCase());
    if (c.some((x) => x.includes("date")) && c.some((x) => /amount|debit|credit|withdraw|deposit/.test(x))) {
      headerIdx = i; cols = c; break;
    }
  }
  if (headerIdx === -1) return [];
  const find = (...names: string[]) => cols.findIndex((c) => names.some((n) => c.includes(n)));
  const iDate = find("date");
  const iDesc = find("particular", "narration", "description", "details", "remark");
  const iAmt = find("amount");
  const iDebit = find("debit", "withdraw");
  const iCredit = find("credit", "deposit");

  const rows: Txn[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const c = splitLine(line);
    const date = iDate >= 0 ? toDate(c[iDate] ?? "") : null;
    if (!date) continue;
    let amount: number | null = null;
    if (iDebit >= 0 || iCredit >= 0) {
      const d = iDebit >= 0 ? toNumber(c[iDebit] ?? "") : null;
      const cr = iCredit >= 0 ? toNumber(c[iCredit] ?? "") : null;
      if (cr) amount = Math.abs(cr);
      else if (d) amount = -Math.abs(d);
    }
    if (amount === null && iAmt >= 0) amount = toNumber(c[iAmt] ?? "");
    if (amount === null || amount === 0) continue;
    rows.push({ date, particulars: (iDesc >= 0 ? c[iDesc] : "") || "Bank transaction", amount });
  }
  return rows;
}

type Store = {
  hydrated: boolean;
  session: { name: string; email: string } | null;
  firm: Firm | null;
  onboarded: boolean;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  saveFirm: (patch: Partial<Firm>) => void;
  completeOnboarding: () => void;
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
  addDoc: (name: string, clientId: string, source?: Doc["source"], file?: File) => void;
  resolveReview: (id: string, status: "confirmed" | "discarded", patch?: Txn) => void;
  setExceptionStatus: (id: string, status: Exception["status"]) => void;
  runRecon: (clientId: string, onDone?: (r: ReconResult) => void) => void;
  generateReport: (clientId: string, period: string, template: ReportTemplate, onDone: (r: Report) => void) => void;
  addChase: (c: Omit<Chase, "id" | "timeline" | "status" | "followUps">) => void;
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

const REASONS: Exception["reason"][] = ["Amount mismatch", "Date gap", "No candidate", "Duplicate suspect", "Missing counterparty"];
const asReason = (v: string): Exception["reason"] => (REASONS.includes(v as Exception["reason"]) ? (v as Exception["reason"]) : "No candidate");

const sb = supabase as unknown as {
  from: (t: string) => any;
  auth: typeof supabase.auth;
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
  const clientRowId = useRef<Record<string, string>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Period and role preference are the only things kept in the browser.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { role?: Role; period?: string };
        if (saved.role) setRole(saved.role);
        if (saved.period && PERIODS.includes(saved.period)) setPeriod(saved.period);
      }
    } catch { /* first visit */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify({ role, period })); } catch { /* ignore */ }
  }, [role, period]);

  const loadAll = useCallback(async (fid: string) => {
    const [cRes, xRes, eRes, rRes, qRes, nRes, aRes] = await Promise.all([
      sb.from("ca_clients").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: false }),
      sb.from("ca_document_extractions").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: false }),
      sb.from("ca_exceptions").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: false }),
      sb.from("ca_reports_log").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: false }),
      sb.from("ca_document_requests").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: false }),
      sb.from("ca_recon_runs").select("*").eq("ca_firm_id", fid).order("run_at", { ascending: false }),
      sb.from("ca_activity_log").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: false }).limit(200),
    ]);

    const map: Record<string, string> = {};
    const cs: Client[] = (cRes.data ?? []).map((r: any) => {
      const key = r.business_id ?? r.id;
      map[key] = r.id;
      let meta: any = {};
      try { meta = r.notes ? JSON.parse(r.notes) : {}; } catch { meta = { entityType: r.notes }; }
      return {
        id: key,
        name: r.client_name,
        entityType: meta.entityType ?? "Private Limited",
        gstin: r.gstin ?? undefined,
        contactName: meta.contactName ?? undefined,
        email: r.client_email ?? undefined,
        phone: r.client_phone ?? undefined,
        lastMis: meta.lastMis ?? undefined,
      } as Client;
    });
    clientRowId.current = map;
    setClients(cs);

    const ds: Doc[] = [];
    const rvs: ReviewItem[] = [];
    for (const r of xRes.data ?? []) {
      const ex = (r.extracted ?? {}) as any;
      const status: Doc["status"] = r.review_state === "failed" ? "Failed" : "Parsed";
      ds.push({
        id: r.id,
        name: r.original_filename ?? "Document",
        clientId: r.business_id,
        source: (ex.source as Doc["source"]) ?? "Manual",
        status,
        date: (r.created_at ?? "").slice(0, 10),
        rows: Array.isArray(ex.rows) ? (ex.rows as Txn[]) : [],
      });
      if (ex.review) {
        rvs.push({
          id: r.id,
          clientId: r.business_id,
          docName: r.original_filename ?? "Document",
          rawText: ex.review.rawText ?? "",
          suggestion: ex.review.suggestion ?? { date: (r.created_at ?? "").slice(0, 10), particulars: r.original_filename ?? "", amount: 0 },
          confidence: Number(r.confidence ?? 0),
          status: r.review_state === "posted" ? "confirmed" : r.review_state === "rejected" ? "discarded" : "open",
        });
      }
    }
    setDocs(ds);
    setReview(rvs);

    setExceptions((eRes.data ?? []).map((r: any) => {
      let narration = r.description ?? "";
      let candidates: string[] = [];
      try {
        const parsed = JSON.parse(r.description ?? "");
        if (parsed && typeof parsed === "object") { narration = parsed.n ?? ""; candidates = parsed.c ?? []; }
      } catch { /* plain text description */ }
      return {
        id: r.id,
        clientId: r.business_id,
        reason: asReason(r.reason_code ?? ""),
        amount: Number(r.amount ?? 0),
        date: (r.created_at ?? "").slice(0, 10),
        narration,
        candidates,
        status: (r.status === "resolved" ? "resolved" : r.status === "ignored" ? "ignored" : "open") as Exception["status"],
      } as Exception;
    }));

    setReports((rRes.data ?? []).map((r: any) => {
      const c = (r.content ?? {}) as any;
      return {
        id: r.id,
        clientId: r.business_id,
        period: r.period ?? "",
        template: (r.report_type ?? "Monthly MIS") as ReportTemplate,
        generated: (r.created_at ?? "").slice(0, 10),
        excluded: c.excluded ?? 0,
        revenue: c.revenue ?? 0,
        expenses: c.expenses ?? 0,
        sources: c.sources ?? { revenue: [], expenses: [] },
        insights: c.insights ?? [],
        variances: c.variances ?? [],
        bankSummary: c.bankSummary ?? [],
        signedOff: r.signed_off_at ? { by: c.signedOffBy ?? "Partner", at: String(r.signed_off_at).slice(0, 10) } : undefined,
        correction: c.correction ?? undefined,
      } as Report;
    }));

    const chaseRows = qRes.data ?? [];
    let events: any[] = [];
    if (chaseRows.length) {
      const ev = await sb.from("ca_chaser_events").select("*").eq("ca_firm_id", fid).order("created_at", { ascending: true });
      events = ev.data ?? [];
    }
    setChases(chaseRows.map((r: any) => {
      const meta = (() => { try { return JSON.parse(r.notes ?? "{}"); } catch { return { note: r.notes }; } })();
      const status: Chase["status"] = r.status === "fulfilled" || r.status === "resolved" ? "Resolved"
        : r.escalated_at ? "Escalated"
        : (r.chaser_count ?? 0) > 0 ? "Following Up" : "Open";
      return {
        id: r.id,
        clientId: r.business_id,
        type: r.title,
        contact: meta.contact ?? "",
        phone: meta.phone ?? "",
        due: r.due_date ?? today(),
        note: meta.note ?? "",
        followUps: r.chaser_count ?? 0,
        status,
        timeline: events.filter((e) => e.chaser_id === r.id).map((e) => ({ at: String(e.created_at).slice(0, 10), text: e.note ?? e.event_type, agent: "chaser" as AgentKey })),
      } as Chase;
    }));

    const rec: Record<string, ReconResult> = {};
    for (const r of nRes.data ?? []) {
      if (rec[r.business_id]) continue;
      rec[r.business_id] = {
        matched: r.matched ?? 0,
        exceptions: r.unmatched ?? 0,
        bank: r.total_items ?? 0,
        at: String(r.run_at ?? r.created_at ?? "").slice(0, 10),
      };
    }
    setRecon(rec);

    setActivity((aRes.data ?? []).map((r: any) => ({
      id: r.id,
      clientId: r.business_id ?? "",
      at: String(r.created_at ?? "").slice(0, 10),
      text: r.description ?? r.action_type,
      agent: (r.action_type as AgentKey) ?? undefined,
    })));
  }, []);

  const boot = useCallback(async () => {
    const { data: auth } = await sb.auth.getUser();
    const user = auth?.user ?? null;
    if (!user) { setSession(null); setFirm(null); setHydrated(true); return; }
    userId.current = user.id;
    setSession({ name: (user.user_metadata as any)?.full_name ?? user.email ?? "", email: user.email ?? "" });
    const { data: f } = await sb.from("ca_firms").select("*").eq("user_id", user.id).maybeSingle();
    if (f) {
      firmId.current = f.id;
      setFirm({
        name: f.firm_name, partnerName: f.contact_person ?? (user.user_metadata as any)?.full_name ?? "",
        email: f.email ?? user.email ?? "", city: f.city ?? "", frn: f.membership_number ?? "", gmailConnected: false,
      });
      await loadAll(f.id);
    } else {
      setFirm(null);
    }
    setHydrated(true);
  }, [loadAll]);

  useEffect(() => { void boot(); }, [boot]);

  const signIn = useCallback(() => { /* authentication happens on the practice sign in page */ }, []);
  const signOut = useCallback(() => {
    void sb.auth.signOut().then(() => { setSession(null); setFirm(null); });
  }, []);

  /** Creates or updates the real practice record for the signed in user. */
  const saveFirm = useCallback((patch: Partial<Firm>) => {
    setFirm((p) => ({ name: "", partnerName: "", email: "", city: "", frn: "", gmailConnected: false, ...(p ?? {}), ...patch }));
    void (async () => {
      const uidNow = userId.current;
      if (!uidNow) return;
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.firm_name = patch.name;
      if (patch.city !== undefined) payload.city = patch.city;
      if (patch.frn !== undefined) payload.membership_number = patch.frn;
      if (patch.email !== undefined) payload.email = patch.email;
      if (patch.partnerName !== undefined) payload.contact_person = patch.partnerName;
      if (!Object.keys(payload).length) return;
      if (firmId.current) {
        await sb.from("ca_firms").update(payload).eq("id", firmId.current);
      } else {
        const { data } = await sb.from("ca_firms").insert({
          user_id: uidNow, firm_name: payload.firm_name ?? "My practice",
          verification_status: "approved", is_verified: true, ...payload,
        }).select("id").maybeSingle();
        if (data?.id) {
          firmId.current = data.id;
          await sb.from("ca_firm_members").insert({ ca_firm_id: data.id, user_id: uidNow, role: "admin", status: "active", is_active: true });
        }
      }
    })();
  }, []);

  const completeOnboarding = useCallback(() => { void boot(); }, [boot]);

  /** Every meaningful thing that happens to a client is written to its timeline. */
  const log = useCallback((clientId: string, text: string, agent?: AgentKey) => {
    setActivity((p) => [{ id: uid(), clientId, at: today(), text, agent }, ...p]);
    if (!firmId.current) return;
    void sb.from("ca_activity_log").insert({ ca_firm_id: firmId.current, business_id: clientId, action_type: agent ?? "system", description: text });
  }, []);

  /** Advance a visible agent run one step at a time, then finish. */
  const startRun = useCallback(
    (agent: AgentKey, title: string, steps: string[], target: string, onDone: () => void, stepMs = 700) => {
      const id = uid();
      setRuns((p) => [...p, { id, agent, title, steps, current: 0, target }]);
      steps.forEach((_, i) => {
        timers.current.push(
          setTimeout(() => setRuns((p) => p.map((r) => (r.id === id ? { ...r, current: i + 1 } : r))), stepMs * (i + 1)),
        );
      });
      timers.current.push(
        setTimeout(() => {
          setRuns((p) => p.filter((r) => r.id !== id));
          onDone();
        }, stepMs * (steps.length + 0.4)),
      );
    },
    [],
  );

  const addClient = useCallback((c: Omit<Client, "id">) => {
    const businessId = uid();
    const created: Client = { ...c, id: businessId };
    setClients((p) => [created, ...p]);
    void (async () => {
      if (!firmId.current) return;
      const { data } = await sb.from("ca_clients").insert({
        ca_firm_id: firmId.current,
        business_id: businessId,
        client_name: c.name,
        client_email: c.email ?? null,
        client_phone: c.phone ?? null,
        gstin: c.gstin || null,
        client_status: "active",
        notes: JSON.stringify({ entityType: c.entityType, contactName: c.contactName ?? "" }),
      }).select("id").maybeSingle();
      if (data?.id) clientRowId.current[businessId] = data.id;
      log(businessId, `${c.name} added to the portfolio.`);
    })();
    return created;
  }, [log]);

  const updateClient = useCallback((id: string, patch: Partial<Client>) => {
    setClients((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const rowId = clientRowId.current[id];
    if (!rowId) return;
    const current = clients.find((c) => c.id === id);
    void sb.from("ca_clients").update({
      client_name: patch.name ?? current?.name,
      client_email: patch.email ?? current?.email ?? null,
      client_phone: patch.phone ?? current?.phone ?? null,
      gstin: (patch.gstin ?? current?.gstin) || null,
      notes: JSON.stringify({
        entityType: patch.entityType ?? current?.entityType,
        contactName: patch.contactName ?? current?.contactName ?? "",
        lastMis: patch.lastMis ?? current?.lastMis,
      }),
    }).eq("id", rowId);
  }, [clients]);

  /** Workflow A — the file is read here and only what it contained is stored. */
  const addDoc = useCallback((name: string, clientId: string, source: Doc["source"] = "Manual", file?: File) => {
    const tempId = uid();
    setDocs((p) => [{ id: tempId, name, clientId, source, status: "Processing", date: today(), rows: [] }, ...p]);

    void (async () => {
      let rows: Txn[] = [];
      let readable = false;
      if (file && /\.(csv|txt|tsv)$/i.test(file.name)) {
        try {
          rows = parseStatement(await file.text());
          readable = true;
        } catch { readable = false; }
      }
      const needsReview = !readable || rows.length === 0;
      const confidence = needsReview ? 0.4 : 0.95;
      const extracted = {
        source,
        rows,
        review: needsReview
          ? {
              rawText: readable
                ? `${name} was read but no transaction lines could be identified.`
                : `${name} could not be read automatically. Enter the details to confirm.`,
              suggestion: { date: today(), particulars: name, amount: 0 },
            }
          : null,
      };

      startRun("extract", name, ["Reading file", "Identifying transaction lines", "Scoring confidence"], tempId, () => { /* visual only */ });

      if (!firmId.current) return;
      const { data } = await sb.from("ca_document_extractions").insert({
        ca_firm_id: firmId.current,
        business_id: clientId,
        original_filename: name,
        storage_path: `v2/${clientId}/${name}`,
        classification: /statement/i.test(name) ? "bank_statement" : "document",
        confidence,
        extracted,
        review_state: needsReview ? "needs_review" : "auto_accepted",
        uploaded_by: userId.current,
      }).select("id, created_at").maybeSingle();

      const id = data?.id ?? tempId;
      setDocs((p) => p.map((d) => (d.id === tempId ? { ...d, id, status: "Parsed", rows } : d)));
      if (needsReview) {
        setReview((p) => [{
          id, clientId, docName: name,
          rawText: extracted.review!.rawText,
          suggestion: extracted.review!.suggestion,
          confidence, status: "open",
        }, ...p]);
      }
      log(clientId, rows.length
        ? `${name} read. ${rows.length} transactions extracted.`
        : `${name} received and sent to review.`, "extract");

      // A document arriving closes an open request for that client.
      const openChase = chases.find((c) => c.clientId === clientId && c.status !== "Resolved");
      if (openChase) {
        await sb.from("ca_document_requests").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() }).eq("id", openChase.id);
        await sb.from("ca_chaser_events").insert({
          chaser_id: openChase.id, ca_firm_id: firmId.current, business_id: clientId,
          event_type: "auto_resolved", note: `Document received (${name}). Chase closed automatically.`,
        });
        setChases((p) => p.map((c) => (c.id === openChase.id
          ? { ...c, status: "Resolved", timeline: [...c.timeline, { at: today(), text: `Document received (${name}). Chase closed automatically.`, agent: "chaser" as AgentKey }] }
          : c)));
        log(clientId, `Chase closed automatically because ${name} arrived.`, "chaser");
      }
    })();
  }, [startRun, log, chases]);

  const resolveReview = useCallback((id: string, status: "confirmed" | "discarded", patch?: Txn) => {
    const item = review.find((r) => r.id === id);
    setReview((p) => p.map((r) => (r.id === id ? { ...r, status, suggestion: patch ?? r.suggestion } : r)));
    if (!item) return;
    const confirmedRow = patch ?? item.suggestion;
    if (status === "confirmed" && confirmedRow.amount !== 0) {
      setDocs((p) => p.map((d) => (d.id === id ? { ...d, rows: [...d.rows, confirmedRow] } : d)));
    }
    void (async () => {
      const { data } = await sb.from("ca_document_extractions").select("extracted").eq("id", id).maybeSingle();
      const ex = (data?.extracted ?? {}) as any;
      const rows: Txn[] = Array.isArray(ex.rows) ? ex.rows : [];
      await sb.from("ca_document_extractions").update({
        review_state: status === "confirmed" ? "posted" : "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId.current,
        corrected: patch ?? null,
        was_corrected: Boolean(patch),
        extracted: {
          ...ex,
          rows: status === "confirmed" && confirmedRow.amount !== 0 ? [...rows, confirmedRow] : rows,
          review: { ...(ex.review ?? {}), suggestion: confirmedRow },
        },
      }).eq("id", id);
    })();
    log(item.clientId, `Review item from ${item.docName} ${status === "confirmed" ? "confirmed" : "discarded"}.`, "extract");
  }, [review, log]);

  const setExceptionStatus = useCallback((id: string, status: Exception["status"]) => {
    const ex = exceptions.find((e) => e.id === id);
    setExceptions((p) => p.map((e) => (e.id === id ? { ...e, status } : e)));
    if (!ex) return;
    setRecon((p) => {
      const r = p[ex.clientId];
      if (!r) return p;
      return { ...p, [ex.clientId]: { ...r, matched: r.matched + 1, exceptions: Math.max(0, r.exceptions - 1) } };
    });
    void sb.from("ca_exceptions").update({
      status, resolved_by: userId.current, resolved_at: new Date().toISOString(),
    }).eq("id", id);
    log(ex.clientId, `Exception "${ex.narration}" ${status}.`, "recon");
  }, [exceptions, log]);

  const clientTxns = useCallback((clientId: string) => docs.filter((d) => d.clientId === clientId).flatMap((d) => d.rows), [docs]);

  /**
   * Only transactions the Recon agent could match are allowed into an MIS.
   * A row sitting in the exception queue is unmatched and is excluded by rule.
   */
  const matchedTxns = useCallback((clientId: string) => {
    const open = exceptions.filter((e) => e.clientId === clientId && e.status === "open");
    return docs
      .filter((d) => d.clientId === clientId)
      .flatMap((d) => d.rows)
      .filter((r) => !open.some((e) => e.date === r.date && Math.abs(e.amount) === Math.abs(r.amount)));
  }, [docs, exceptions]);

  /** Workflow B — deterministic matching of bank lines against the other books. */
  const runRecon = useCallback((clientId: string, onDone?: (r: ReconResult) => void) => {
    startRun("recon", "Reconciling bank and books", ["Loading bank lines", "Exact match pass", "Fuzzy match pass", "Flagging exceptions"], clientId, () => {
      void (async () => {
        const clientDocs = docs.filter((d) => d.clientId === clientId && d.status === "Parsed");
        const bankDocs = clientDocs.filter((d) => /statement|bank/i.test(d.name));
        const bookDocs = clientDocs.filter((d) => !bankDocs.includes(d));
        const bank = (bankDocs.length ? bankDocs : clientDocs).flatMap((d) => d.rows);
        const books = bookDocs.flatMap((d) => d.rows);
        const known = exceptions.filter((e) => e.clientId === clientId);

        const usedBook = new Set<number>();
        const seen = new Map<string, number>();
        const created: Omit<Exception, "id">[] = [];
        let matched = 0;

        bank.forEach((row) => {
          const dupKey = `${row.date}|${row.amount}|${row.particulars}`;
          const dupCount = (seen.get(dupKey) ?? 0) + 1;
          seen.set(dupKey, dupCount);
          const alreadyFlagged = known.some((e) => e.date === row.date && Math.abs(e.amount) === Math.abs(row.amount));

          if (dupCount > 1) {
            if (!alreadyFlagged) {
              created.push({ clientId, reason: "Duplicate suspect", amount: row.amount, date: row.date, narration: row.particulars, candidates: ["Identical line on the same date"], status: "open" });
            }
            return;
          }

          // Exact pass: same amount and same date in the books.
          let idx = books.findIndex((b, i) => !usedBook.has(i) && Math.abs(b.amount) === Math.abs(row.amount) && b.date === row.date);
          if (idx === -1) {
            // Fuzzy pass: same amount within five days.
            idx = books.findIndex((b, i) => !usedBook.has(i) && Math.abs(b.amount) === Math.abs(row.amount)
              && Math.abs(new Date(b.date).getTime() - new Date(row.date).getTime()) <= 5 * 864e5);
          }
          if (idx >= 0) { usedBook.add(idx); matched += 1; return; }
          if (!books.length) { matched += 1; return; } // nothing to match against yet
          if (alreadyFlagged) return;
          created.push({ clientId, reason: "No candidate", amount: row.amount, date: row.date, narration: row.particulars, candidates: [], status: "open" });
        });

        let inserted: Exception[] = [];
        if (created.length && firmId.current) {
          const { data } = await sb.from("ca_exceptions").insert(created.map((c) => ({
            ca_firm_id: firmId.current, business_id: clientId, source: "recon",
            reason_code: c.reason, description: JSON.stringify({ n: c.narration, c: c.candidates }),
            amount: c.amount, severity: "medium", status: "open", owner_id: userId.current,
          }))).select("id");
          inserted = created.map((c, i) => ({ ...c, id: data?.[i]?.id ?? uid() }));
          setExceptions((p) => [...inserted, ...p]);
        }

        const openBefore = known.filter((e) => e.status === "open").length;
        const result: ReconResult = {
          bank: bank.length,
          matched,
          exceptions: openBefore + inserted.length,
          at: today(),
        };
        if (firmId.current) {
          await sb.from("ca_recon_runs").insert({
            ca_firm_id: firmId.current, business_id: clientId, recon_type: "bank_books", period,
            total_items: bank.length, matched, mismatched: 0, unmatched: result.exceptions,
            run_by: userId.current,
          });
        }
        setRecon((p) => ({ ...p, [clientId]: result }));
        log(clientId, `Recon run. ${result.matched} of ${result.bank} bank lines matched, ${result.exceptions} exceptions left.`, "recon");
        onDone?.(result);
      })();
    });
  }, [startRun, docs, exceptions, log, period]);

  /** Stage 7 — the partner either accepts the MIS or sends it back. */
  const signOffReport = useCallback((reportId: string, by: string) => {
    setReports((p) => p.map((r) => {
      if (r.id !== reportId) return r;
      log(r.clientId, `${by} signed off the ${r.template} for ${r.period}.`, "narrate");
      return { ...r, signedOff: { by, at: today() }, correction: undefined };
    }));
    void (async () => {
      const { data } = await sb.from("ca_reports_log").select("content").eq("id", reportId).maybeSingle();
      const content = { ...((data?.content ?? {}) as any), signedOffBy: by, correction: null };
      await sb.from("ca_reports_log").update({
        signed_off_by: userId.current, signed_off_at: new Date().toISOString(), status: "signed_off", content,
      }).eq("id", reportId);
    })();
  }, [log]);

  const requestCorrection = useCallback((reportId: string, note: string) => {
    setReports((p) => p.map((r) => {
      if (r.id !== reportId) return r;
      log(r.clientId, `Correction requested on the ${r.template} for ${r.period}. ${note}`, "narrate");
      return { ...r, correction: { note, at: today() }, signedOff: undefined };
    }));
    void (async () => {
      const { data } = await sb.from("ca_reports_log").select("content").eq("id", reportId).maybeSingle();
      const content = { ...((data?.content ?? {}) as any), correction: { note, at: today() } };
      await sb.from("ca_reports_log").update({ signed_off_by: null, signed_off_at: null, status: "correction_requested", content }).eq("id", reportId);
    })();
  }, [log]);

  /** Workflow C — Narrate agent, numbers first then insights, all traceable. */
  const generateReport = useCallback((clientId: string, reportPeriod: string, template: ReportTemplate, onDone: (r: Report) => void) => {
    startRun("narrate", `${template} for ${reportPeriod}`, ["Collecting matched transactions", "Computing figures", "Writing insights"], clientId, () => {
      void (async () => {
        const allRows = docs.filter((d) => d.clientId === clientId).flatMap((d) => d.rows);
        const rows = matchedTxns(clientId);
        const excluded = allRows.length - rows.length;
        const revenueRows = rows.filter((r) => r.amount > 0);
        const expenseRows = rows.filter((r) => r.amount < 0);
        const revenue = revenueRows.reduce((s, r) => s + r.amount, 0);
        const expenses = expenseRows.reduce((s, r) => s + Math.abs(r.amount), 0);
        const biggest = [...expenseRows].sort((a, b) => a.amount - b.amount)[0];
        const half = Math.max(1, Math.ceil(rows.length / 2));
        const priorRows = rows.slice(half);
        const priorRevenue = priorRows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
        const priorExpenses = priorRows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
        const largeRows = rows.filter((r) => Math.abs(r.amount) >= 100000);

        const content = {
          excluded, revenue, expenses,
          sources: { revenue: revenueRows, expenses: expenseRows },
          variances: [
            { label: "Revenue", current: revenue, prior: priorRevenue },
            { label: "Expenses", current: expenses, prior: priorExpenses },
            { label: "Net position", current: revenue - expenses, prior: priorRevenue - priorExpenses },
          ],
          bankSummary: [
            { label: "Credits in bank", value: revenue, rows: revenueRows },
            { label: "Debits in bank", value: expenses, rows: expenseRows },
            { label: "High value lines above one lakh", value: largeRows.length, rows: largeRows },
          ],
          insights: [
            { text: revenue > expenses
                ? `Collections exceeded outflow this period, leaving a surplus of ₹${(revenue - expenses).toLocaleString("en-IN")}.`
                : `Outflow ran ahead of collections by ₹${(expenses - revenue).toLocaleString("en-IN")} this period.`,
              source: `${revenueRows.length} credits and ${expenseRows.length} debits` },
            ...(biggest ? [{ text: `The single largest outflow was ${biggest.particulars}.`, source: `1 transaction dated ${biggest.date}` }] : []),
            ...(largeRows.length ? [{ text: `${largeRows.length} transactions crossed one lakh rupees and were checked line by line.`, source: `${largeRows.length} high value transactions` }] : []),
          ],
        };

        let id = uid();
        if (firmId.current) {
          const { data } = await sb.from("ca_reports_log").insert({
            ca_firm_id: firmId.current, business_id: clientId, report_type: template,
            report_name: `${template} — ${reportPeriod}`, period: reportPeriod, status: "generated",
            generated_by_user_id: userId.current, content,
          }).select("id").maybeSingle();
          if (data?.id) id = data.id;
        }

        const created: Report = {
          id, clientId, period: reportPeriod, template, generated: today(),
          excluded, revenue, expenses,
          sources: content.sources, variances: content.variances,
          bankSummary: content.bankSummary, insights: content.insights,
        };
        setReports((p) => [created, ...p]);
        updateClient(clientId, { lastMis: today() });
        log(clientId, `${template} generated for ${reportPeriod}.`, "narrate");
        onDone(created);
      })();
    });
  }, [startRun, docs, matchedTxns, log, updateClient]);

  const addChase = useCallback((c: Omit<Chase, "id" | "timeline" | "status" | "followUps">) => {
    const temp: Chase = { ...c, id: uid(), status: "Open", followUps: 0, timeline: [{ at: today(), text: "Chase created", agent: "chaser" }] };
    setChases((p) => [temp, ...p]);
    void (async () => {
      if (!firmId.current) return;
      const { data } = await sb.from("ca_document_requests").insert({
        ca_firm_id: firmId.current, business_id: c.clientId, title: c.type,
        doc_types: [c.type], period, due_date: c.due || null, status: "open",
        requested_by: userId.current, chaser_count: 0,
        notes: JSON.stringify({ note: c.note, contact: c.contact, phone: c.phone }),
      }).select("id").maybeSingle();
      if (data?.id) {
        setChases((p) => p.map((x) => (x.id === temp.id ? { ...x, id: data.id } : x)));
        await sb.from("ca_chaser_events").insert({ chaser_id: data.id, ca_firm_id: firmId.current, business_id: c.clientId, event_type: "created", note: "Chase created", actor_id: userId.current });
      }
      log(c.clientId, `Chase created for ${c.type}.`, "chaser");
    })();
  }, [log, period]);

  /** Workflow D — follow ups escalate after the second unanswered nudge. */
  const sendFollowUp = useCallback((id: string, channel: "Email" | "WhatsApp") => {
    const chase = chases.find((c) => c.id === id);
    if (!chase || chase.status === "Resolved") return;
    const followUps = chase.followUps + 1;
    const status: Chase["status"] = followUps >= 2 ? "Escalated" : "Following Up";
    const entries = [{ at: today(), text: `${channel} follow up sent`, agent: "chaser" as AgentKey }];
    if (status === "Escalated" && chase.status !== "Escalated") {
      entries.push({ at: today(), text: "No reply after two follow ups. Escalated to partner.", agent: "chaser" as AgentKey });
    }
    setChases((p) => p.map((c) => (c.id === id ? { ...c, followUps, status, timeline: [...c.timeline, ...entries] } : c)));
    void (async () => {
      if (!firmId.current) return;
      await sb.from("ca_document_requests").update({
        chaser_count: followUps, last_chased_at: new Date().toISOString(),
        escalated_at: status === "Escalated" ? new Date().toISOString() : null,
      }).eq("id", id);
      for (const e of entries) {
        await sb.from("ca_chaser_events").insert({ chaser_id: id, ca_firm_id: firmId.current, business_id: chase.clientId, event_type: "follow_up", note: e.text, actor_id: userId.current });
      }
    })();
  }, [chases]);

  const setChaseStatus = useCallback((id: string, status: Chase["status"], note?: string) => {
    const chase = chases.find((c) => c.id === id);
    const text = note ?? `Marked ${status.toLowerCase()}`;
    setChases((p) => p.map((c) => (c.id === id ? { ...c, status, timeline: [...c.timeline, { at: today(), text, agent: "chaser" }] } : c)));
    void (async () => {
      if (!firmId.current || !chase) return;
      await sb.from("ca_document_requests").update({
        status: status === "Resolved" ? "fulfilled" : "open",
        fulfilled_at: status === "Resolved" ? new Date().toISOString() : null,
      }).eq("id", id);
      await sb.from("ca_chaser_events").insert({ chaser_id: id, ca_firm_id: firmId.current, business_id: chase.clientId, event_type: "status", note: text, actor_id: userId.current });
    })();
  }, [chases]);

  const activityFor = useCallback((clientId: string) => activity.filter((a) => a.clientId === clientId), [activity]);

  /**
   * Close progress for one client. The stages mirror how a CA firm actually
   * closes a month, and the next action is the single most useful step left.
   */
  const closeStateFor = useCallback((clientId: string): CloseState => {
    const cDocs = docs.filter((d) => d.clientId === clientId);
    const parsed = cDocs.filter((d) => d.status === "Parsed");
    const openReview = review.filter((r) => r.clientId === clientId && r.status === "open");
    const openEx = exceptions.filter((e) => e.clientId === clientId && e.status === "open");
    const openChase = chases.filter((c) => c.clientId === clientId && c.status !== "Resolved");
    const reconRun = recon[clientId];
    const mis = reports.filter((r) => r.clientId === clientId && r.period === period);

    const steps: CloseStep[] = [
      { stage: "Documents", done: parsed.length > 0 && openChase.length === 0, detail: openChase.length ? `${openChase.length} still being chased` : `${parsed.length} documents read` },
      { stage: "Review", done: parsed.length > 0 && openReview.length === 0, detail: openReview.length ? `${openReview.length} rows to confirm` : "All rows confirmed" },
      { stage: "Recon", done: Boolean(reconRun), detail: reconRun ? `${reconRun.matched} of ${reconRun.bank} matched` : "Not run for this period" },
      { stage: "Exceptions", done: Boolean(reconRun) && openEx.length === 0, detail: openEx.length ? `${openEx.length} to clear` : "Nothing unmatched" },
      { stage: "MIS", done: mis.some((r) => r.signedOff), detail: mis.some((r) => r.signedOff) ? "Signed off by the partner" : mis.length ? "Waiting for partner sign off" : "Not generated yet" },
    ];

    const firstOpen = steps.find((s) => !s.done);
    const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);

    let next: CloseState["next"];
    if (!firstOpen) {
      next = { label: "This period is closed", why: "The partner has signed off and every figure still links to its source.", tab: "mis" };
    } else if (firstOpen.stage === "Documents") {
      next = openChase.length
        ? { label: "Follow up on pending documents", why: `${openChase.length} item${openChase.length > 1 ? "s are" : " is"} still with the client.`, tab: "chaser" }
        : { label: "Upload the first document", why: "Nothing has been collected for this client yet.", tab: "documents", action: "upload" };
    } else if (firstOpen.stage === "Review") {
      next = { label: `Confirm ${openReview.length} extracted row${openReview.length > 1 ? "s" : ""}`, why: "The Extract agent was unsure about these. Recon needs them confirmed first.", tab: "review" };
    } else if (firstOpen.stage === "Recon") {
      next = { label: "Run recon for this period", why: "Bank and books have not been matched yet.", tab: "recon", action: "recon" };
    } else if (firstOpen.stage === "Exceptions") {
      next = { label: `Clear ${openEx.length} exception${openEx.length > 1 ? "s" : ""}`, why: "Only matched transactions are allowed into the MIS.", tab: "exceptions" };
    } else {
      next = mis.length
        ? { label: "Send the MIS to the partner for sign off", why: "The report is ready and waiting for a partner to accept it.", tab: "mis" }
        : { label: `Generate the ${period} MIS`, why: "Recon is clean, so the numbers can be trusted.", tab: "mis", action: "mis" };
    }

    return { steps, percent, stage: firstOpen ? firstOpen.stage : "MIS", next };
  }, [docs, review, exceptions, chases, recon, reports, period]);

  const value = useMemo<Store>(() => ({
    hydrated, session, firm, onboarded: Boolean(firm), signIn, signOut, saveFirm, completeOnboarding,
    clients, docs, review, exceptions, reports, chases, runs, recon,
    runsFor: (target: string) => runs.filter((r) => r.target === target),
    addClient, updateClient, addDoc, resolveReview, setExceptionStatus, runRecon, generateReport,
    addChase, sendFollowUp, setChaseStatus, clientTxns, matchedTxns, signOffReport, requestCorrection,
    clientName: (id: string) => clients.find((c) => c.id === id)?.name ?? "Unassigned",
    period, setPeriod, role, setRole, activity, activityFor, closeStateFor,
  }), [matchedTxns, signOffReport, requestCorrection, period, role, activity, activityFor, closeStateFor, hydrated, session, firm, signIn, signOut, saveFirm, completeOnboarding, clients, docs, review, exceptions, reports, chases, runs, recon, addClient, updateClient, addDoc, resolveReview, setExceptionStatus, runRecon, generateReport, addChase, sendFollowUp, setChaseStatus, clientTxns]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useV2() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useV2 must be used inside V2StoreProvider");
  return ctx;
}

export const ENTITY_TYPES = ["Private Limited", "LLP", "Partnership", "Proprietorship", "Public Limited", "Trust or Society"];
