/**
 * Month-end close, server side: gathers what FynHelp already knows about each client-month, derives the steps (see steps.ts),
 * and records the confirmations a person makes. One implementation serves a single client and the whole portfolio, so the two
 * views can never disagree.
 *
 * Reads are tolerant: a table that is missing leaves that part empty and says so, never a made-up zero that looks like a pass.
 */
import type { Db, FirmContext } from "../db.server";
import { logActivity } from "../db.server";
import { PracticeError, parsePeriod } from "../core";
import { verificationOf, countsAsVerified, type StatementCheckLike, type Verification } from "../statementVerification";
import { isExplained } from "../exceptionKinds";
import { STEPS, closeState, deriveSteps, mayConfirm, type CloseFacts, type CloseState, type StepState } from "./steps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const MISSING = "Month-end confirmations are not set up yet. Run supabase/apply_nov_2026.sql in the Supabase SQL Editor.";

export interface StatementInfo {
  id: string;
  filename: string;
  accountTail: string | null;
  first: string | null;
  last: string | null;
  verification: Verification;
}

export interface Requirement {
  id: string;
  label: string;
  accountTail: string | null;
}

export interface ClientClose {
  businessId: string;
  name: string;
  period: string;
  state: CloseState;
  done: number;
  total: number;
  bankBooks: boolean;
  /** Bank lines read for the month by the last reconciliation run. */
  bankLines?: number;
  steps: StepState[];
  statements: StatementInfo[];
  requirements: Requirement[];
  /** What is not available and why, so a missing table is never read as "nothing to do". */
  notes: string[];
}

const tail = (s: string | null | undefined) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
};

