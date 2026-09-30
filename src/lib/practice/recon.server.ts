/**
 * Recon agent — server side. Loads unmatched transactions for one client and
 * period, runs the deterministic engine, and writes matches and exceptions.
 * Re-running is idempotent: matched lines are excluded from the next run,
 * a bank line can be in only one live match, and each transaction has at most
 * one open exception which is updated in place.
 */
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
import {
  DEFAULT_RULES,
  REASON_LABELS,
  reconcile,
  type ExceptionDecision,
  type ReconRule,
  type ReconTxn,
} from "./recon/engine";

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
    aliases: aliases ?? [],
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
}

export async function runRecon(
  db: Db,
  ctx: FirmContext,
  businessId: string,
  periodInput: string | { start: string; end: string },
): Promise<ReconSummary> {
  const client = await assertClient(db, ctx, businessId);
  const period = parsePeriod(periodInput);
  const scope = await loadScope(db, ctx.firmId, businessId, period, [
    "unmatched",
    "exception",
  ]);
  const bank = scope.filter((t) => t.side === "bank");
  const books = scope.filter((t) => t.side === "books");
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
  if (!bookCount)
    return empty(
      `No book entries for ${period.label}. Upload the Tally export or ledger before running recon.`,
    );
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
  const outcome = reconcile(bank, books, { rules, aliases });

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
    else inserts.push({ ...row, status: "open", owner_id: ctx.userId });
  }
  for (let i = 0; i < updates.length; i += 200) {
    const { error } = await db
      .from("ca_exceptions")
      .upsert(updates.slice(i, i + 200), { onConflict: "id" });
    if (error) throw new PracticeError("db_error", error.message);
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await db
      .from("ca_exceptions")
      .insert(inserts.slice(i, i + 200));
    if (error && !/duplicate key/i.test(error.message))
      throw new PracticeError("db_error", error.message);
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
    exceptions: outcome.exceptions.length,
    matched_by_stage: outcome.stats.matched_by_stage,
    exceptions_by_reason: outcome.stats.exceptions_by_reason,
    message: `${written} of ${bank.length} bank lines matched (${outcome.stats.matched_by_stage.exact} exact, ${outcome.stats.matched_by_stage.fuzzy} fuzzy, ${outcome.stats.matched_by_stage.rules} by rules). ${outcome.exceptions.length} exception${outcome.exceptions.length === 1 ? "" : "s"} need a decision.`,
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
  return summary;
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
      `Exception "${ex.description ?? ex.reason_code}" ${action === "ignore" ? "ignored" : "resolved"}.`,
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
    await logActivity(
      db,
      ctx.firmId,
      ex.business_id,
      "recon",
      `Exception ignored: ${txn.description ?? ""} (${REASON_LABELS[ex.reason_code as keyof typeof REASON_LABELS] ?? ex.reason_code}).`,
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
    await logActivity(
      db,
      ctx.firmId,
      ex.business_id,
      "recon",
      `Marked reconciled externally: ${txn.description ?? ""}.`,
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
  if (bankSide.length !== 1 || bookSide.length < 1)
    throw new PracticeError(
      "invalid",
      "A match needs exactly one bank line and at least one book entry.",
    );
  if (all.some((t) => t.direction !== txn.direction))
    throw new PracticeError(
      "invalid",
      "Money in can only match money in, and money out only money out.",
    );
  const diff =
    Math.abs(
      toPaise(bankSide[0].amount) -
        bookSide.reduce((s, b) => s + toPaise(b.amount), 0),
    ) / 100;

  const { error } = await db.from("ca_recon_matches").insert({
    ca_firm_id: ctx.firmId,
    business_id: ex.business_id,
    period_start: ex.period_start,
    period_end: ex.period_end,
    bank_txn_id: bankSide[0].id,
    book_txn_ids: bookSide.map((b) => b.id),
    match_stage: "manual",
    match_score: 1,
    explanation: { amount_diff: round2(diff), note: note ?? null },
    matched_by: ctx.userId,
    notes: note ?? null,
  });
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
      resolution_note:
        note ??
        (diff ? `Matched with a difference of ₹${diff}` : "Matched manually"),
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
    `Matched manually: ${txn.description ?? ""} with ${parts.length} entr${parts.length === 1 ? "y" : "ies"}${diff ? ` (difference ₹${diff})` : ""}.`,
  );
  // Memory: a person matched two differently named parties, so the rules
  // stage can match them by itself next time.
  if (bookSide.length === 1) {
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
  await db
    .from("ca_recon_matches")
    .update({
      status: "reversed",
      reversed_by: ctx.userId,
      reversed_at: new Date().toISOString(),
      notes: note ?? m.notes,
    })
    .eq("id", m.id);
  await db
    .from("ca_txns")
    .update({ match_status: "unmatched" })
    .in("id", [m.bank_txn_id, ...(m.book_txn_ids ?? [])]);
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
