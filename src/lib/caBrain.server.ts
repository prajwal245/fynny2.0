/**
 * FynHelp CA Learning Brain — server-only learning modules.
 *
 * PRIVACY ARCHITECTURE (hard requirement, not a preference):
 *   Learning happens at three levels only —
 *     1. FIRM level    — aggregated patterns for THIS firm's clients only
 *     2. CLIENT level  — patterns for THIS firm + THIS client only
 *     3. PROVISION     — weighted by THIS firm's own action/dismiss history
 *
 *   Every query below is scoped with ca_firm_id (and business_id where the
 *   output is client-level). Only statistical values — counts, averages,
 *   ratios, thresholds — are ever persisted. No amounts, names, GSTINs,
 *   invoice numbers, filenames or extracted values leave the source rows.
 *
 * There is no global/cross-firm model anywhere in this file.
 */

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];
// The intelligence tables are written with service-role only; the generated
// Database types lag behind new tables, so writes go through a loose handle.
type Loose = {
  from: (t: string) => any;
};

const DAY = 86_400_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, d = 2) => Number(n.toFixed(d));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Document categories allowed in `typical_docs_late`. Anything else is dropped. */
export const DOC_CATEGORY_WHITELIST = [
  "Bank Statement",
  "Invoice",
  "Purchase Invoice",
  "Sales Register",
  "Purchase Register",
  "Expense Bill",
  "GST Challan",
  "GSTR-2B",
  "GSTR-1",
  "GSTR-3B",
  "TDS Challan",
  "Form 16",
  "Form 26AS",
  "Payroll Register",
  "Ledger",
  "Trial Balance",
  "Fixed Asset Register",
  "Loan Statement",
  "Contract",
  "Other",
] as const;

const CATEGORY_LOOKUP = new Map(DOC_CATEGORY_WHITELIST.map((c) => [c.toLowerCase(), c]));

/** Maps a free-text doc type to a whitelisted category, or null if unknown. */
export function normalizeDocCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/_/g, " ");
  if (CATEGORY_LOOKUP.has(key)) return CATEGORY_LOOKUP.get(key)!;
  if (key.includes("bank")) return "Bank Statement";
  if (key.includes("purchase")) return "Purchase Invoice";
  if (key.includes("sales")) return "Sales Register";
  if (key.includes("expense")) return "Expense Bill";
  if (key.includes("gstr-2b") || key.includes("gstr2b")) return "GSTR-2B";
  if (key.includes("gst") && key.includes("challan")) return "GST Challan";
  if (key.includes("tds")) return "TDS Challan";
  if (key.includes("26as")) return "Form 26AS";
  if (key.includes("form 16")) return "Form 16";
  if (key.includes("payroll") || key.includes("salary")) return "Payroll Register";
  if (key.includes("ledger")) return "Ledger";
  if (key.includes("trial")) return "Trial Balance";
  if (key.includes("asset")) return "Fixed Asset Register";
  if (key.includes("loan")) return "Loan Statement";
  if (key.includes("invoice")) return "Invoice";
  return null;
}

/* ------------------------------------------------------------------ */
/* Privacy guards                                                      */
/* ------------------------------------------------------------------ */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const GSTIN_RE = /\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d]Z[A-Z\d]/i;

/** Firm-level payload may only contain statistical keys mapped to numbers. */
export function auditFirmPayload(payload: {
  confidence_overrides?: Record<string, unknown>;
  provision_weights?: Record<string, unknown>;
}): string[] {
  const problems: string[] = [];
  const scanNumeric = (obj: Record<string, unknown> | undefined, label: string, depth = 0) => {
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (UUID_RE.test(k) || GSTIN_RE.test(k)) problems.push(`${label}: identifier-like key "${k}"`);
      if (typeof v === "number") {
        if (!Number.isFinite(v)) problems.push(`${label}.${k}: non-finite number`);
        continue;
      }
      if (v && typeof v === "object" && depth === 0) {
        scanNumeric(v as Record<string, unknown>, `${label}.${k}`, depth + 1);
        continue;
      }
      problems.push(`${label}.${k}: value is not a statistic`);
    }
  };
  scanNumeric(payload.confidence_overrides, "confidence_overrides");
  scanNumeric(payload.provision_weights, "provision_weights");
  return problems;
}