async function safe(run: () => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<{ data: Row[]; error: string | null }> {
  try {
    const { data, error } = await run();
    return { data: data ?? [], error: error?.message ?? null };
  } catch (e) {
    return { data: [], error: (e as Error).message };
  }
}

/** The close of every client of the firm for one month ("2026-10"). */
export async function portfolioClose(db: Db, ctx: FirmContext, periodKey: string, onlyBusiness?: string): Promise<ClientClose[]> {
  const p = parsePeriod(periodKey);
  const f = ctx.firmId;
  const clientsQ = db.from("ca_clients").select("business_id, client_name, client_status").eq("ca_firm_id", f);
  const clients = await safe(() => (onlyBusiness ? clientsQ.eq("business_id", onlyBusiness) : clientsQ).limit(2000));
  const live = clients.data.filter((c) => c.business_id && c.client_status !== "archived");
  const ids = new Set(live.map((c) => String(c.business_id)));

  const [reqs, docs, runs, excs, reports, steps] = await Promise.all([
    safe(() => db.from("ca_client_document_requirements").select("id, business_id, label, account_tail").eq("ca_firm_id", f).eq("is_active", true).limit(5000)),
    safe(() =>
      db
        .from("ca_document_extractions")
        .select("id, business_id, original_filename, sc:extracted->statement_check, acct:extracted->>account_no")
        .eq("ca_firm_id", f)
        .eq("side", "bank")
        .lte("extracted->statement_check->>first", p.end)
        .gte("extracted->statement_check->>last", p.start)
        .limit(5000),
    ),
    safe(() => db.from("ca_recon_runs").select("business_id, total_items, period, recon_type").eq("ca_firm_id", f).eq("period", p.label).limit(5000)),
    safe(() => db.from("ca_exceptions").select("business_id, status, work_status, txn_id, txn_side, candidates").eq("ca_firm_id", f).eq("status", "open").gte("period_start", p.start).lte("period_end", p.end).limit(20000)),
    safe(() => db.from("ca_reports_log").select("business_id, signed_off_at, signed_off_by").eq("ca_firm_id", f).eq("period", p.label).limit(5000)),
    safe(() => db.from("ca_close_steps").select("business_id, step_key, confirmed_by_name, confirmed_at, note").eq("ca_firm_id", f).eq("period", p.key).limit(20000)),
  ]);
  // Exceptions without the team-work column still count; they are just not "explained".
  let excRows = excs.data;
  if (excs.error && /work_status/.test(excs.error)) excRows = (await safe(() => db.from("ca_exceptions").select("business_id, status, txn_id, txn_side, candidates").eq("ca_firm_id", f).eq("status", "open").gte("period_start", p.start).lte("period_end", p.end).limit(20000))).data;

  const group = <T extends Row>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(String(r.business_id), [...(m.get(String(r.business_id)) ?? []), r]);
    return m;
  };
  const reqBy = group(reqs.data);
  const docBy = group(docs.data);
  const runBy = group(runs.data);
  const excBy = group(excRows);
  const repBy = group(reports.data);
  const stepBy = group(steps.data);

  const out: ClientClose[] = [];
  for (const c of live) {
    const id = String(c.business_id);
    if (!ids.has(id)) continue;
    const requirements: Requirement[] = (reqBy.get(id) ?? []).map((r) => ({ id: String(r.id), label: String(r.label), accountTail: r.account_tail ? String(r.account_tail) : null }));
    const statements: StatementInfo[] = (docBy.get(id) ?? []).map((d) => {
      const sc = (d.sc ?? null) as (StatementCheckLike & { first?: string | null; last?: string | null }) | null;
      return { id: String(d.id), filename: String(d.original_filename ?? "Statement"), accountTail: tail(d.acct), first: sc?.first ?? null, last: sc?.last ?? null, verification: verificationOf(sc) };
    });

    // A requirement is met by a statement of that account (by its last digits) or, without digits, by any statement not yet used.
    const used = new Set<string>();
    let received = 0;
    const withTail = requirements.filter((r) => r.accountTail);
    for (const r of withTail) {
      const hit = statements.find((s) => !used.has(s.id) && s.accountTail === r.accountTail);
      if (hit) {
        used.add(hit.id);
        received++;
      }
    }
    for (const r of requirements.filter((x) => !x.accountTail)) {
      const hit = statements.find((s) => !used.has(s.id));
      if (hit) {
        used.add(hit.id);
        received++;
      }
    }
    const expected = requirements.length;
    const counted = expected > 0 ? statements.filter((s) => used.has(s.id)) : statements;
    const rcv = expected > 0 ? received : statements.length;
    const verified = counted.filter((s) => countsAsVerified(s.verification)).length;

    // A bank line and its book entry that point at each other are one decision, counted once exactly as the Exception Queue and the
    // Recon log count them, so this step never says 4 where everything else says 3.
    const allOpen = excBy.get(id) ?? [];
    const bankFirst = new Map(allOpen.filter((e) => e.txn_side !== "books").map((e) => [String(e.txn_id), (e.candidates as { txn_id?: string }[] | null)?.[0]?.txn_id]));
    const open = allOpen.filter((e) => !(e.txn_side === "books" && (e.candidates as { txn_id?: string }[] | null)?.[0]?.txn_id && bankFirst.get(String((e.candidates as { txn_id: string }[])[0]!.txn_id)) === String(e.txn_id)));
    const run = runBy.get(id)?.[0];
    const bankOnly = run ? (runBy.get(id) ?? []).every((r) => r.recon_type === "bank_only") : false;
    const confirmed: CloseFacts["confirmed"] = {};
    for (const s of stepBy.get(id) ?? []) confirmed[String(s.step_key)] = { by: s.confirmed_by_name ?? null, at: String(s.confirmed_at), note: s.note ?? null };
    const reps = repBy.get(id) ?? [];
    const signed = reps.find((r) => r.signed_off_at);
    if (signed) confirmed["partner_signoff"] = { by: signed.signed_off_by ? "Partner" : null, at: String(signed.signed_off_at) };

    const facts: CloseFacts = {
      // Every statement counts against the month (a held one blocks it) whether or not it satisfies a requirement.
      statements: {
        expected,
        received: rcv,
        verified,
        held: statements.filter((s) => s.verification.held).length,
        // A failed statement is either held (counted above) or accepted by a person (counted as verified).
        failed: 0,
        notAvailable: counted.filter((s) => s.verification.result === "not_available").length,
      },
      recon: { bank: Number(run?.total_items ?? 0), runDone: Boolean(run), bankOnly },
      exceptions: { open: open.length, explained: open.filter((e) => isExplained(e.work_status)).length },
      report: { exists: reps.length > 0, signedOff: Boolean(signed) },
      confirmed,
    };
    const stepStates = deriveSteps(p.key, facts);
    const cs = closeState(stepStates);
    const notes: string[] = [];
    if (reqs.error) notes.push("Expected bank statements cannot be read yet, so that step cannot be checked.");
    if (steps.error) notes.push("Confirmations cannot be read yet, so GST, TDS, provisions and the MIS review show as waiting.");
    if (docs.error) notes.push("Statement verification cannot be read right now.");
    out.push({ businessId: id, name: String(c.client_name ?? "Client"), period: p.key, state: cs.state, done: cs.done, total: cs.total, bankBooks: cs.bankBooks, bankLines: facts.recon.bank, steps: stepStates, statements, requirements, notes });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function clientClose(db: Db, ctx: FirmContext, businessId: string, periodKey: string): Promise<ClientClose | null> {
  return (await portfolioClose(db, ctx, periodKey, businessId))[0] ?? null;
}

export async function actorName(db: Db, userId: string): Promise<string> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    const meta = data?.user?.user_metadata as { full_name?: string } | undefined;
    return meta?.full_name?.trim() || data?.user?.email?.split("@")[0] || "A team member";
  } catch {
    return "A team member";
  }
}

