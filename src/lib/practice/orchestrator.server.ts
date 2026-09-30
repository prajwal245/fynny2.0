/**
 * The orchestrator: records every agent run, chains the agents, and keeps
 * their memory.
 *
 *   document arrives ─▶ Extract ─▶ (both sides in for the month?) ─▶ Recon
 *                                                                    │
 *            partner signs off ◀─ junior runs Narrate ◀─ "ready for MIS" notice
 *
 * Narrate stays a person's decision (the spec: the junior triggers it once the
 * Exception Queue is clear). Matching stays deterministic. The schedule (tick)
 * retries documents that failed for a temporary reason, with backoff, and opens
 * the "missing bank statement" chase after the firm's chase day.
 */
import { PracticeError } from "./core";
import {
  adminDb,
  logActivity,
  type Db,
  type FirmContext,
} from "./db.server";
import { lessonFrom, narrationPattern, partyFromNarration, type Memory } from "./memory";
import { autoChaseDue, periodsOf, readyForMis } from "./orchestrate";
import type { Direction } from "./core";

export type AgentName = "extract" | "recon" | "narrate" | "chaser" | "orchestrator";
export type RunTrigger = "user" | "pipeline" | "schedule" | "retry" | "channel";

export interface RunMeta {
  firmId: string;
  businessId?: string | null;
  agent: AgentName;
  trigger: RunTrigger;
  period?: string | null;
  subjectId?: string | null;
  subjectLabel?: string | null;
  attempt?: number;
  userId?: string | null;
}

export interface RunOutcome {
  status?: "succeeded" | "failed" | "skipped";
  summary: string;
  error?: string | null;
  detail?: Record<string, unknown>;
}

// ── Run log ──────────────────────────────────────────────────────────────────

export async function startRun(db: Db, meta: RunMeta): Promise<string | null> {
  const { data, error } = await db
    .from("ca_agent_runs")
    .insert({
      ca_firm_id: meta.firmId,
      business_id: meta.businessId ?? null,
      agent: meta.agent,
      trigger: meta.trigger,
      period: meta.period ?? null,
      subject_id: meta.subjectId ?? null,
      subject_label: meta.subjectLabel?.slice(0, 250) ?? null,
      attempt: meta.attempt ?? 1,
      status: "running",
      created_by: meta.userId ?? null,
    })
    .select("id")
    .single();
  // The run log must never stop the work it describes.
  if (error) {
    console.error(`[practice] agent run log failed: ${error.message}`);
    return null;
  }
  return data.id as string;
}

export async function finishRun(
  db: Db,
  runId: string | null,
  startedAt: number,
  outcome: RunOutcome,
) {
  if (!runId) return;
  const { error } = await db
    .from("ca_agent_runs")
    .update({
      status: outcome.status ?? "succeeded",
      summary: outcome.summary.slice(0, 1000),
      error: outcome.error?.slice(0, 1000) ?? null,
      detail: outcome.detail ?? {},
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    })
    .eq("id", runId);
  if (error) console.error(`[practice] agent run close failed: ${error.message}`);
}

/** Runs `fn` as a recorded agent run. Errors are recorded, then rethrown. */
export async function withRun<T>(
  db: Db,
  meta: RunMeta,
  fn: () => Promise<T>,
  describe: (result: T) => RunOutcome,
): Promise<T> {
  const started = Date.now();
  const runId = await startRun(db, meta);
  try {
    const result = await fn();
    await finishRun(db, runId, started, describe(result));
    return result;
  } catch (e) {
    await finishRun(db, runId, started, {
      status: "failed",
      summary: `${meta.agent} run failed`,
      error: (e as Error).message,
    });
    throw e;
  }
}

/** Acts on the firm's behalf for scheduled and chained work (as the firm owner). */
export async function systemContext(db: Db, firmId: string): Promise<FirmContext | null> {
  const { data } = await db
    .from("ca_firms")
    .select("id, firm_name, email, user_id")
    .eq("id", firmId)
    .maybeSingle();
  if (!data?.user_id) return null;
  return {
    firmId: data.id,
    firmName: data.firm_name ?? "Your CA firm",
    firmEmail: data.email ?? null,
    userId: data.user_id,
    role: "owner",
  };
}

// ── Chaining ─────────────────────────────────────────────────────────────────

/**
 * After a document is read: run Recon for each month it touched once both the
 * bank side and the books side are in. Recon is idempotent, so a second
 * document for the same month simply re-runs it.
 */
