/**
 * Recon agent — server side. Loads unmatched transactions for one client and
 * period, runs the deterministic engine, and writes matches and exceptions.
 * Re-running is idempotent: matched lines are excluded from the next run,
 * a bank line can be in only one live match, and each transaction has at most
 * one open exception which is updated in place.
 */
import { isBankLedgerName } from "./extract/tally";
import { statementAccount } from "./tallyReconView";
import { isDistinctiveName } from "./memory";
import {
  PracticeError,
  parsePeriod,
  round2,
  signedAmount,
  toPaise,
  type Period,
} from "./core";
import {
  assertClient,
  fetchAll,
  logActivity,
  type Db,
  type FirmContext,
} from "./db.server";
import { decisionCount,
  DEFAULT_RULES,
  REASON_LABELS,
  reconcile,
  reconcileByAccount,
  withoutUnmatchedPairs,
  type ExceptionDecision,
  type ReconRule,
  type ReconTxn,
} from "./recon/engine";
import { pairOwnTransfers, type TransferPair } from "./recon/ownTransfers";
import { pairReversals, type ReversalPair } from "./recon/reversals";
import { proveReconciliation, type Proof, type ProofMatch, type ProofTxn } from "./recon/proof";

interface TxnRow extends ReconTxn {
  match_status: string;
  business_id: string;
  extraction_id: string | null;
  balance: number | null;
}

const TXN_COLS =
  "id, side, direction, amount, txn_date, counterparty, reference, description, category, match_status, business_id, extraction_id, balance";

const severityFor = (amount: number) =>
  amount >= 100_000 ? "high" : amount >= 10_000 ? "medium" : "low";
const num = <T extends { amount: number | string }>(
  t: T,
): T & { amount: number } => ({ ...t, amount: Number(t.amount) });

async function firmRules(
  db: Db,
  firmId: string,
): Promise<{
  rules: ReconRule[];
  aliases: { alias: string; canonical: string }[];
}> {
  const [{ data: rules }, { data: aliases }] = await Promise.all([
    db
      .from("ca_recon_rules")
      .select(
        "id, name, narration_any, direction, tag, book_narration_any, date_window_days",
      )
      .eq("ca_firm_id", firmId)
      .eq("is_active", true),
    db
      .from("ca_counterparty_aliases")
      .select("alias, canonical")
      .eq("ca_firm_id", firmId),
  ]);
  return {
    rules: [...((rules ?? []) as ReconRule[]), ...DEFAULT_RULES],
    // Older learned aliases made of generic words ("against inv") would match anything.
    aliases: (aliases ?? []).filter((a: { alias: string }) => isDistinctiveName(a.alias)),
  };
}

async function loadScope(
  db: Db,
  firmId: string,
  businessId: string,
  period: Period,
  statuses: string[],
): Promise<TxnRow[]> {
  const rows = await fetchAll<TxnRow>((from, to) =>
    db
      .from("ca_txns")
      .select(TXN_COLS)
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .gte("txn_date", period.start)
      .lte("txn_date", period.end)
      .in("match_status", statuses)
      .order("txn_date")
      .order("id")
      .range(from, to),
  );
  return rows.map(num);
}

/** Matched bank lines from 45 days before the period to its end: a returned
 *  cheque's deposit is usually already matched to the receipt in the books. */