/** A person confirms (or takes back) a step the system cannot check. */
export async function confirmStep(db: Db, ctx: FirmContext, businessId: string, periodKey: string, key: string, confirm: boolean, note?: string) {
  const def = STEPS.find((s) => s.key === key);
  if (!def) throw new PracticeError("invalid", "Unknown step.");
  if (!mayConfirm(ctx.role, def.kind)) throw new PracticeError("forbidden", def.kind === "authorized" ? "A partner or manager confirms this step." : "The system checks this step; it cannot be confirmed by hand.");
  const p = parsePeriod(periodKey);
  const { data: client } = await db.from("ca_clients").select("business_id").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).maybeSingle();
  if (!client) throw new PracticeError("not_found", "Client not found.");
  const name = await actorName(db, ctx.userId);
  const probe = await db.from("ca_close_steps").select("id").limit(1);
  if (probe.error) throw new PracticeError("not_ready", MISSING);
  if (confirm) {
    const { error } = await db.from("ca_close_steps").upsert({ ca_firm_id: ctx.firmId, business_id: businessId, period: p.key, step_key: key, confirmed_by: ctx.userId, confirmed_by_name: name, confirmed_at: new Date().toISOString(), note: note?.trim().slice(0, 500) || null }, { onConflict: "business_id,period,step_key" });
    if (error) throw new PracticeError("db_error", error.message);
  } else {
    const { error } = await db.from("ca_close_steps").delete().eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).eq("period", p.key).eq("step_key", key);
    if (error) throw new PracticeError("db_error", error.message);
  }
  await db.from("ca_close_events").insert({ ca_firm_id: ctx.firmId, business_id: businessId, period: p.key, step_key: key, action: confirm ? "confirmed" : "unconfirmed", actor_id: ctx.userId, actor_name: name, note: note?.trim().slice(0, 500) || null });
  await logActivity(db, ctx.firmId, businessId, "system", `${name} ${confirm ? "confirmed" : "took back"}: ${def.label} for ${p.label}.${note ? ` ${note.trim().slice(0, 200)}` : ""}`);
  return { ok: true };
}

export interface CloseEvent {
  step: string;
  action: string;
  by: string;
  at: string;
  note: string | null;
}

export async function closeHistory(db: Db, ctx: FirmContext, businessId: string, periodKey: string): Promise<CloseEvent[]> {
  const p = parsePeriod(periodKey);
  const { data } = await safe(() => db.from("ca_close_events").select("step_key, action, actor_name, created_at, note").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).eq("period", p.key).order("created_at", { ascending: false }).limit(100));
  return data.map((r) => ({ step: String(r.step_key), action: String(r.action), by: String(r.actor_name ?? "FynHelp"), at: String(r.created_at), note: r.note ?? null }));
}

/* ── expected documents ── */

export async function addRequirement(db: Db, ctx: FirmContext, businessId: string, label: string, accountTail?: string | null) {
  const l = label.trim().slice(0, 80);
  if (!l) throw new PracticeError("invalid", "Give the account a name, for example HDFC current account.");
  const t = tail(accountTail ?? "");
  if (accountTail && accountTail.trim() && !t) throw new PracticeError("invalid", "Enter the last 4 digits of the account number.");
  const { data: client } = await db.from("ca_clients").select("business_id").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).maybeSingle();
  if (!client) throw new PracticeError("not_found", "Client not found.");
  const { error } = await db.from("ca_client_document_requirements").insert({ ca_firm_id: ctx.firmId, business_id: businessId, kind: "bank_statement", label: l, account_tail: t, created_by: ctx.userId });
  if (error) throw new PracticeError(/does not exist|schema cache/.test(error.message) ? "not_ready" : "db_error", /does not exist|schema cache/.test(error.message) ? MISSING : error.message);
  return { ok: true };
}

export async function removeRequirement(db: Db, ctx: FirmContext, id: string) {
  const { error } = await db.from("ca_client_document_requirements").update({ is_active: false }).eq("id", id).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  return { ok: true };
}

/**
 * A person accepts a statement that failed verification, with a reason. The statement's lines are never changed: the acceptance is
 * written beside the check that failed, so anyone reading it sees both.
 */
export async function acceptStatement(db: Db, ctx: FirmContext, extractionId: string, note: string) {
  if (!["owner", "admin", "partner", "manager"].includes(ctx.role)) throw new PracticeError("forbidden", "A partner or manager accepts a statement that failed verification.");
  if (note.trim().length < 10) throw new PracticeError("invalid", "Say why this statement can be accepted (at least a short sentence).");
  const { data: doc } = await db.from("ca_document_extractions").select("id, business_id, original_filename, extracted, extract_status").eq("id", extractionId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!doc) throw new PracticeError("not_found", "Statement not found.");
  const ex = (doc.extracted ?? {}) as { statement_check?: StatementCheckLike };
  if (!ex.statement_check || ex.statement_check.status !== "fail") throw new PracticeError("invalid", "This statement did not fail verification.");
  const name = await actorName(db, ctx.userId);
  const accepted = { by: name, at: new Date().toISOString(), note: note.trim().slice(0, 500) };
  const { error } = await db
    .from("ca_document_extractions")
    .update({ extracted: { ...ex, statement_check: { ...ex.statement_check, accepted } }, ...(doc.extract_status === "needs_review" ? { extract_status: "parsed", review_state: "auto_accepted", error_message: null } : {}) })
    .eq("id", extractionId)
    .eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  await logActivity(db, ctx.firmId, doc.business_id, "extract", `${name} accepted ${doc.original_filename ?? "a statement"} although its verification failed: ${accepted.note}`.slice(0, 1900));
  return { ok: true };
}
