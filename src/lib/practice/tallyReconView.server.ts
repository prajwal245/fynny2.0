/**
 * The reconciliation view, server side: every bank line of a statement with the Tally entry it matched (or the nearest one),
 * and the two checks that protect an approval: the statement's account against the Tally bank ledger, and "Tally already
 * seems to have this".
 */
import type { Db, FirmContext } from "./db.server";
import {
  alreadyInTally,
  classifyLine,
  compareAccount,
  duplicateWarning,
  matchReason,
  splitDrCr,
  statementAccount,
  type AccountCheck,
  type BookEntry,
  type ReconRow,
  type StatementAccount,
} from "./tallyReconView";

type R = Record<string, unknown>;

const book = (t: R): BookEntry => ({
  id: String(t.id),
  date: String(t.txn_date),
  direction: t.direction as "in" | "out",
  amount: Number(t.amount),
  counterparty: (t.counterparty as string | null) ?? null,
  description: (t.description as string | null) ?? null,
  reference: (t.reference as string | null) ?? null,
  category: (t.category as string | null) ?? null,
});

export interface ReconViewRow extends ReconRow {
  txn_id: string;
  date: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  reference: string | null;
  debit: number | null;
  credit: number | null;
  /** Tally entries that look like this very transaction but were not paired with it (only for a missing line). */
  looksInTally: { entry: BookEntry; warning: string }[];
}

export interface ReconView {
  rows: ReconViewRow[];
  counts: { matched: number; partial: number; missing: number; pushed: number };
  statement: StatementAccount | null;
  /** The statement's account compared with each bank ledger of the company, by ledger name. */
  accountChecks: Record<string, AccountCheck>;
}

/** The account number and bank of the statement a bank line came from, read from the document's own text. */
export async function statementOf(
  db: Db,
  ctx: FirmContext,
  extractionId: string | null,
  businessId: string,
): Promise<StatementAccount | null> {
  let q = db
    .from("ca_document_extractions")
    .select("original_filename, extracted")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId);
  q = extractionId ? q.eq("id", extractionId) : q.eq("side", "bank");
  const { data } = await q.order("created_at", { ascending: false }).limit(1);
  const d = (data ?? [])[0] as
    | { original_filename?: string; extracted?: { text_preview?: string } }
    | undefined;
  if (!d) return null;
  return statementAccount(
    d.extracted?.text_preview ?? "",
    d.original_filename ?? "",
  );
}

/** Entries in the books that look like the same transaction as this line, so a push does not duplicate what Tally already has. */
export async function looksAlreadyInTally(
  db: Db,
  ctx: FirmContext,
  businessId: string,
  line: { direction: "in" | "out"; amount: number; date: string },
): Promise<BookEntry[]> {
  const from = new Date(Date.parse(`${line.date}T00:00:00Z`) - 3 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.parse(`${line.date}T00:00:00Z`) + 3 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data } = await db
    .from("ca_txns")
    .select(
      "id, txn_date, direction, amount, counterparty, description, reference, category, match_status",
    )
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "books")
    .eq("amount", line.amount)
    .eq("direction", line.direction)
    .gte("txn_date", from)
    .lte("txn_date", to)
    .limit(20);
  // One already paired with another bank line is accounted for; the rest are the ones to warn about.
  return alreadyInTally(
    line,
    ((data ?? []) as R[]).filter((t) => t.match_status !== "matched").map(book),
  );
}