async function chequeContext(db: Db, firmId: string, businessId: string, period: Period): Promise<TxnRow[]> {
  const from = new Date(`${period.start}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 45);
  const { data } = await db
    .from("ca_txns")
    .select(TXN_COLS)
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("side", "bank")
    .eq("match_status", "matched")
    .gte("txn_date", from.toISOString().slice(0, 10))
    .lte("txn_date", period.end)
    .limit(2000);
  return ((data ?? []) as TxnRow[]).map(num);
}

export interface ReconSummary {
  run_id: string | null;
  period: Period;
  bank: number;
  books: number;
  matched: number;
  matched_total: number;
  exceptions: number;
  matched_by_stage: Record<string, number>;
  exceptions_by_reason: Record<string, number>;
  message: string;
  /** Transfers between the client's own accounts that were paired and set aside this run. */
  own_transfers?: number;
  /** Payments the bank reversed (a debit and its RVSL credit) that were paired and set aside this run. */
  reversed_payments?: number;
  /** The month was checked on the bank statements alone, because no books were uploaded. */
  bank_only?: boolean;
  /** Book entries for a bank account whose statement has not been uploaded; they wait for it. */
  awaiting_statement?: number;
  /** The post-match proof (RC-6): whether the stored matches are consistent with the lines. A failed proof is shown, never hidden. */
  proof?: Proof;
}

/** "7 already matched; this run matched 5 more of 12 (4 same amount and date, 1 part payment). 2 need a decision." */
function reconMessage(written: number, open: number, already: number, byStage: Record<string, number>, exceptions: number) {
  const how = [
    byStage.exact ? `${byStage.exact} same amount and date` : "",
    byStage.fuzzy ? `${byStage.fuzzy} close match${byStage.fuzzy === 1 ? "" : "es"}` : "",
    byStage.rules ? `${byStage.rules} by rules or part payments` : "",
  ].filter(Boolean);
  const head = already
    ? `${already} bank line${already === 1 ? " was" : "s were"} already matched; this run matched ${written} of the ${open} still open`
    : `${written} of ${open} bank lines matched`;
  return `${head}${how.length ? ` (${how.join(", ")})` : ""}. ${exceptions ? `${exceptions} exception${exceptions === 1 ? " needs" : "s need"} a decision.` : "Nothing left to decide."}`;
}

/**
 * Starts the period over: every automatic match and every automatic set-aside (own-account transfers, reversed payments) goes back
 * to open, so the next run decides again with the current rules. A person's manual matches, and the exceptions they resolved, stay.
 * An earlier run made with older rules cannot keep a line from its right entry.
 */
export async function resetAutoMatches(db: Db, ctx: FirmContext, businessId: string, periodInput: string | { start: string; end: string }): Promise<{ reopened: number }> {
  await assertClient(db, ctx, businessId);
  const period = parsePeriod(periodInput);
  const { data: matches } = await db
    .from("ca_recon_matches")
    .select("id, bank_txn_id, book_txn_ids, match_stage")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .lte("period_start", period.end)
    .gte("period_end", period.start)
    .limit(5000);
  const auto = ((matches ?? []) as { id: string; bank_txn_id: string; book_txn_ids: string[] | null; match_stage: string }[]).filter((m) => m.match_stage !== "manual");
  const ids = [...new Set(auto.flatMap((m) => [m.bank_txn_id, ...(m.book_txn_ids ?? [])]))];
  let reopened = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from("ca_txns").update({ match_status: "unmatched" }).in("id", ids.slice(i, i + 300)).eq("match_status", "matched").select("id");
    reopened += data?.length ?? 0;
  }
  const matchIds = auto.map((m) => m.id);
  for (let i = 0; i < matchIds.length; i += 300) await db.from("ca_recon_matches").delete().in("id", matchIds.slice(i, i + 300));
  // Automatic set-asides in the period.
  const { data: aside } = await db
    .from("ca_txns")
    .select("id, recon_tag")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("match_status", "ignored")
    .gte("txn_date", shiftDay(period.start, -2))
    .lte("txn_date", shiftDay(period.end, 2))
    .limit(5000);
  const asideIds = ((aside ?? []) as { id: string; recon_tag: string | null }[]).filter((r) => r.recon_tag && (r.recon_tag.startsWith(OWN_TAG) || r.recon_tag.startsWith(REV_TAG) || r.recon_tag === AWAIT_TAG)).map((r) => r.id);
  for (let i = 0; i < asideIds.length; i += 300) {
    const { data } = await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).in("id", asideIds.slice(i, i + 300)).select("id");
    reopened += data?.length ?? 0;
  }
  await logActivity(db, ctx.firmId, businessId, "recon", `Started ${period.label} over: ${reopened} line${reopened === 1 ? "" : "s"} put back to open (automatic matches and set-asides only; manual matches kept).`);
  return { reopened };
}

export async function runRecon(
  db: Db,
  ctx: FirmContext,
  businessId: string,
  periodInput: string | { start: string; end: string },
): Promise<ReconSummary> {
  const client = await assertClient(db, ctx, businessId);
  const period = parsePeriod(periodInput);
  // Entries set aside because their account had no statement are looked at again: the statement may have arrived since.
  await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).eq("match_status", "ignored").eq("recon_tag", AWAIT_TAG).gte("txn_date", period.start).lte("txn_date", period.end);
  const scope = await loadScope(db, ctx.firmId, businessId, period, [
    "unmatched",
    "exception",
  ]);
  // Transfers between the client's own accounts are paired first: they are neither income nor expense and need no ledger match.
  const transfers = await pairAccountTransfers(db, ctx, businessId, period).catch(() => [] as TransferPair[]);
  const allScopeBooks = scope.filter((t) => t.side === "books");
  const reversals = await pairReversedPayments(db, ctx, businessId, scope.filter((t) => t.side === "bank"), allScopeBooks).catch(() => [] as ReversalPair[]);
  const pairedIds = new Set([...transfers.flatMap((t) => [t.out.id, t.in.id]), ...reversals.flatMap((t) => [t.out.id, t.in.id])]);
  const bank = scope.filter((t) => t.side === "bank" && !pairedIds.has(t.id));
  // A Day Book has a line for every bank account of the client, including accounts whose statement has not been uploaded (a CC account,
  // a loan, another bank). Those entries wait for their statement; they are not exceptions and do not compete with the accounts that
  // can be reconciled now. An entry whose bank ledger names no account digits is kept.
  const split = await splitAwaitingStatement(db, ctx.firmId, businessId, scope.filter((t) => t.side === "books"));
  const awaiting = split.awaiting;
  // A line waiting for its bank statement is not an exception: it is not wrong, the statement has not arrived. Anything an earlier run
  // marked as one is cleared, and it is looked at again by the run that has the statement.
  for (let i = 0; i < split.awaitingIds.length; i += 300) {
    const ids = split.awaitingIds.slice(i, i + 300);
    await db.from("ca_exceptions").update({ status: "resolved", resolved_at: new Date().toISOString(), resolution_action: "awaiting_statement", resolution_note: "Waiting for the bank statement of this account" }).in("txn_id", ids).eq("status", "open");
    // Set aside and labelled, so the screens say "no statement for this account" instead of listing them under "Needs matching".
    await db.from("ca_txns").update({ match_status: "ignored", recon_tag: AWAIT_TAG }).in("id", ids).in("match_status", ["unmatched", "exception"]);
  }
  // The Day Book records a transfer between two bank accounts as two legs (a contra). When the statements prove the transfer, its two
  // book legs are set aside with it, so they do not wait as book-side exceptions.
  const contraIds = await pairContraBookLegs(db, split.books, transfers).catch(() => new Set<string>());
  const books = split.books.filter((b) => !contraIds.has(b.id));
  const { count: alreadyMatched } = await db
    .from("ca_txns")
    .select("id", { count: "exact", head: true })
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "bank")
    .eq("match_status", "matched")
    .gte("txn_date", period.start)
    .lte("txn_date", period.end);

  const empty = (message: string): ReconSummary => ({
    run_id: null,
    period,
    bank: bank.length,
    books: books.length,
    matched: alreadyMatched ?? 0,
    matched_total: alreadyMatched ?? 0,
    exceptions: 0,
    matched_by_stage: {},
    exceptions_by_reason: {},
    message,
  });
  if (!bank.length && !books.length) {
    return empty(
      alreadyMatched
        ? `Everything in ${period.label} is already reconciled.`
        : `No transactions dated in ${period.label} yet. Upload the bank statement and the books for this period.`,
    );
  }
  const { count: bookCount } = await db
    .from("ca_txns")
    .select("id", { count: "exact", head: true })
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "books")
    .gte("txn_date", period.start)
    .lte("txn_date", period.end);
  // A client that shares only bank statements has no books to match. That is a complete result of its own: transfers between the
  // client's accounts and payments the bank reversed are paired and set aside, nothing is left waiting, and it says what uploading
  // the books would add. The run is recorded, so the month's close can see it.
  if (!bookCount) {
    const total = bank.length + (alreadyMatched ?? 0);
    const setAside = (transfers.length + reversals.length) * 2;
    const message = `Checked on its own: ${total} bank line${total === 1 ? "" : "s"} for ${period.label}, no books uploaded.${transfers.length ? ` ${transfers.length} transfer${transfers.length === 1 ? "" : "s"} between the client's own accounts paired and set aside.` : ""}${reversals.length ? ` ${reversals.length} reversed payment${reversals.length === 1 ? "" : "s"} paired and set aside.` : ""} Upload the Tally Day Book or ledgers to match the rest against the books.`;
    const { data: run } = await db
      .from("ca_recon_runs")
      .insert({
        ca_firm_id: ctx.firmId,
        business_id: businessId,
        recon_type: "bank_only",
        period: period.label,
        total_items: total,
        matched: setAside + (alreadyMatched ?? 0),
        mismatched: 0,
        unmatched: 0,
        total_matched_value: 0,
        total_at_risk: 0,
        run_by: ctx.userId,
        snapshot: { status: "done", period, bank_only: true, set_aside: setAside },
      })
      .select("id")
      .single();
    await logActivity(db, ctx.firmId, businessId, "recon", `Recon for ${client.client_name}, ${period.label}: ${message}`);
    return {
      run_id: run?.id ?? null,
      period,
      bank: total,
      books: 0,
      matched: setAside,
      matched_total: setAside + (alreadyMatched ?? 0),
      exceptions: 0,
      matched_by_stage: {},
      exceptions_by_reason: {},
      message,
      own_transfers: transfers.length,
      reversed_payments: reversals.length,
      bank_only: true,
    };
  }
  const { count: bankCount } = await db
    .from("ca_txns")
    .select("id", { count: "exact", head: true })
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "bank")
    .gte("txn_date", period.start)
    .lte("txn_date", period.end);
  if (!bankCount)
    return empty(
      `No bank statement lines for ${period.label}. Upload the bank statement before running recon.`,
    );

  const { rules, aliases } = await firmRules(db, ctx.firmId);
  const outcome = withoutUnmatchedPairs(reconcileByAccount(bank, books, await accountOfFn(db, ctx.firmId, businessId), { rules, aliases, pairContext: await chequeContext(db, ctx.firmId, businessId, period) }), await unmatchedPairs(db, ctx.firmId, businessId), scope);

  const { data: run, error: runErr } = await db
    .from("ca_recon_runs")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: businessId,
      recon_type: "bank_books",
      period: period.label,
      total_items: bank.length + (alreadyMatched ?? 0),
      matched: (alreadyMatched ?? 0) + outcome.stats.matched,
      mismatched: 0,
      unmatched: outcome.stats.exceptions,
      total_matched_value: outcome.stats.matched_value,
      total_at_risk: outcome.stats.at_risk_value,
      run_by: ctx.userId,
      snapshot: { status: "running", period, stats: outcome.stats },
    })
    .select("id")
    .single();
  if (runErr) throw new PracticeError("db_error", runErr.message);

  // Matches: claim the lines in bulk; only lines still unmatched/exception at
  // write time are taken, so a concurrent run or a manual match cannot double-book.
  const wanted = outcome.matches.flatMap((m) => [
    m.bank_txn_id,
    ...m.book_txn_ids,
  ]);
  const taken = new Set<string>();
  for (let i = 0; i < wanted.length; i += 300) {
    const { data } = await db
      .from("ca_txns")
      .update({ match_status: "matched" })
      .in("id", wanted.slice(i, i + 300))
      .in("match_status", ["unmatched", "exception"])
      .select("id");
    for (const r of data ?? []) taken.add(r.id);
  }
  const complete = outcome.matches.filter((m) =>
    [m.bank_txn_id, ...m.book_txn_ids].every((id) => taken.has(id)),
  );
  const partial = outcome.matches
    .filter((m) => !complete.includes(m))
    .flatMap((m) => [m.bank_txn_id, ...m.book_txn_ids])
    .filter((id) => taken.has(id));
  if (partial.length)
    await db
      .from("ca_txns")
      .update({ match_status: "unmatched" })
      .in("id", partial);

  const matchRows = complete.map((m) => ({
    ca_firm_id: ctx.firmId,
    business_id: businessId,
    recon_run_id: run.id,
    period_start: period.start,
    period_end: period.end,
    bank_txn_id: m.bank_txn_id,
    book_txn_ids: m.book_txn_ids,
    match_stage: m.stage,
    match_score: m.score,
    explanation: m.explanation,
  }));
  let written = 0;
  for (let i = 0; i < matchRows.length; i += 200) {
    const batch = matchRows.slice(i, i + 200);
    const { error } = await db.from("ca_recon_matches").insert(batch);
    if (!error) {
      written += batch.length;
      continue;
    }
    // A batch failed (e.g. a line matched concurrently): fall back row by row.
    for (const row of batch) {
      const { error: rowErr } = await db.from("ca_recon_matches").insert(row);
      if (rowErr)
        await db
          .from("ca_txns")
          .update({ match_status: "unmatched" })
          .in("id", [row.bank_txn_id, ...row.book_txn_ids]);
      else written++;
    }
  }
  const matchedIds = complete.flatMap((m) => [
    m.bank_txn_id,
    ...m.book_txn_ids,
  ]);
  for (let i = 0; i < matchedIds.length; i += 300) {
    await db
      .from("ca_exceptions")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_action: "auto_matched",
        resolution_note: "Matched on a later recon run",
      })
      .in("txn_id", matchedIds.slice(i, i + 300))
      .eq("status", "open");
  }

  const byTag = new Map<string, string[]>();
  for (const [txnId, tag] of Object.entries(outcome.tags))
    (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push(txnId);
  for (const [tag, ids] of byTag)
    await db.from("ca_txns").update({ recon_tag: tag }).in("id", ids);

  const byId = new Map(scope.map((t) => [t.id, t]));
  const excTxnIds = outcome.exceptions.map((e) => e.txn_id);
  const openByTxn = new Map<string, string>();
  for (let i = 0; i < excTxnIds.length; i += 300) {
    const { data } = await db
      .from("ca_exceptions")
      .select("id, txn_id")
      .eq("ca_firm_id", ctx.firmId)
      .eq("status", "open")
      .in("txn_id", excTxnIds.slice(i, i + 300));
    for (const r of data ?? []) openByTxn.set(r.txn_id, r.id);
  }
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  for (const e of outcome.exceptions) {
    const row = exceptionRow(
      ctx,
      businessId,
      period,
      run.id,
      e,
      byId.get(e.txn_id)!,
    );
    const existing = openByTxn.get(e.txn_id);
    // Re-runs refresh the reason and candidates of the same open exception.
    if (existing)
      updates.push({
        ...row,
        id: existing,
        status: "open",
        updated_at: new Date().toISOString(),
      });
    // Unassigned: a person takes it, or a manager gives it out (Exception Queue). Nobody is made the owner just by running recon.
    else inserts.push({ ...row, status: "open", owner_id: null, created_by: ctx.userId });
  }
  for (let i = 0; i < updates.length; i += 200) {
    const { error } = await db
      .from("ca_exceptions")
      .upsert(updates.slice(i, i + 200), { onConflict: "id" });
    if (error) throw new PracticeError("db_error", error.message);
  }
  for (let i = 0; i < inserts.length; i += 200) {
    let batch = inserts.slice(i, i + 200);
    let { error } = await db.from("ca_exceptions").insert(batch);
    // Before the team-work database change is applied there is no created_by column: record without it.
    if (error && /created_by/.test(error.message)) {
      batch = batch.map(({ created_by: _c, ...rest }) => rest);
      ({ error } = await db.from("ca_exceptions").insert(batch));
    }
    if (error && /duplicate key/i.test(error.message)) {
      // One line already has an open exception (the index allows one per line). That must not drop the other rows of the batch:
      // insert them one by one and skip only the ones that already exist.
      for (const row of batch) {
        const { error: rowErr } = await db.from("ca_exceptions").insert(row);
        if (rowErr && !/duplicate key/i.test(rowErr.message)) throw new PracticeError("db_error", rowErr.message);
      }
    } else if (error) throw new PracticeError("db_error", error.message);
  }
  const excIds = outcome.exceptions.map((e) => e.txn_id);
  for (let i = 0; i < excIds.length; i += 500) {
    await db
      .from("ca_txns")
      .update({ match_status: "exception" })
      .in("id", excIds.slice(i, i + 500))
      .eq("match_status", "unmatched");
  }

  const matchedTotal = (alreadyMatched ?? 0) + written;
  const summary: ReconSummary = {
    run_id: run.id,
    period,
    bank: bank.length,
    books: books.length,
    matched: written,
    matched_total: matchedTotal,
    exceptions: decisionCount(outcome.exceptions),
    matched_by_stage: outcome.stats.matched_by_stage,
    exceptions_by_reason: outcome.stats.exceptions_by_reason,
    message: reconMessage(written, bank.length, alreadyMatched ?? 0, outcome.stats.matched_by_stage, decisionCount(outcome.exceptions)) + (transfers.length ? ` ${transfers.length} transfer${transfers.length === 1 ? "" : "s"} between the client's own accounts paired and set aside.` : "") + (reversals.length ? ` ${reversals.length} payment${reversals.length === 1 ? "" : "s"} reversed by the bank paired and set aside.` : "") + (awaiting ? ` ${awaiting} book entr${awaiting === 1 ? "y" : "ies"} for bank accounts with no statement yet ${awaiting === 1 ? "is" : "are"} waiting for it.` : ""),
    own_transfers: transfers.length,
    reversed_payments: reversals.length,
    awaiting_statement: awaiting,
  };
  await db
    .from("ca_recon_runs")
    .update({
      matched: matchedTotal,
      snapshot: { status: "done", period, stats: outcome.stats, written },
    })
    .eq("id", run.id);
  await logActivity(
    db,
    ctx.firmId,
    businessId,
    "recon",
    `Recon for ${client.client_name}, ${period.label}: ${summary.message}`,
  );
  // The proof runs on what was stored, after everything else. A failure is recorded on the run and in the activity, and returned.
  try {
    summary.proof = await proveStored(db, ctx, businessId, period);
    await db.from("ca_recon_runs").update({ snapshot: { status: "done", period, stats: outcome.stats, written, proof: { ok: summary.proof.ok, failed: summary.proof.checks.filter((c) => !c.ok).map((c) => c.id) } } }).eq("id", run.id);
    if (!summary.proof.ok) await logActivity(db, ctx.firmId, businessId, "recon", `Self-check FAILED for ${client.client_name}, ${period.label}: ${summary.proof.checks.filter((c) => !c.ok).map((c) => `${c.id} ${c.detail}`).join(" ")}`.slice(0, 1900));
  } catch (e) {
    console.error(`[recon] proof for ${businessId} could not run: ${(e as Error).message}`);
  }
  return summary;
}