/** Client-level payload must be numbers, thresholds and whitelisted categories. */
export function auditClientPayload(payload: {
  match_preferences?: Record<string, unknown>;
  avg_response_days?: unknown;
  avg_days_before_due?: unknown;
  filing_risk_score?: unknown;
  best_chase_day?: unknown;
  preferred_channel?: unknown;
  typical_docs_late?: unknown;
}): string[] {
  const problems: string[] = [];
  for (const [k, v] of Object.entries(payload.match_preferences ?? {})) {
    if (typeof v !== "number" || !Number.isFinite(v)) problems.push(`match_preferences.${k} is not a number`);
  }
  for (const key of ["avg_response_days", "avg_days_before_due", "filing_risk_score", "best_chase_day"] as const) {
    const v = payload[key];
    if (v !== null && v !== undefined && (typeof v !== "number" || !Number.isFinite(v))) {
      problems.push(`${key} is not a number`);
    }
  }
  const channel = payload.preferred_channel;
  if (channel != null && !["first_email", "needs_reminder", "needs_whatsapp"].includes(String(channel))) {
    problems.push("preferred_channel outside allowed set");
  }
  const docs = payload.typical_docs_late;
  if (docs != null) {
    if (!Array.isArray(docs)) problems.push("typical_docs_late is not an array");
    else {
      for (const d of docs) {
        if (!DOC_CATEGORY_WHITELIST.includes(d as never)) problems.push(`typical_docs_late contains "${String(d)}"`);
      }
    }
  }
  return problems;
}

async function logPrivacySkip(
  admin: Admin,
  firmId: string,
  businessId: string | null,
  problems: string[],
  module: string,
) {
  console.error(JSON.stringify({ fn: "ca-brain", module, firm: firmId, privacy_violation: problems }));
  await (admin as unknown as Loose).from("ca_audit_events").insert({
    ca_firm_id: firmId,
    business_id: businessId,
    entity_type: "ca_brain",
    action: "brain_privacy_check_failed",
    detail: { module, problems },
  });
}

/* ------------------------------------------------------------------ */
/* Shared scope helpers                                                */
/* ------------------------------------------------------------------ */

export interface FirmScope {
  id: string;
  entity_types: Map<string, string>; // business_id -> entity_type (firm-local only)
  business_ids: string[];
}

export async function loadFirms(admin: Admin): Promise<FirmScope[]> {
  const { data: firms } = await admin
    .from("ca_firms")
    .select("id")
    .eq("is_active", true)
    .eq("brain_enabled", true as never)
    .limit(2000);

  const scopes: FirmScope[] = [];
  for (const f of firms ?? []) {
    const firmId = String((f as { id: string }).id);
    // HARD FIRM SCOPE — a firm only ever sees its own client list.
    const { data: clients } = await admin
      .from("ca_clients")
      .select("business_id, entity_type")
      .eq("ca_firm_id", firmId)
      .eq("is_demo", false)
      .limit(5000);
    const map = new Map<string, string>();
    for (const c of clients ?? []) {
      const bid = (c as { business_id: string | null }).business_id;
      if (bid) map.set(String(bid), String((c as { entity_type: string | null }).entity_type ?? "Unspecified"));
    }
    scopes.push({ id: firmId, entity_types: map, business_ids: [...map.keys()] });
  }
  return scopes;
}

async function upsertFirm(admin: Admin, firmId: string, patch: Record<string, unknown>) {
  await (admin as unknown as Loose)
    .from("ca_firm_intelligence")
    .upsert({ ca_firm_id: firmId, computed_at: new Date().toISOString(), ...patch }, { onConflict: "ca_firm_id" });
}

async function upsertClient(admin: Admin, firmId: string, businessId: string, patch: Record<string, unknown>) {
  await (admin as unknown as Loose)
    .from("ca_client_intelligence")
    .upsert(
      { ca_firm_id: firmId, business_id: businessId, computed_at: new Date().toISOString(), ...patch },
      { onConflict: "ca_firm_id,business_id" },
    );
}