export async function reconView(
  db: Db,
  ctx: FirmContext,
  businessId: string,
  opts: {
    documentId?: string | null;
    bankLedgers: string[];
    postedByTxn: Map<string, string>;
  },
): Promise<ReconView> {
  let q = db
    .from("ca_txns")
    .select(
      "id, txn_date, direction, amount, counterparty, description, reference, match_status, extraction_id",
    )
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "bank")
    .in("match_status", ["matched", "unmatched", "exception"]);
  if (opts.documentId) q = q.eq("extraction_id", opts.documentId);
  const { data: txns } = await q.order("txn_date").limit(1000);
  const bank = (txns ?? []) as R[];
  const ids = bank.map((t) => String(t.id));

  const [{ data: ms }, { data: exs }] = ids.length
    ? await Promise.all([
        db
          .from("ca_recon_matches")
          .select(
            "bank_txn_id, book_txn_ids, match_stage, match_score, explanation",
          )
          .eq("ca_firm_id", ctx.firmId)
          .eq("status", "active")
          .in("bank_txn_id", ids),
        db
          .from("ca_exceptions")
          .select("txn_id, reason_code, detail, candidates")
          .eq("ca_firm_id", ctx.firmId)
          .eq("status", "open")
          .in("txn_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const matches = new Map(
    ((ms ?? []) as R[]).map((m) => [String(m.bank_txn_id), m]),
  );
  const exceptions = new Map(
    ((exs ?? []) as R[]).map((e) => [String(e.txn_id), e]),
  );

  const bookIds = new Set<string>();
  for (const m of matches.values())
    for (const b of (m.book_txn_ids as string[]) ?? []) bookIds.add(b);
  for (const e of exceptions.values())
    for (const c of (e.candidates as { txn_id: string }[]) ?? [])
      bookIds.add(c.txn_id);
  const { data: bks } = bookIds.size
    ? await db
        .from("ca_txns")
        .select(
          "id, txn_date, direction, amount, counterparty, description, reference, category",
        )
        .eq("ca_firm_id", ctx.firmId)
        .in("id", [...bookIds])
    : { data: [] };
  const booksById = new Map(
    ((bks ?? []) as R[]).map((t) => [String(t.id), book(t)]),
  );

  const rows: ReconViewRow[] = [];
  const counts = { matched: 0, partial: 0, missing: 0, pushed: 0 };
  for (const t of bank) {
    const id = String(t.id);
    const direction = t.direction as "in" | "out";
    const amount = Number(t.amount);
    const date = String(t.txn_date);
    const m = matches.get(id);
    const e = exceptions.get(id);
    const cls = classifyLine({
      id,
      direction,
      amount,
      date,
      match: m
        ? {
            books: ((m.book_txn_ids as string[]) ?? [])
              .map((b) => booksById.get(b))
              .filter((b): b is BookEntry => Boolean(b)),
            stage: String(m.match_stage),
            score: Number(m.match_score),
            reason: matchReason(
              String(m.match_stage),
              Number(m.match_score),
              m.explanation as {
                amount_diff?: number;
                date_gap_days?: number;
              } | null,
            ),
          }
        : null,
      exception: e
        ? {
            reason_code: String(e.reason_code),
            detail: (e.detail as string | null) ?? null,
            candidates: (e.candidates as never) ?? [],
          }
        : null,
      posted: opts.postedByTxn.get(id) === "posted",
      booksById,
    });
    counts[cls.status]++;
    const looks =
      cls.status === "missing"
        ? await looksAlreadyInTally(db, ctx, businessId, {
            direction,
            amount,
            date,
          })
        : [];
    rows.push({
      ...cls,
      txn_id: id,
      date,
      direction,
      amount,
      particulars: String(t.counterparty ?? t.description ?? "No description"),
      reference: (t.reference as string | null) ?? null,
      ...splitDrCr(direction, amount),
      looksInTally: looks.map((b) => ({
        entry: b,
        warning: duplicateWarning(b),
      })),
    });
  }
  const statement = await statementOf(
    db,
    ctx,
    opts.documentId ?? null,
    businessId,
  );
  const accountChecks: Record<string, AccountCheck> = {};
  for (const l of opts.bankLedgers)
    accountChecks[l] = compareAccount(statement, l);
  return { rows, counts, statement, accountChecks };
}

/** What stops an approval until a person confirms it: a statement that seems to belong to another bank account, or a line Tally seems to hold already. */
export async function approvalHolds(
  db: Db,
  ctx: FirmContext,
  t: {
    business_id: string;
    extraction_id: string | null;
    direction: "in" | "out";
    amount: number;
    txn_date: string;
  },
  bankLedger: string,
  confirm: { bank?: boolean; notDuplicate?: boolean },
): Promise<{ code: string; message: string } | null> {
  const stmt = await statementOf(db, ctx, t.extraction_id, t.business_id);
  const check = compareAccount(stmt, bankLedger);
  if (check.state === "mismatch" && !confirm.bank)
    return {
      code: "bank_mismatch",
      message: `${check.message} Confirm that this statement belongs to this bank ledger before approving.`,
    };
  const looks = await looksAlreadyInTally(db, ctx, t.business_id, {
    direction: t.direction,
    amount: Number(t.amount),
    date: t.txn_date,
  });
  if (looks.length && !confirm.notDuplicate)
    return {
      code: "looks_duplicate",
      message: `${duplicateWarning(looks[0]!)} Confirm this is a different transaction before approving.`,
    };
  return null;
}