/**
 * Proves the stored matches of a client and period against the stored lines (RC-6). Reads the same rows the screens read, so a
 * counter that disagrees with its list, a line used twice or a match that does not net to zero is found here before a person sees it.
 */
export async function proveStored(db: Db, ctx: FirmContext, businessId: string, period: { start: string; end: string }): Promise<Proof> {
  const from = shiftDay(period.start, -45);
  const to = shiftDay(period.end, 45);
  const rows = await fetchAll<ProofTxn & { id: string }>((a, b) =>
    db.from("ca_txns").select("id, side, direction, amount, txn_date, match_status").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).gte("txn_date", from).lte("txn_date", to).order("id").range(a, b),
  );
  const { data } = await db
    .from("ca_recon_matches")
    .select("bank_txn_id, book_txn_ids, match_stage, explanation")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .lte("period_start", period.end)
    .gte("period_end", period.start);
  const matches = ((data ?? []) as (ProofMatch & { book_txn_ids: string[] | null })[]).map((m) => ({ ...m, book_txn_ids: m.book_txn_ids ?? [] }));
  return proveReconciliation(rows.map((r) => ({ ...r, amount: Number(r.amount) })), matches, period);
}

const shiftDay = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const OWN_TAG = "own_account:";
const REV_TAG = "reversal:";
/** A book entry for a bank account whose statement for that month has not arrived: set aside, and put back when the next run finds the statement. */
export const AWAIT_TAG = "awaiting_statement";