/* ------------------------------------------------------------------ */
/* Signal feed (ca_brain_events)                                       */
/* ------------------------------------------------------------------ */

export interface BrainSignal {
  id: string;
  business_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Reads a firm's own feedback signals. Firm scope is enforced on every read. */
export async function loadSignals(
  admin: Admin,
  firmId: string,
  eventTypes: string[],
  windowDays: number,
): Promise<BrainSignal[]> {
  const since = new Date(Date.now() - windowDays * DAY).toISOString();
  const { data } = await (admin as unknown as Loose)
    .from("ca_brain_events")
    .select("id, business_id, event_type, payload, created_at")
    .eq("ca_firm_id", firmId)
    .in("event_type", eventTypes)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20000);
  return ((data ?? []) as BrainSignal[]).map((r) => ({
    ...r,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

/** Groups signals by client. Rows without a client are dropped. */
export function signalsByClient(signals: BrainSignal[]): Map<string, BrainSignal[]> {
  const m = new Map<string, BrainSignal[]>();
  for (const s of signals) {
    if (!s.business_id) continue;
    const list = m.get(s.business_id) ?? [];
    list.push(s);
    m.set(s.business_id, list);
  }
  return m;
}

/** Reads a finite number out of a signal payload, or null. */
export function num(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/** Stamps consumed signals so operators can see the feed is being read. */
export async function markSignalsProcessed(admin: Admin, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const stamp = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 500) {
    await (admin as unknown as Loose)
      .from("ca_brain_events")
      .update({ processed_at: stamp })
      .in("id", ids.slice(i, i + 500));
  }
}

/* ------------------------------------------------------------------ */
/* MODULE 1 — OCR confidence learning (FIRM scope)                     */
/* ------------------------------------------------------------------ */

export async function learnOcr(admin: Admin, firms: FirmScope[]) {
  let firmsUpdated = 0;
  let classificationsAdjusted = 0;
  let signalsUsed = 0;
  const since = new Date(Date.now() - 90 * DAY).toISOString();

  for (const firm of firms) {
    // Statistical columns only — `extracted`/`corrected` are never selected.
    const { data: rows } = await admin
      .from("ca_document_extractions")
      .select("classification, confidence, was_corrected")
      .eq("ca_firm_id", firm.id)
      .gte("created_at", since)
      .limit(5000);

    // Live reviewer feedback from the signal feed — a correction recorded in
    // the review queue counts exactly like a corrected extraction row.
    const signals = await loadSignals(admin, firm.id, ["ocr_correction"], 90);

    const stats = new Map<string, { total: number; corrected: number; signalConfidence: number[] }>();
    const bump = (cls: string) =>
      stats.get(cls) ?? { total: 0, corrected: 0, signalConfidence: [] as number[] };

    for (const r of (rows ?? []) as { classification: string | null; was_corrected: boolean | null }[]) {
      const cls = (r.classification ?? "unclassified").toLowerCase();
      const s = bump(cls);
      s.total += 1;
      if (r.was_corrected) s.corrected += 1;
      stats.set(cls, s);
    }

    for (const sig of signals) {
      const cls = String(sig.payload["classification"] ?? "unclassified").toLowerCase();
      const s = bump(cls);
      s.total += 1;
      s.corrected += 1;
      const conf = num(sig.payload, "original_confidence");
      if (conf != null) s.signalConfidence.push(clamp(conf > 1 ? conf / 100 : conf, 0, 1));
      stats.set(cls, s);
      signalsUsed += 1;
    }

    if (!stats.size) continue;

    const overrides: Record<string, number> = {};
    for (const [cls, s] of stats) {
      if (s.total < 5) continue; // not enough history to move a threshold
      const rate = s.corrected / s.total;
      let threshold = rate > 0.3 ? 0.75 : rate < 0.05 ? 0.92 : 0.85;
      // Corrections that arrived on confident extractions mean the model is
      // over-confident for this classification: raise the review threshold.
      const meanSignalConf = avg(s.signalConfidence);
      if (meanSignalConf != null && s.signalConfidence.length >= 3 && meanSignalConf > threshold) {
        threshold = round(clamp(meanSignalConf + 0.03, 0.6, 0.98));
      }
      overrides[cls] = threshold;
      classificationsAdjusted += 1;
    }
    if (!Object.keys(overrides).length) continue;

    const problems = auditFirmPayload({ confidence_overrides: overrides });
    if (problems.length) {
      await logPrivacySkip(admin, firm.id, null, problems, "ocr");
      continue;
    }

    await upsertFirm(admin, firm.id, {
      confidence_overrides: overrides,
      last_ocr_learning_at: new Date().toISOString(),
    });
    await markSignalsProcessed(admin, signals.map((s) => s.id));
    firmsUpdated += 1;
  }

  return {
    firms_updated: firmsUpdated,
    classifications_adjusted: classificationsAdjusted,
    signals_used: signalsUsed,
  };
}

/* ------------------------------------------------------------------ */
/* MODULE 2 — Recon tolerance learning (CLIENT scope)                  */
/* ------------------------------------------------------------------ */

function variancePercents(snapshot: unknown): number[] {
  const out: number[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 500)) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "number" && /(variance|diff|delta)_pct|pct_diff|tolerance_pct/i.test(k)) {
        out.push(Math.abs(v));
      } else {
        walk(v, depth + 1);
      }
    }
  };
  walk(snapshot, 0);
  return out;
}