export async function afterExtraction(
  db: Db,
  doc: { id: string; ca_firm_id: string; business_id: string | null },
) {
  if (!doc.business_id) return [];
  const { data: firm } = await db
    .from("ca_firms")
    .select("auto_recon")
    .eq("id", doc.ca_firm_id)
    .maybeSingle();
  if (firm && firm.auto_recon === false) return [];
  const { data: dates } = await db
    .from("ca_txns")
    .select("txn_date")
    .eq("extraction_id", doc.id)
    .limit(5000);
  const periods = periodsOf((dates ?? []).map((d) => d.txn_date as string)).slice(0, 3);
  const results: { period: string; status: string }[] = [];
  for (const period of periods) {
    results.push({ period, status: await chainRecon(db, doc.ca_firm_id, doc.business_id, period) });
  }
  return results;
}

async function chainRecon(db: Db, firmId: string, businessId: string, period: string) {
  const { parsePeriod } = await import("./core");
  const p = parsePeriod(period);
  const sideCount = async (side: "bank" | "books") => {
    const { count } = await db
      .from("ca_txns")
      .select("id", { count: "exact", head: true })
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .eq("side", side)
      .gte("txn_date", p.start)
      .lte("txn_date", p.end);
    return count ?? 0;
  };
  const [bank, books] = await Promise.all([sideCount("bank"), sideCount("books")]);
  if (!bank || !books) return bank ? "waiting_for_books" : "waiting_for_bank";
  const ctx = await systemContext(db, firmId);
  if (!ctx) return "no_owner";
  const { runRecon } = await import("./recon.server");
  const summary = await withRun(
    db,
    { firmId, businessId, agent: "recon", trigger: "pipeline", period: p.label, userId: null },
    () => runRecon(db, ctx, businessId, p.label),
    (s) => ({
      summary: `Recon ran automatically: ${s.message}`,
      detail: { run_id: s.run_id, matched_by_stage: s.matched_by_stage, exceptions: s.exceptions_by_reason },
    }),
  );
  await afterRecon(db, firmId, businessId, p.label);
  return summary.run_id ? "reconciled" : "nothing_to_match";
}

/**
 * After Recon: when nothing is waiting on a person, tell the firm the month is
 * ready for its MIS (once per client and month).
 */
export async function afterRecon(
  db: Db,
  firmId: string,
  businessId: string,
  period: string,
) {
  const { parsePeriod } = await import("./core");
  const p = parsePeriod(period);
  const count = async (table: string, filter: (q: any) => any) => {
    const { count } = await filter(
      db.from(table).select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("business_id", businessId),
    );
    return count ?? 0;
  };
  const [matched, openExceptions, openReview] = await Promise.all([
    count("ca_txns", (q) => q.eq("match_status", "matched").gte("txn_date", p.start).lte("txn_date", p.end)),
    count("ca_exceptions", (q) => q.eq("status", "open").lte("period_start", p.end).gte("period_end", p.start)),
    count("ca_review_items", (q) => q.eq("status", "open")),
  ]);
  if (!readyForMis({ matched, openExceptions, openReview })) return false;
  const { data: already } = await db
    .from("ca_notifications")
    .select("id")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("type", "mis_ready")
    .contains("metadata", { period: p.label })
    .limit(1);
  if (already?.length) return true;
  const { data: client } = await db
    .from("ca_clients")
    .select("client_name")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();
  const name = client?.client_name ?? "This client";
  await db.from("ca_notifications").insert({
    ca_firm_id: firmId,
    business_id: businessId,
    type: "mis_ready",
    severity: "info",
    title: "Ready for MIS",
    message: `${name}: ${p.label} is reconciled with no open review or exception items. Generate the MIS for partner sign-off.`,
    is_read: false,
    metadata: { period: p.label },
  });
  await logActivity(db, firmId, businessId, "narrate", `${p.label} is reconciled and ready for its MIS.`);
  return true;
}

// ── Memory ───────────────────────────────────────────────────────────────────

export async function loadMemories(db: Db, businessId: string | null): Promise<Memory[]> {
  if (!businessId) return [];
  const { data } = await db
    .from("ca_agent_memory")
    .select("id, pattern, lesson, times_taught")
    .eq("business_id", businessId)
    .eq("kind", "extract_correction")
    .limit(2000);
  return (data ?? []) as Memory[];
}