/**
 * The last 4 digits of the bank account a book line names: the first bracketed bank ledger with digits, because the Day Book reader
 * writes "Party (Indian bank CA 7856871247)" and any narration follows it. "Payment (Indian bank CA 7856871247) rent" gives "1247".
 */
export function ledgerTail(description: string | null | undefined): string | null {
  for (const m of String(description ?? "").matchAll(/\(([^()]*)\)/g)) {
    const group = m[1]!;
    const run = [...group.matchAll(/\d{4,}/g)].pop()?.[0];
    if (run && isBankLedgerName(group)) return run.slice(-4);
  }
  return null;
}

/**
 * The account a bank statement belongs to, as the last 4 digits. Read from what was recorded at upload; for older uploads that never
 * recorded it, from the statement's own text, then from the file name ("ICICI CA 110805501053 (1053) - Statement"). Without this an
 * old upload has no account, every bank line is matched against every account's book entries in one pile, and the result is worse
 * than the same files uploaded today.
 */
export function accountTailOf(d: { acct?: string | null; preview?: string | null; filename?: string | null }): string | null {
  const t4 = (x: string | null | undefined) => {
    const digits = String(x ?? "").replace(/\D/g, "");
    return digits.length >= 4 ? digits.slice(-4) : null;
  };
  const direct = t4(d.acct);
  if (direct) return direct;
  const fromText = t4(statementAccount(d.preview ?? "", d.filename ?? "").accountNo);
  if (fromText) return fromText;
  const named = /(?<!\d)(\d{6,})(?!\d)/.exec(d.filename ?? "");
  return named ? named[1]!.slice(-4) : null;
}

export interface StatementAccount {
  id: string;
  tail: string | null;
  first: string | null;
  last: string | null;
}

/** Every bank statement of the client with its account. Where an old upload lacked it, what was found is saved, so this heals once. */
export async function loadStatementAccounts(db: Db, firmId: string, businessId: string): Promise<StatementAccount[]> {
  const { data } = await db
    .from("ca_document_extractions")
    .select("id, original_filename, acct:extracted->>account_no, preview:extracted->>text_preview, first:extracted->statement_check->>first, last:extracted->statement_check->>last, pfrom:extracted->statement_period->>from, pto:extracted->statement_period->>to")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("side", "bank");
  const out: StatementAccount[] = [];
  for (const d of (data ?? []) as { id: string; original_filename: string | null; acct: string | null; preview: string | null; first: string | null; last: string | null; pfrom?: string | null; pto?: string | null }[]) {
    const tail = accountTailOf({ acct: d.acct, preview: d.preview, filename: d.original_filename });
    let { first, last } = d;
    // The statement's own header says which months it covers; its lines can start later (no entries in April to June).
    if (d.pfrom && d.pto) { first = d.pfrom; last = d.pto; }
    // An older upload never recorded the dates the statement covers. Its own lines always carry them, so use those: a statement
    // with no recorded dates must not be taken to cover every month.
    if (!first || !last) {
      const lo = await db.from("ca_txns").select("txn_date").eq("extraction_id", d.id).order("txn_date", { ascending: true }).limit(1);
      const hi = await db.from("ca_txns").select("txn_date").eq("extraction_id", d.id).order("txn_date", { ascending: false }).limit(1);
      first = first ?? (lo.data?.[0]?.txn_date ? String(lo.data[0].txn_date) : null);
      last = last ?? (hi.data?.[0]?.txn_date ? String(hi.data[0].txn_date) : null);
    }
    out.push({ id: d.id, tail, first, last });
    if (tail && !String(d.acct ?? "").replace(/\D/g, "")) {
      // Save it on the document, best effort, so the next run needs no guessing.
      try {
        const found = statementAccount(d.preview ?? "", d.original_filename ?? "").accountNo ?? tail;
        const { data: row } = await db.from("ca_document_extractions").select("extracted").eq("id", d.id).maybeSingle();
        if (row) await db.from("ca_document_extractions").update({ extracted: { ...((row.extracted as Record<string, unknown>) ?? {}), account_no: found } }).eq("id", d.id);
      } catch {
        /* the guess still works for this run */
      }
    }
  }
  return out;
}

/** Which account a line belongs to: a bank line by its statement, a book entry by the bank ledger it names. Null when it does not say. */
async function accountOfFn(db: Db, firmId: string, businessId: string): Promise<(t: { id: string; side: string; description?: string | null }) => string | null> {
  const tails = new Map<string, string>();
  for (const d of await loadStatementAccounts(db, firmId, businessId)) if (d.tail) tails.set(d.id, d.tail);
  return (t) => (t.side === "bank" ? (tails.get((t as unknown as TxnRow).extraction_id ?? "") ?? null) : ledgerTail(t.description));
}

async function splitAwaitingStatement(db: Db, firmId: string, businessId: string, books: TxnRow[]): Promise<{ books: TxnRow[]; awaiting: number; awaitingIds: string[] }> {
  const data = await loadStatementAccounts(db, firmId, businessId);
  // What each account's statements cover, by month. An account that has a statement for December but none for September is still
  // waiting for September's: waiting is per account and month, not per account.
  const cover = new Map<string, { from: string; to: string }[]>();
  for (const d of data) {
    const t = d.tail ?? "";
    if (t.length !== 4) continue;
    const list = cover.get(t) ?? cover.set(t, []).get(t)!;
    // A statement that does not say its dates covers everything (the earlier, safer reading).
    list.push({ from: d.first ? String(d.first).slice(0, 7) : "0000-00", to: d.last ? String(d.last).slice(0, 7) : "9999-99" });
  }
  // With no statement that names its account there is nothing to compare an account with: leave every entry in.
  if (!cover.size) return { books, awaiting: 0, awaitingIds: [] };
  const keep: TxnRow[] = [];
  let awaiting = 0;
  const awaitingIds: string[] = [];
  for (const b of books) {
    const t = ledgerTail(b.description);
    const month = String(b.txn_date).slice(0, 7);
    const spans = t ? cover.get(t) : null;
    if (t && (!spans || !spans.some((c) => month >= c.from && month <= c.to))) {
      awaiting++;
      awaitingIds.push(b.id);
    } else keep.push(b);
  }
  return { books: keep, awaiting, awaitingIds };
}