function lagDays(snapshot: unknown): number[] {
  const out: number[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 4 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 500)) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "number" && /(lag|age|days?)_(days|lag)?|date_gap|days_diff/i.test(k) && Math.abs(v) < 90) {
        out.push(Math.abs(v));
      } else {
        walk(v, depth + 1);
      }
    }
  };
  walk(snapshot, 0);
  return out;
}

export async function learnRecon(admin: Admin, firms: FirmScope[]) {
  let clientsUpdated = 0;
  let signalsUsed = 0;
  const since = new Date(Date.now() - 180 * DAY).toISOString();

  for (const firm of firms) {
    const feed = signalsByClient(
      await loadSignals(admin, firm.id, ["recon_match_accepted", "exception_resolved"], 180),
    );

    for (const businessId of firm.business_ids) {
      // HARD CLIENT SCOPE — firm + client on every read.
      const { data: runs } = await admin
        .from("ca_recon_runs")
        .select("total_items, matched, mismatched, snapshot")
        .eq("ca_firm_id", firm.id)
        .eq("business_id", businessId)
        .gte("run_at", since)
        .order("run_at", { ascending: false })
        .limit(30);

      const clientSignals = feed.get(businessId) ?? [];
      const accepted = clientSignals.filter((s) => s.event_type === "recon_match_accepted");
      const resolved = clientSignals.filter((s) => s.event_type === "exception_resolved");

      if (!runs?.length && accepted.length < 5) continue;

      const variances: number[] = [];
      const lags: number[] = [];
      let items = 0;
      let matched = 0;
      let mismatched = 0;
      for (const r of (runs ?? []) as { total_items: number; matched: number; mismatched: number; snapshot: unknown }[]) {
        items += Number(r.total_items ?? 0);
        matched += Number(r.matched ?? 0);
        mismatched += Number(r.mismatched ?? 0);
        variances.push(...variancePercents(r.snapshot));
        lags.push(...lagDays(r.snapshot));
      }

      // Accepted matches are the reviewer telling us what "close enough" means.
      const partialShare = accepted.length
        ? accepted.filter((s) => s.payload["partial"] === true).length / accepted.length
        : 0;
      const fuzzyShare = accepted.length
        ? accepted.filter((s) => String(s.payload["pass"] ?? "").toLowerCase().includes("fuzzy")).length /
          accepted.length
        : 0;
      const meanConfidence = avg(
        accepted.map((s) => num(s.payload, "confidence")).filter((n): n is number => n != null),
      );
      signalsUsed += accepted.length + resolved.length;

      if (items < 5 && accepted.length < 5) continue;

      let tolerance: number;
      if (variances.length >= 5) {
        // 90th percentile of observed accepted variance, banded.
        const sorted = [...variances].sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
        tolerance = p90 <= 0.25 ? 0.5 : p90 <= 1.2 ? 1 : p90 <= 2.2 ? 2 : 3;
      } else if (accepted.length >= 5) {
        tolerance = partialShare > 0.3 || fuzzyShare > 0.5 ? 2 : fuzzyShare > 0.2 ? 1 : 0.5;
      } else {
        const mismatchRate = items ? mismatched / items : 0;
        const matchRate = items ? matched / items : 0;
        tolerance = matchRate > 0.95 ? 0.5 : mismatchRate > 0.2 ? 2 : 1;
      }

      // Reviewers repeatedly accepting low-confidence matches means our bar is
      // too strict for this client; a run of exceptions closed as amount
      // differences means the same thing from the other direction.
      if (accepted.length >= 5 && meanConfidence != null && meanConfidence < 0.7) {
        tolerance = Math.min(3, tolerance * 2);
      }
      const amountExceptions = resolved.filter((s) =>
        /amount|value|variance/i.test(String(s.payload["reason_code"] ?? "")),
      ).length;
      if (amountExceptions >= 3) tolerance = Math.min(3, tolerance + 0.5);

      const lagAvg = lags.length >= 5 ? avg(lags) : null;
      const signalLag = avg(
        resolved.map((s) => num(s.payload, "days_open")).filter((n): n is number => n != null),
      );
      const dateWindow =
        lagAvg != null
          ? clamp(Math.ceil(lagAvg) + 1, 1, 15)
          : signalLag != null && resolved.length >= 5
            ? clamp(Math.ceil(signalLag / 2) + 1, 1, 15)
            : 3;

      const match_preferences = { tolerance_pct: round(tolerance), date_window_days: dateWindow };
      const problems = auditClientPayload({ match_preferences });
      if (problems.length) {
        await logPrivacySkip(admin, firm.id, businessId, problems, "recon");
        continue;
      }

      await upsertClient(admin, firm.id, businessId, { match_preferences });
      await markSignalsProcessed(admin, clientSignals.map((s) => s.id));
      clientsUpdated += 1;
    }
  }

  return { clients_updated: clientsUpdated, signals_used: signalsUsed };
}