/** Records how a person settled a Review Queue line, so next month's copy goes straight through. */
export async function teachFromReview(
  db: Db,
  ctx: FirmContext,
  item: {
    business_id: string | null;
    raw_text: string;
    proposed: { direction: Direction | null; counterparty: string | null; description: string };
  },
  final: { direction: Direction; counterparty: string | null; description: string },
) {
  if (!item.business_id) return null;
  const pattern = narrationPattern(item.proposed.description) || narrationPattern(item.raw_text);
  if (!pattern) return null;
  const lesson = lessonFrom(item.proposed, final);
  const { data: existing } = await db
    .from("ca_agent_memory")
    .select("id, times_taught")
    .eq("business_id", item.business_id)
    .eq("kind", "extract_correction")
    .eq("pattern", pattern)
    .maybeSingle();
  const now = new Date().toISOString();
  if (existing) {
    await db
      .from("ca_agent_memory")
      .update({ lesson, times_taught: existing.times_taught + 1, updated_at: now, example: item.raw_text.slice(0, 500) })
      .eq("id", existing.id);
    return existing.id as string;
  }
  const { data, error } = await db
    .from("ca_agent_memory")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: item.business_id,
      kind: "extract_correction",
      pattern,
      lesson,
      example: item.raw_text.slice(0, 500),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    console.error(`[practice] memory write failed: ${error.message}`);
    return null;
  }
  return data.id as string;
}