/**
 * Finds transfers between the client's own bank accounts and sets both legs aside (ignored, tagged with the other leg). Only a
 * pair with clear evidence is made (see recon/ownTransfers.ts); nothing is deleted, and an open exception on either leg is closed
 * with the evidence as its note. Undone with unpairOwnTransfer.
 */
export async function pairAccountTransfers(db: Db, ctx: FirmContext, businessId: string, period: Period): Promise<TransferPair[]> {
  const wide = { ...period, start: shiftDay(period.start, -2), end: shiftDay(period.end, 2) };
  const rows = (await loadScope(db, ctx.firmId, businessId, wide, ["unmatched", "exception"])).filter((t) => t.side === "bank" && t.extraction_id);
  if (rows.length < 2) return [];
  const extIds = [...new Set(rows.map((r) => r.extraction_id as string))];
  if (extIds.length < 2) return []; // both legs are never on one statement
  const tails = new Map((await loadStatementAccounts(db, ctx.firmId, businessId)).filter((d) => extIds.includes(d.id)).map((d) => [d.id, d.tail]));
  const pairs = pairOwnTransfers(
    rows.map((t) => ({ id: t.id, extractionId: t.extraction_id, direction: t.direction as "in" | "out", amount: t.amount, date: String(t.txn_date), reference: t.reference, description: t.description, accountTail: tails.get(t.extraction_id as string) ?? null })),
  ).filter((p) => p.out.date >= period.start && p.out.date <= period.end || p.in.date >= period.start && p.in.date <= period.end);
  const done: TransferPair[] = [];
  for (const p of pairs) {
    const a = await db.from("ca_txns").update({ match_status: "ignored", recon_tag: `${OWN_TAG}${p.in.id}` }).eq("id", p.out.id).in("match_status", ["unmatched", "exception"]).select("id");
    const b = await db.from("ca_txns").update({ match_status: "ignored", recon_tag: `${OWN_TAG}${p.out.id}` }).eq("id", p.in.id).in("match_status", ["unmatched", "exception"]).select("id");
    if (!a.data?.length || !b.data?.length) {
      // One leg was taken meanwhile: put back whichever we changed.
      if (a.data?.length) await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("id", p.out.id);
      if (b.data?.length) await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("id", p.in.id);
      continue;
    }
    await db
      .from("ca_exceptions")
      .update({ status: "resolved", resolution_action: "own_account_transfer", resolution_note: p.evidence, resolved_at: new Date().toISOString() })
      .in("txn_id", [p.out.id, p.in.id])
      .eq("status", "open");
    done.push(p);
  }
  if (done.length)
    await logActivity(db, ctx.firmId, businessId, "recon", `Paired ${done.length} transfer${done.length === 1 ? "" : "s"} between the client's own accounts: ${done.slice(0, 5).map((p) => `₹${p.out.amount.toLocaleString("en-IN")} on ${p.out.date}`).join("; ")}${done.length > 5 ? "; and more" : ""}. Each pair has the same amount, opposite directions, dates within two days and a shared reference or an account named.`.slice(0, 1900));
  return done;
}

/**
 * The two book legs of a contra entry (a bank ledger whose counter-ledger is another bank ledger, same amount, opposite directions,
 * within two days) that a proven bank transfer of the same amount accounts for. Returns the ids set aside; undone with unpairOwnTransfer.
 */