/* ------------------------------------------------------------------ */
/* MODULE 3 — Deduction provision weights (FIRM scope, entity type)    */
/* ------------------------------------------------------------------ */

export async function learnDeductions(admin: Admin, firms: FirmScope[]) {
  let firmsUpdated = 0;
  let combos = 0;

  for (const firm of firms) {
    const { data: findings } = await admin
      .from("ca_deduction_findings")
      .select("provision, status, business_id")
      .eq("ca_firm_id", firm.id)
      .limit(20000);

    if (!findings?.length) continue;

    // Counts only. estimated_benefit, client names and business_ids never persist.
    const tally = new Map<string, Map<string, { actioned: number; dismissed: number }>>();
    for (const f of findings as { provision: string | null; status: string | null; business_id: string | null }[]) {
      const provision = (f.provision ?? "").trim();
      if (!provision) continue;
      const entity = firm.entity_types.get(String(f.business_id ?? "")) ?? "Unspecified";
      const byProvision = tally.get(entity) ?? new Map();
      const c = byProvision.get(provision) ?? { actioned: 0, dismissed: 0 };
      if (f.status === "actioned") c.actioned += 1;
      else if (f.status === "dismissed") c.dismissed += 1;
      byProvision.set(provision, c);
      tally.set(entity, byProvision);
    }

    const weights: Record<string, Record<string, number>> = {};
    for (const [entity, byProvision] of tally) {
      const entry: Record<string, number> = {};
      for (const [provision, c] of byProvision) {
        const n = c.actioned + c.dismissed;
        entry[provision] = n < 5 ? 0.5 : round(c.actioned / n);
        // Sample size travels alongside for the "Why this suggestion?" copy.
        entry[`${provision}__n`] = n;
        combos += 1;
      }
      if (Object.keys(entry).length) weights[entity] = entry;
    }
    if (!Object.keys(weights).length) continue;

    const problems = auditFirmPayload({ provision_weights: weights });
    if (problems.length) {
      await logPrivacySkip(admin, firm.id, null, problems, "deduction");
      continue;
    }

    await upsertFirm(admin, firm.id, {
      provision_weights: weights,
      last_deduction_learning_at: new Date().toISOString(),
    });
    firmsUpdated += 1;
  }

  return { firms_updated: firmsUpdated, provision_entity_combos: combos };
}