export async function markMemoriesApplied(db: Db, memoryIds: string[]) {
  const counts = new Map<string, number>();
  for (const id of memoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const now = new Date().toISOString();
  for (const [id, n] of counts) {
    const { data } = await db.from("ca_agent_memory").select("times_applied").eq("id", id).maybeSingle();
    await db
      .from("ca_agent_memory")
      .update({ times_applied: (data?.times_applied ?? 0) + n, last_applied_at: now })
      .eq("id", id);
  }
}

/**
 * A manual match between differently named parties teaches the Recon agent an
 * alias ("AMZN MKTP" is "Amazon India Pvt Ltd"), used by its rules stage.
 * Deterministic: an alias only ever maps one exact normalised name to another.
 */
export async function learnAlias(
  db: Db,
  ctx: FirmContext,
  bank: { counterparty?: string | null; description?: string | null },
  book: { counterparty?: string | null; description?: string | null },
) {
  // Bank lines often carry only a narration: learn the name inside it.
  const alias = bank.counterparty?.trim() || partyFromNarration(bank.description);
  const canonical = book.counterparty?.trim() || book.description?.trim();
  if (!alias || !canonical) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (norm(alias) === norm(canonical) || norm(alias).length < 3) return null;
  const { data: existing } = await db
    .from("ca_counterparty_aliases")
    .select("id, canonical")
    .eq("ca_firm_id", ctx.firmId)
    .ilike("alias", alias)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await db
    .from("ca_counterparty_aliases")
    .insert({ ca_firm_id: ctx.firmId, alias, canonical, source: "learned", created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return null;
  await logActivity(db, ctx.firmId, null, "recon", `Learned that "${alias}" is "${canonical}" from a manual match.`);
  return data.id as string;
}

/** What the agents have learned in this firm, for the Settings screen. */
export async function listMemory(db: Db, ctx: FirmContext) {
  const [{ data: lessons }, { data: aliases }] = await Promise.all([
    db
      .from("ca_agent_memory")
      .select("id, business_id, pattern, lesson, example, times_taught, times_applied, last_applied_at, updated_at")
      .eq("ca_firm_id", ctx.firmId)
      .order("updated_at", { ascending: false })
      .limit(500),
    db
      .from("ca_counterparty_aliases")
      .select("id, alias, canonical, source, created_at")
      .eq("ca_firm_id", ctx.firmId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  return { lessons: lessons ?? [], aliases: aliases ?? [] };
}

export async function forgetMemory(db: Db, ctx: FirmContext, kind: "lesson" | "alias", id: string) {
  const table = kind === "lesson" ? "ca_agent_memory" : "ca_counterparty_aliases";
  const { data, error } = await db.from(table).delete().eq("id", id).eq("ca_firm_id", ctx.firmId).select("id");
  if (error) throw new PracticeError("db_error", error.message);
  if (!data?.length) throw new PracticeError("not_found", "Nothing to forget.");
  return { forgotten: true };
}

// ── Schedule ─────────────────────────────────────────────────────────────────

/**
 * Opens a "Missing bank statement" chase for every client with no bank
 * statement for last month once the firm's chase day has passed (spec:
 * "no bank statement received by 5th of month"). Once per client and month.
 */
export async function runAutoChases(now = new Date(), firmId?: string) {
  const db = await adminDb();
  let q = db.from("ca_firms").select("id, auto_chase_day").not("auto_chase_day", "is", null);
  if (firmId) q = q.eq("id", firmId);
  const { data: firms } = await q;
  const { parsePeriod } = await import("./core");
  let created = 0;
  for (const firm of firms ?? []) {
    const label = autoChaseDue(now, firm.auto_chase_day);
    if (!label) continue;
    const p = parsePeriod(label);
    const { data: clients } = await db
      .from("ca_clients")
      .select("business_id, client_name, client_email, client_phone, do_not_disturb, client_status, created_at")
      .eq("ca_firm_id", firm.id)
      .not("business_id", "is", null);
    // A client added after this month's chase day gets until the next one.
    const dueSince = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), firm.auto_chase_day ?? 1);
    const active = (clients ?? []).filter(
      (c) =>
        !c.do_not_disturb &&
        !/inactive|archived|closed/i.test(String(c.client_status ?? "")) &&
        Date.parse(String(c.created_at ?? "")) < dueSince,
    );
    if (!active.length) continue;
    const ctx = await systemContext(db, firm.id);
    if (!ctx) continue;
    for (const c of active) {
      const { count: bankRows } = await db
        .from("ca_txns")
        .select("id", { count: "exact", head: true })
        .eq("ca_firm_id", firm.id)
        .eq("business_id", c.business_id)
        .eq("side", "bank")
        .gte("txn_date", p.start)
        .lte("txn_date", p.end);
      if (bankRows) continue;
      const { data: existing } = await db
        .from("ca_document_requests")
        .select("id")
        .eq("ca_firm_id", firm.id)
        .eq("business_id", c.business_id)
        .eq("period", p.label)
        .contains("doc_types", ["Missing bank statement"])
        .limit(1);
      if (existing?.length) continue;
      const { createChase } = await import("./chaser.server");
      await withRun(
        db,
        {
          firmId: firm.id,
          businessId: c.business_id,
          agent: "chaser",
          trigger: "schedule",
          period: p.label,
          subjectLabel: `Missing bank statement for ${p.label}`,
        },
        () =>
          createChase(db, ctx, {
            business_id: c.business_id,
            type: "Missing bank statement",
            contact: c.client_email ?? c.client_name ?? "",
            period: p.label,
            note: `Opened automatically: no bank statement for ${p.label} by day ${firm.auto_chase_day}.`,
          }),
        (row) => ({ summary: `Chase opened automatically for ${p.label}`, detail: { chase_id: (row as { id: string }).id } }),
      ).then(
        () => created++,
        (e) => console.error(`[practice] auto chase failed: ${(e as Error).message}`),
      );
    }
  }
  return { created };
}

/** The firm's recent agent runs (optionally one client's), newest first. */
export async function listRuns(db: Db, ctx: FirmContext, businessId?: string | null, limit = 50) {
  let q = db
    .from("ca_agent_runs")
    .select("id, business_id, agent, trigger, period, subject_id, subject_label, status, attempt, summary, error, started_at, finished_at, duration_ms")
    .eq("ca_firm_id", ctx.firmId)
    .order("started_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (businessId) q = q.eq("business_id", businessId);
  const { data } = await q;
  return data ?? [];
}

export async function updatePipelineSettings(
  db: Db,
  ctx: FirmContext,
  input: { auto_recon?: boolean; auto_chase_day?: number | null },
) {
  const patch: Record<string, unknown> = {};
  if (input.auto_recon !== undefined) patch.auto_recon = input.auto_recon;
  if (input.auto_chase_day !== undefined) patch.auto_chase_day = input.auto_chase_day;
  const { error } = await db.from("ca_firms").update(patch).eq("id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  return getPipelineSettings(db, ctx);
}

export async function getPipelineSettings(db: Db, ctx: FirmContext) {
  const { data } = await db.from("ca_firms").select("auto_recon, auto_chase_day").eq("id", ctx.firmId).maybeSingle();
  return { auto_recon: data?.auto_recon ?? true, auto_chase_day: data?.auto_chase_day ?? null };
}