export async function pairContraBookLegs(db: Db, books: TxnRow[], transfers: TransferPair[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (!transfers.length) return set;
  const DAY = 86_400_000;
  const cents = (n: number) => Math.round(n * 100);
  const party = (d: string | null) => String(d ?? "").replace(/\s*\(.*$/s, "");
  const tailOf = (text: string) => ledgerTail(`(${text})`);
  const legs = books.filter((b) => {
    const p = party(b.description);
    return isBankLedgerName(p) && ledgerTail(b.description);
  });
  for (const tr of transfers) {
    const near = (b: TxnRow) => cents(b.amount) === cents(tr.out.amount) && Math.abs(Date.parse(String(b.txn_date)) - Date.parse(tr.out.date)) <= 4 * DAY;
    const pool = legs.filter((b) => !set.has(b.id) && near(b));
    for (const a of pool) {
      if (set.has(a.id)) continue;
      const mate = pool.find((b) => b.id !== a.id && !set.has(b.id) && b.direction !== a.direction && tailOf(party(b.description)) === ledgerTail(a.description) && tailOf(party(a.description)) === ledgerTail(b.description));
      if (!mate) continue;
      const x = await db.from("ca_txns").update({ match_status: "ignored", recon_tag: `${OWN_TAG}${mate.id}` }).eq("id", a.id).in("match_status", ["unmatched", "exception"]).select("id");
      const y = await db.from("ca_txns").update({ match_status: "ignored", recon_tag: `${OWN_TAG}${a.id}` }).eq("id", mate.id).in("match_status", ["unmatched", "exception"]).select("id");
      if (!x.data?.length || !y.data?.length) {
        if (x.data?.length) await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("id", a.id);
        if (y.data?.length) await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("id", mate.id);
        continue;
      }
      await db.from("ca_exceptions").update({ status: "resolved", resolution_action: "own_account_transfer", resolution_note: "Contra entry in the books for a transfer the bank statements prove.", resolved_at: new Date().toISOString() }).in("txn_id", [a.id, mate.id]).eq("status", "open");
      set.add(a.id); set.add(mate.id);
      break;
    }
  }
  return set;
}

/**
 * A payment the bank took and gave back (a UPI debit and its RVSL credit on one statement) nets to nothing. Both lines are set aside
 * together, tagged with each other, unless the books have an entry for that payment, in which case normal matching decides. Undone with
 * unpairOwnTransfer, like an own-account transfer.
 */
export async function pairReversedPayments(db: Db, ctx: FirmContext, businessId: string, bank: TxnRow[], books: TxnRow[]): Promise<ReversalPair[]> {
  const legs = bank.filter((t) => t.extraction_id).map((t) => ({ id: t.id, extractionId: t.extraction_id, direction: t.direction as "in" | "out", amount: t.amount, date: String(t.txn_date), description: t.description }));
  const pairs = pairReversals(legs);
  if (!pairs.length) return [];
  const DAY = 86_400_000;
  const booked = (p: ReversalPair) => books.some((b) => b.direction === "out" && Math.round(b.amount * 100) === Math.round(p.out.amount * 100) && Math.abs(Date.parse(String(b.txn_date)) - Date.parse(p.out.date)) <= 5 * DAY);
  const done: ReversalPair[] = [];
  for (const p of pairs.filter((x) => !booked(x))) {
    const a = await db.from("ca_txns").update({ match_status: "ignored", recon_tag: `${REV_TAG}${p.in.id}` }).eq("id", p.out.id).in("match_status", ["unmatched", "exception"]).select("id");
    const b = await db.from("ca_txns").update({ match_status: "ignored", recon_tag: `${REV_TAG}${p.out.id}` }).eq("id", p.in.id).in("match_status", ["unmatched", "exception"]).select("id");
    if (!a.data?.length || !b.data?.length) {
      if (a.data?.length) await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("id", p.out.id);
      if (b.data?.length) await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).eq("id", p.in.id);
      continue;
    }
    await db.from("ca_exceptions").update({ status: "resolved", resolution_action: "payment_reversed", resolution_note: p.evidence, resolved_at: new Date().toISOString() }).in("txn_id", [p.out.id, p.in.id]).eq("status", "open");
    done.push(p);
  }
  if (done.length)
    await logActivity(db, ctx.firmId, businessId, "recon", `Paired ${done.length} payment${done.length === 1 ? "" : "s"} the bank reversed: ${done.slice(0, 5).map((p) => `₹${p.out.amount.toLocaleString("en-IN")} on ${p.out.date}`).join("; ")}${done.length > 5 ? "; and more" : ""}. Each debit has a credit marked as a reversal for the same amount, and the books have no entry for it.`.slice(0, 1900));
  return done;
}

/** The lines set aside automatically (own-account transfers and reversed payments), newest first, so a person can check and undo them. */
export async function listOwnTransfers(db: Db, ctx: FirmContext, businessId?: string) {
  const out: { kind: "own_account" | "reversal"; outId: string; inId: string; businessId: string; amount: number; date: string; outNarration: string; inNarration: string }[] = [];
  for (const [tag, kind] of [[OWN_TAG, "own_account"], [REV_TAG, "reversal"]] as const) {
    let q = db.from("ca_txns").select("id, business_id, direction, amount, txn_date, description, reference, recon_tag").eq("ca_firm_id", ctx.firmId).like("recon_tag", `${tag}%`).order("txn_date", { ascending: false }).limit(400);
    if (businessId) q = q.eq("business_id", businessId);
    const { data } = await q;
    const rows = (data ?? []) as { id: string; business_id: string; direction: string; amount: number | string; txn_date: string; description: string | null; reference: string | null; recon_tag: string }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.direction !== "out" || seen.has(r.id)) continue;
      const other = byId.get(r.recon_tag.slice(tag.length));
      if (!other) continue;
      seen.add(r.id);
      out.push({ kind, outId: r.id, inId: other.id, businessId: r.business_id, amount: Number(r.amount), date: String(r.txn_date), outNarration: r.description ?? "", inNarration: other.description ?? "" });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Puts both legs back as ordinary unmatched lines, for the next recon run to treat on their own. */
export async function unpairOwnTransfer(db: Db, ctx: FirmContext, txnId: string, note?: string) {
  const { data: t } = await db.from("ca_txns").select("id, business_id, recon_tag").eq("id", txnId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  const tag = String(t?.recon_tag ?? "");
  const prefix = tag.startsWith(OWN_TAG) ? OWN_TAG : tag.startsWith(REV_TAG) ? REV_TAG : null;
  if (!t || !prefix) throw new PracticeError("not_found", "That line is not a paired transfer or reversal.");
  const other = tag.slice(prefix.length);
  await db.from("ca_txns").update({ match_status: "unmatched", recon_tag: null }).in("id", [t.id, other]).eq("ca_firm_id", ctx.firmId).like("recon_tag", `${prefix}%`);
  await logActivity(db, ctx.firmId, t.business_id, "recon", `Un-paired ${prefix === REV_TAG ? "a reversed payment" : "a transfer between the client's own accounts"}${note ? `: ${note.slice(0, 200)}` : ""}. Both lines are open again; run recon to treat them.`);
  return { ok: true };
}

function exceptionRow(
  ctx: FirmContext,
  businessId: string,
  period: Period,
  runId: string,
  e: ExceptionDecision,
  t: TxnRow,
) {
  return {
    ca_firm_id: ctx.firmId,
    business_id: businessId,
    source: "recon",
    reason_code: e.reason_code,
    description: (t.description || t.counterparty || "Transaction").slice(
      0,
      500,
    ),
    detail: e.detail,
    amount: signedAmount(t),
    severity: severityFor(t.amount),
    txn_id: t.id,
    txn_side: e.side,
    stage_reached: e.stage_reached,
    candidates: e.candidates,
    period_start: period.start,
    period_end: period.end,
    recon_run_id: runId,
  };
}

/* ── exception decisions ────────────────────────────────── */

export type ExceptionAction = "match" | "reconciled_external" | "ignore";

export async function resolveException(
  db: Db,
  ctx: FirmContext,
  exceptionId: string,
  action: ExceptionAction,
  counterpartIds: string[] = [],
  note?: string,
  opts: { allowDifference?: boolean } = {},
) {
  const { data: ex } = await db
    .from("ca_exceptions")
    .select("*")
    .eq("id", exceptionId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!ex) throw new PracticeError("not_found", "Exception not found.");
  if (ex.status !== "open") return { status: ex.status };
  const now = new Date().toISOString();
  const close = (
    status: "resolved" | "ignored",
    resolution_action: string,
    resolution_note: string,
  ) =>
    db
      .from("ca_exceptions")
      .update({
        status,
        resolved_by: ctx.userId,
        resolved_at: now,
        resolution_action,
        resolution_note,
      })
      .eq("id", ex.id);

  // Exceptions raised before transactions existed (legacy rows) carry no txn_id.
  if (!ex.txn_id) {
    await close(
      action === "ignore" ? "ignored" : "resolved",
      action,
      note ?? "",
    );
    await logActivity(
      db,
      ctx.firmId,
      ex.business_id,
      "recon",
      `Exception "${ex.description ?? ex.reason_code}" ${action === "ignore" ? "ignored" : "resolved"}.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
    );
    return { status: action === "ignore" ? "ignored" : "resolved" };
  }

  const { data: txnRaw } = await db
    .from("ca_txns")
    .select(TXN_COLS)
    .eq("id", ex.txn_id)
    .maybeSingle();
  if (!txnRaw)
    throw new PracticeError(
      "not_found",
      "The transaction behind this exception no longer exists.",
    );
  const txn = num(txnRaw as TxnRow);

  if (action === "ignore") {
    await db
      .from("ca_txns")
      .update({ match_status: "ignored" })
      .eq("id", txn.id);
    await close("ignored", "ignore", note ?? "Ignored");
    // The Recon agent remembers the decision and proposes it for the same line next month.
    const { rememberDecision } = await import("./orchestrator.server");
    await rememberDecision(db, ctx, ex.business_id, txn, { action: "ignore", note: note ?? "", reason_code: ex.reason_code }).catch(() => null);
    await logActivity(
      db,
      ctx.firmId,
      ex.business_id,
      "recon",
      `Exception ignored: ${txn.description ?? ""} (${REASON_LABELS[ex.reason_code as keyof typeof REASON_LABELS] ?? ex.reason_code}).${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
    );
    return { status: "ignored" };
  }

  if (action === "reconciled_external") {
    if (txn.side === "bank") {
      const { error } = await db.from("ca_recon_matches").insert({
        ca_firm_id: ctx.firmId,
        business_id: ex.business_id,
        period_start: ex.period_start,
        period_end: ex.period_end,
        bank_txn_id: txn.id,
        book_txn_ids: [],
        match_stage: "external",
        match_score: 1,
        explanation: { note: note ?? "Reconciled outside FynHelp" },
        matched_by: ctx.userId,
        notes: note ?? null,
      });
      if (error) throw new PracticeError("db_error", error.message);
    }
    await db
      .from("ca_txns")
      .update({ match_status: "matched" })
      .eq("id", txn.id);
    await close(
      "resolved",
      "reconciled_external",
      note ?? "Marked as reconciled externally",
    );
    const { rememberDecision } = await import("./orchestrator.server");
    await rememberDecision(db, ctx, ex.business_id, txn, { action: "reconciled_external", note: note ?? "", reason_code: ex.reason_code }).catch(() => null);
    await logActivity(
      db,
      ctx.firmId,
      ex.business_id,
      "recon",
      `Marked reconciled externally: ${txn.description ?? ""}.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
    );
    return { status: "resolved" };
  }

  // Manual match.
  const ids = [
    ...new Set(
      counterpartIds.length
        ? counterpartIds
        : ((ex.candidates ?? []) as { txn_id: string }[])
            .slice(0, 1)
            .map((c) => c.txn_id),
    ),
  ];
  if (!ids.length)
    throw new PracticeError(
      "invalid",
      "Pick the entry this transaction matches.",
    );
  const { data: others } = await db
    .from("ca_txns")
    .select(TXN_COLS)
    .in("id", ids)
    .eq("ca_firm_id", ctx.firmId);
  const parts = ((others ?? []) as TxnRow[]).map(num);
  if (parts.length !== ids.length)
    throw new PracticeError(
      "not_found",
      "One of the chosen entries was not found.",
    );
  if (parts.some((p) => p.business_id !== txn.business_id))
    throw new PracticeError(
      "invalid",
      "Entries must belong to the same client.",
    );
  if (parts.some((p) => p.match_status === "matched"))
    throw new PracticeError(
      "conflict",
      "One of the chosen entries is already matched.",
    );

  const all = [txn, ...parts];
  const bankSide = all.filter((t) => t.side === "bank");
  const bookSide = all.filter((t) => t.side === "books");
  if (!bankSide.length || !bookSide.length || (bankSide.length > 1 && bookSide.length > 1))
    throw new PracticeError(
      "invalid",
      "Match one bank line with one or more book entries, or several bank lines with one book entry.",
    );
  if (all.some((t) => t.direction !== txn.direction))
    throw new PracticeError(
      "invalid",
      "Money in can only match money in, and money out only money out.",
    );
  const diff =
    Math.abs(
      bankSide.reduce((s, b) => s + toPaise(b.amount), 0) -
        bookSide.reduce((s, b) => s + toPaise(b.amount), 0),
    ) / 100;
  // A difference is never accepted silently: the person confirms it with a reason.
  if (diff > 0 && !opts.allowDifference)
    throw new PracticeError(
      "needs_confirmation",
      `These entries differ by ₹${diff.toLocaleString("en-IN")}. Add the other part of the payment, or confirm the difference with a note.`,
    );
  if (diff > 0 && !note?.trim())
    throw new PracticeError("invalid", "Add a note saying why the amounts differ.");

  const group = bankSide.length > 1 ? `manual:${bookSide[0].id}` : undefined;
  const { error } = await db.from("ca_recon_matches").insert(
    bankSide.map((bk, i) => ({
      ca_firm_id: ctx.firmId,
      business_id: ex.business_id,
      period_start: ex.period_start,
      period_end: ex.period_end,
      bank_txn_id: bk.id,
      book_txn_ids: bookSide.map((b) => b.id),
      match_stage: "manual",
      match_score: 1,
      explanation: {
        amount_diff: round2(diff),
        note: note ?? null,
        ...(group ? { group, part: `${i + 1} of ${bankSide.length}` } : {}),
      },
      matched_by: ctx.userId,
      notes: note ?? null,
    })),
  );
  if (error)
    throw new PracticeError(
      /duplicate key/i.test(error.message) ? "conflict" : "db_error",
      /duplicate key/i.test(error.message)
        ? "That bank line is already matched."
        : error.message,
    );
  await db
    .from("ca_txns")
    .update({ match_status: "matched" })
    .in(
      "id",
      all.map((t) => t.id),
    );
  await db
    .from("ca_exceptions")
    .update({
      status: "resolved",
      resolved_by: ctx.userId,
      resolved_at: now,
      resolution_action: "matched_manually",
      resolution_note: diff
        ? `${note?.trim() ? `${note.trim()} · ` : ""}Matched with a difference of ₹${diff.toLocaleString("en-IN")}`
        : (note ?? "Matched manually"),
    })
    .in(
      "txn_id",
      all.map((t) => t.id),
    )
    .eq("status", "open");
  await logActivity(
    db,
    ctx.firmId,
    ex.business_id,
    "recon",
    `Matched manually: ${txn.description ?? ""} with ${parts.length} entr${parts.length === 1 ? "y" : "ies"}${diff ? ` (difference ₹${diff.toLocaleString("en-IN")})` : ""}.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
  );
  // Memory: a person matched two differently named parties, so the rules
  // stage can match them by itself next time. Only from clean one-to-one
  // matches: a difference or a split says nothing reliable about names.
  if (bookSide.length === 1 && bankSide.length === 1 && diff === 0) {
    const { learnAlias } = await import("./orchestrator.server");
    await learnAlias(db, ctx, bankSide[0], bookSide[0]).catch(() => null);
  }
  return { status: "resolved", amount_difference: diff };
}

export async function reverseMatch(
  db: Db,
  ctx: FirmContext,
  matchId: string,
  note?: string,
) {
  const { data: m } = await db
    .from("ca_recon_matches")
    .select("*")
    .eq("id", matchId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!m) throw new PracticeError("not_found", "Match not found.");
  if (m.status !== "active") return { status: m.status };
  // A part payment is several rows sharing one book entry: reverse them together.
  const group = (m.explanation as { group?: string } | null)?.group;
  let rows = [m];
  if (group) {
    const { data: siblings } = await db
      .from("ca_recon_matches")
      .select("*")
      .eq("ca_firm_id", ctx.firmId)
      .eq("business_id", m.business_id)
      .eq("status", "active")
      .contains("explanation", { group });
    if (siblings?.length) rows = siblings;
  }
  await db
    .from("ca_recon_matches")
    .update({
      status: "reversed",
      reversed_by: ctx.userId,
      reversed_at: new Date().toISOString(),
      notes: note ?? m.notes,
    })
    .in("id", rows.map((r) => r.id));
  await db
    .from("ca_txns")
    .update({ match_status: "unmatched" })
    .in("id", [...new Set(rows.flatMap((r) => [r.bank_txn_id, ...(r.book_txn_ids ?? [])]))]);
  await logActivity(
    db,
    ctx.firmId,
    m.business_id,
    "recon",
    `Match reversed${note ? `: ${note}` : ""}. The lines go back into the next recon run.`,
  );
  return { status: "reversed" };
}

/** Everything that ever happened to one transaction, for the click-through drawer. */
export async function transactionHistory(
  db: Db,
  ctx: FirmContext,
  txnId: string,
) {
  const { data: txn } = await db
    .from("ca_txns")
    .select("*")
    .eq("id", txnId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!txn) throw new PracticeError("not_found", "Transaction not found.");
  const [asBank, asBook, exceptions, review, doc] = await Promise.all([
    db
      .from("ca_recon_matches")
      .select("*")
      .eq("bank_txn_id", txnId)
      .order("matched_at"),
    db
      .from("ca_recon_matches")
      .select("*")
      .contains("book_txn_ids", [txnId])
      .order("matched_at"),
    db
      .from("ca_exceptions")
      .select(
        "id, reason_code, detail, status, stage_reached, candidates, created_at, resolved_at, resolution_action, resolution_note",
      )
      .eq("txn_id", txnId)
      .order("created_at"),
    txn.review_item_id
      ? db
          .from("ca_review_items")
          .select(
            "id, raw_text, proposed, corrected, reason, confidence, resolved_at",
          )
          .eq("id", txn.review_item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    txn.extraction_id
      ? db
          .from("ca_document_extractions")
          .select(
            "id, original_filename, source_type, gmail_sender_email, gmail_subject, source_metadata, created_at",
          )
          .eq("id", txn.extraction_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const matches = [...(asBank.data ?? []), ...(asBook.data ?? [])];
  const counterpartIds = [
    ...new Set(
      matches
        .flatMap((m) => [m.bank_txn_id, ...(m.book_txn_ids ?? [])])
        .filter((id) => id !== txnId),
    ),
  ];
  const { data: counterparts } = counterpartIds.length
    ? await db
        .from("ca_txns")
        .select(
          "id, side, direction, amount, txn_date, description, counterparty, reference",
        )
        .in("id", counterpartIds)
    : { data: [] };
  return {
    transaction: txn,
    source_document: doc.data,
    review: review.data,
    matches,
    counterparts: counterparts ?? [],
    exceptions: exceptions.data ?? [],
  };
}

/**
 * Undo a decision on an exception: a match made from it is reversed and the
 * line goes back into the queue, exactly as it was before.
 */
export async function reopenException(db: Db, ctx: FirmContext, exceptionId: string) {
  const { data: ex } = await db
    .from("ca_exceptions")
    .select("id, business_id, txn_id, status, resolution_action")
    .eq("id", exceptionId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!ex) throw new PracticeError("not_found", "Exception not found.");
  if (ex.status === "open") return { status: "open" };
  if (ex.txn_id) {
    const { data: m } = await db
      .from("ca_recon_matches")
      .select("id")
      .eq("ca_firm_id", ctx.firmId)
      .eq("status", "active")
      .or(`bank_txn_id.eq.${ex.txn_id},book_txn_ids.cs.{${ex.txn_id}}`)
      .limit(1)
      .maybeSingle();
    if (m) await reverseMatch(db, ctx, m.id, "Undone from the Exception Queue");
    await db.from("ca_txns").update({ match_status: "exception" }).eq("id", ex.txn_id).neq("match_status", "matched");
  }
  // Exceptions closed together with this one (its counterpart) reopen too.
  const { data: closedTogether } = await db
    .from("ca_exceptions")
    .select("id, txn_id")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", ex.business_id)
    .in("status", ["resolved", "ignored"])
    .eq("resolution_action", ex.resolution_action ?? "")
    .gte("resolved_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  const ids = [ex.id, ...((closedTogether ?? []).filter((c) => c.txn_id && c.id !== ex.id && ex.resolution_action === "matched_manually").map((c) => c.id))];
  await db
    .from("ca_exceptions")
    .update({ status: "open", resolved_by: null, resolved_at: null, resolution_action: null, resolution_note: null })
    .in("id", ids);
  if (ex.txn_id && (ex.resolution_action === "ignore" || ex.resolution_action === "reconciled_external")) {
    const { data: t } = await db.from("ca_txns").select("side, direction, description, counterparty").eq("id", ex.txn_id).maybeSingle();
    const { forgetDecision } = await import("./orchestrator.server");
    if (t) await forgetDecision(db, ex.business_id, t).catch(() => null);
  }
  await logActivity(db, ctx.firmId, ex.business_id, "recon", "A decision in the Exception Queue was undone.");
  return { status: "open" };
}


/**
 * After a person decides one exception, the others may still point at the
 * entry just used. Recompute only the reason, detail and suggestions of the
 * open exceptions for that month; nothing is matched or logged here.
 */
export async function refreshOpenReasons(db: Db, ctx: FirmContext, businessId: string, periodStart: string | null, periodEnd: string | null) {
  if (!periodStart || !periodEnd) return;
  const period = parsePeriod({ start: periodStart, end: periodEnd });
  const scope = await loadScope(db, ctx.firmId, businessId, period, ["unmatched", "exception"]);
  const bank = scope.filter((t) => t.side === "bank");
  const books = scope.filter((t) => t.side === "books");
  if (!bank.length && !books.length) return;
  const { rules, aliases } = await firmRules(db, ctx.firmId);
  // Only explain what is left: lines a person has not decided keep their exception.
  const outcome = withoutUnmatchedPairs(reconcileByAccount(bank, books, await accountOfFn(db, ctx.firmId, businessId), { rules, aliases, pairContext: await chequeContext(db, ctx.firmId, businessId, period) }), await unmatchedPairs(db, ctx.firmId, businessId), scope);
  const byTxn = new Map(outcome.exceptions.map((e) => [e.txn_id, e]));
  const { data: open } = await db
    .from("ca_exceptions")
    .select("id, txn_id")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("status", "open")
    .in("txn_id", scope.map((t) => t.id));
  const txnById = new Map(scope.map((t) => [t.id, t]));
  for (const row of open ?? []) {
    const e = row.txn_id ? byTxn.get(row.txn_id) : undefined;
    const t = row.txn_id ? txnById.get(row.txn_id) : undefined;
    if (!e || !t) continue;
    const fresh = exceptionRow(ctx, businessId, period, "", e, t);
    await db
      .from("ca_exceptions")
      .update({ reason_code: fresh.reason_code, detail: fresh.detail, candidates: fresh.candidates, stage_reached: fresh.stage_reached, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "open");
  }
}

/** Bank and book lines a partner unmatched, so Recon never pairs them again on its own. */
async function unmatchedPairs(db: Db, firmId: string, businessId: string) {
  const { data } = await db
    .from("ca_recon_matches")
    .select("bank_txn_id, book_txn_ids, reversed_at, reversed_by, notes, explanation")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("status", "reversed")
    .contains("explanation", { unmatched_by_partner: true })
    .limit(500);
  const out = new Map<string, { at: string; note: string | null; by: string | null }>();
  for (const r of data ?? [])
    for (const b of (r.book_txn_ids as string[]) ?? [])
      out.set(`${r.bank_txn_id}|${b}`, {
        at: String(r.reversed_at ?? ""),
        note: (r.notes as string | null) ?? null,
        by: ((r.explanation as { unmatched_by_name?: string } | null)?.unmatched_by_name as string | undefined) ?? null,
      });
  return out;
}

/**
 * A partner takes back a match Recon made: both sides go straight back into
 * the Exception Queue with the partner's note, and Recon will not pair them
 * again on its own.
 */
export async function unmatchFromRecon(db: Db, ctx: FirmContext, matchId: string, note: string) {
  const { canSignOff } = await import("./db.server");
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can unmatch a reconciled pair.");
  if (!note.trim()) throw new PracticeError("invalid", "Add a short note saying why the match is wrong.");
  const { data: m } = await db
    .from("ca_recon_matches")
    .select("id, business_id, period_start, period_end, explanation, bank_txn_id")
    .eq("id", matchId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!m) throw new PracticeError("not_found", "Match not found.");
  let byName = "a partner";
  try {
    const { data: u } = await db.auth.admin.getUserById(ctx.userId);
    byName = String((u?.user?.user_metadata as { full_name?: string } | undefined)?.full_name || u?.user?.email || byName);
  } catch {
    /* name is a nicety */
  }
  await db
    .from("ca_recon_matches")
    .update({ explanation: { ...((m.explanation as object) ?? {}), unmatched_by_partner: true, unmatched_by_name: byName } })
    .eq("id", matchId);
  await reverseMatch(db, ctx, matchId, note.trim());
  // Put both lines back in front of the team now, not at the next run.
  const { data: bankLine } = await db.from("ca_txns").select("txn_date").eq("id", m.bank_txn_id).maybeSingle();
  const month = String(m.period_start ?? bankLine?.txn_date ?? "").slice(0, 7);
  if (month) await runRecon(db, ctx, m.business_id as string, month);
  return { status: "unmatched" };
}