/* ------------------------------------------------------------------ */
/* MODULE 4 — Chaser behaviour (CLIENT scope)                          */
/* ------------------------------------------------------------------ */

export async function learnChaser(admin: Admin, firms: FirmScope[]) {
  let clientsUpdated = 0;
  let signalsUsed = 0;

  for (const firm of firms) {
    const feed = signalsByClient(await loadSignals(admin, firm.id, ["chaser_replied"], 365));

    for (const businessId of firm.business_ids) {
      const { data: reqs } = await admin
        .from("ca_document_requests")
        .select("doc_types, created_at, fulfilled_at, chaser_count")
        .eq("ca_firm_id", firm.id)
        .eq("business_id", businessId)
        .limit(2000);

      const fulfilled = (reqs ?? []).filter(
        (r) => (r as { fulfilled_at: string | null }).fulfilled_at,
      ) as { doc_types: string[] | null; created_at: string; fulfilled_at: string; chaser_count: number | null }[];

      // Replies logged by staff in the chaser queue, even when the request row
      // was never stamped as fulfilled.
      const replies = feed.get(businessId) ?? [];
      const replyDays = replies
        .map((s) => num(s.payload, "days_to_reply"))
        .filter((n): n is number => n != null && n >= 0 && n < 365);
      signalsUsed += replies.length;

      if (fulfilled.length < 3 && replyDays.length < 3) continue;

      const days = fulfilled.map((r) => (new Date(r.fulfilled_at).getTime() - new Date(r.created_at).getTime()) / DAY);
      const avgResponse = round(avg([...days, ...replyDays]) ?? 0, 1);

      // Slow document CATEGORIES only — titles/filenames are never read.
      const perCategory = new Map<string, number[]>();
      fulfilled.forEach((r, i) => {
        for (const raw of r.doc_types ?? []) {
          const cat = normalizeDocCategory(raw);
          if (!cat) continue;
          const list = perCategory.get(cat) ?? [];
          list.push(days[i] ?? 0);
          perCategory.set(cat, list);
        }
      });
      const typical_docs_late = [...perCategory.entries()]
        .filter(([, d]) => (avg(d) ?? 0) > 7)
        .map(([cat]) => cat)
        .slice(0, 8);

      // Day of week where a reply actually lands — fulfilment rows and logged
      // replies both count.
      const perDay = new Map<number, number[]>();
      fulfilled.forEach((r, i) => {
        const dow = new Date(r.fulfilled_at).getUTCDay();
        const list = perDay.get(dow) ?? [];
        list.push(days[i] ?? 0);
        perDay.set(dow, list);
      });
      replies.forEach((s) => {
        const d = num(s.payload, "days_to_reply");
        if (d == null || d < 0 || d >= 365) return;
        const dow = new Date(s.created_at).getUTCDay();
        const list = perDay.get(dow) ?? [];
        list.push(d);
        perDay.set(dow, list);
      });
      let bestDay: number | null = null;
      let bestVal = Number.POSITIVE_INFINITY;
      for (const [dow, d] of perDay) {
        const m = avg(d) ?? Number.POSITIVE_INFINITY;
        if (m < bestVal) { bestVal = m; bestDay = dow; }
      }

      const avgChasers = avg(fulfilled.map((r) => Number(r.chaser_count ?? 0))) ?? 0;
      let preferred_channel = avgChasers > 3 ? "needs_whatsapp" : avgChasers > 1 ? "needs_reminder" : "first_email";
      // A client that keeps replying on the portal instead of email needs a
      // louder nudge next time.
      if (replies.length >= 3) {
        const emailShare =
          replies.filter((s) => String(s.payload["channel"] ?? "") === "email").length / replies.length;
        if (emailShare < 0.4 && avgResponse > 5) preferred_channel = "needs_whatsapp";
        else if (emailShare < 0.7 && preferred_channel === "first_email") preferred_channel = "needs_reminder";
      }

      const payload = {
        avg_response_days: avgResponse,
        best_chase_day: bestDay,
        preferred_channel,
        typical_docs_late,
      };
      const problems = auditClientPayload(payload);
      if (problems.length) {
        await logPrivacySkip(admin, firm.id, businessId, problems, "chaser");
        continue;
      }

      await upsertClient(admin, firm.id, businessId, payload);
      await markSignalsProcessed(admin, replies.map((s) => s.id));
      clientsUpdated += 1;
    }
  }

  return { clients_updated: clientsUpdated, signals_used: signalsUsed };
}

/* ------------------------------------------------------------------ */
/* MODULE 5 — Filing risk (CLIENT scope)                               */
/* ------------------------------------------------------------------ */

export async function learnFiling(admin: Admin, firms: FirmScope[]) {
  let clientsUpdated = 0;
  let firmsTouched = 0;
  let signalsUsed = 0;

  for (const firm of firms) {
    let touched = false;
    const feed = signalsByClient(await loadSignals(admin, firm.id, ["compliance_filed"], 730));

    for (const businessId of firm.business_ids) {
      const { data: events } = await admin
        .from("ca_compliance_events")
        .select("event_type, due_date, filed_at")
        .eq("ca_firm_id", firm.id)
        .eq("business_id", businessId)
        .eq("status", "filed")
        .not("filed_at", "is", null)
        .limit(2000);

      const rows = (events ?? []) as { due_date: string | null; filed_at: string | null }[];
      const deltas = rows
        .filter((e) => e.due_date && e.filed_at)
        .map((e) => (new Date(`${e.due_date}T23:59:59Z`).getTime() - new Date(e.filed_at!).getTime()) / DAY);

      // Every "mark filed" carries how many days late it was; a positive
      // days_late is a negative days-before-due.
      const filedSignals = feed.get(businessId) ?? [];
      const signalDeltas = filedSignals
        .map((s) => num(s.payload, "days_late"))
        .filter((n): n is number => n != null && Math.abs(n) < 730)
        .map((n) => -n);
      signalsUsed += filedSignals.length;

      const all = [...deltas, ...signalDeltas];
      if (all.length < 3) continue;

      const mean = round(avg(all) ?? 0, 1);
      const lateShare = all.filter((d) => d < 0).length / all.length;
      const filing_risk_score =
        lateShare > 0.5 ? 0.8 : mean > 5 && lateShare === 0 ? 0.1 : round(clamp(0.15 + lateShare, 0, 1));

      const payload = { avg_days_before_due: mean, filing_risk_score };
      const problems = auditClientPayload(payload);
      if (problems.length) {
        await logPrivacySkip(admin, firm.id, businessId, problems, "filing");
        continue;
      }

      await upsertClient(admin, firm.id, businessId, payload);
      await markSignalsProcessed(admin, filedSignals.map((s) => s.id));
      clientsUpdated += 1;
      touched = true;
    }
    if (touched) {
      await upsertFirm(admin, firm.id, { last_filing_learning_at: new Date().toISOString() });
      firmsTouched += 1;
    }
  }

  return { clients_updated: clientsUpdated, firms_touched: firmsTouched, signals_used: signalsUsed };
}

/* ------------------------------------------------------------------ */
/* Cron secret gate                                                    */
/* ------------------------------------------------------------------ */

export function cronAuthorized(request: Request): boolean {
  const secret = process.env["CA_CRON_SECRET"];
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("ca_cron_secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(secret) && provided === secret;
}

export const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

export const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
