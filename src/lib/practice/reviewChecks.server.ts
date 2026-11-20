/**
 * Review checks on a client's prepared books, read from the Day Books already uploaded (Tally Excel). Read-only: nothing here writes to
 * the books or to the client's records. Each Day Book file is read once; the same voucher appearing in two overlapping files counts once.
 */
import type { Db, FirmContext } from "./db.server";
import { BUCKET } from "./documents.server";
import { readDayBookVouchers, type Voucher } from "./review/dayBook";
import { reviewCash, type CashReview } from "./review/cash";
import { adjustmentRegister, type AdjustmentRow } from "./review/adjustments";
import { nearDuplicates, suggestLedgerMap, type MapSuggestion } from "./review/ledgerMap";

export interface ReviewChecks {
  files: number;
  vouchers: number;
  from: string | null;
  to: string | null;
  cash: CashReview;
  adjustments: AdjustmentRow[];
  adjustmentsTotal: number;
  ledgerMap: MapSuggestion[];
  duplicates: [string, string][];
  notes: string[];
}

export async function loadVouchers(db: Db, ctx: FirmContext, businessId: string): Promise<{ vouchers: Voucher[]; files: number }> {
  const { data } = await db
    .from("ca_document_extractions")
    .select("id, original_filename, storage_path, side")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "books")
    .limit(100);
  const docs = ((data ?? []) as { original_filename: string | null; storage_path: string | null }[]).filter((d) => d.storage_path && /\.(xlsx|xls)$/i.test(d.original_filename ?? ""));
  const seen = new Set<string>();
  const vouchers: Voucher[] = [];
  let files = 0;
  for (const d of docs) {
    const dl = await db.storage.from(BUCKET).download(d.storage_path!);
    if (dl.error || !dl.data) continue;
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(await dl.data.arrayBuffer()), { type: "array", raw: false });
    let got: Voucher[] = [];
    for (const name of wb.SheetNames) {
      got = readDayBookVouchers(XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }));
      if (got.length) break;
    }
    if (!got.length) continue;
    files++;
    for (const v of got) {
      const k = `${v.date}|${v.type}|${v.no}|${v.legs.map((l) => `${l.ledger}:${l.debit}:${l.credit}`).join(",")}`;
      if (!seen.has(k)) { seen.add(k); vouchers.push(v); }
    }
  }
  return { vouchers, files };
}

export async function runReviewChecks(db: Db, ctx: FirmContext, businessId: string, opts: { openingCash?: number | null } = {}): Promise<ReviewChecks> {
  const { vouchers, files } = await loadVouchers(db, ctx, businessId);
  const dates = vouchers.map((v) => v.date).sort();
  const adj = adjustmentRegister(vouchers);
  const names = [...new Set(vouchers.flatMap((v) => v.legs.map((l) => l.ledger)))].sort();
  return {
    files,
    vouchers: vouchers.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    cash: reviewCash(vouchers, { opening: opts.openingCash ?? null }),
    adjustments: adj.slice(0, 600),
    adjustmentsTotal: adj.length,
    ledgerMap: suggestLedgerMap(names.map((name) => ({ name }))),
    duplicates: nearDuplicates(names),
    notes: files ? [] : ["No Tally Day Book (Excel) is on file for this client. Upload the Day Book to run these checks."],
  };
}

/** The vouchers that touch the GST ledgers (output, input, carry-forward, reverse charge, set-off and payment), for the set-off and reverse charge checks. */
export async function gstLedgerVouchers(db: Db, ctx: FirmContext, businessId: string): Promise<{ vouchers: Voucher[]; files: number }> {
  const { vouchers, files } = await loadVouchers(db, ctx, businessId);
  const names = [...new Set(vouchers.flatMap((v) => v.legs.map((l) => l.ledger)))];
  const gst = new Set(suggestLedgerMap(names.map((name) => ({ name }))).filter((m) => ["input_tax", "input_tax_carry_forward", "output_tax", "rcm_liability", "rcm_input", "gst_payment"].includes(m.family)).map((m) => m.ledger));
  return { vouchers: vouchers.filter((v) => v.legs.some((l) => gst.has(l.ledger))).slice(0, 6000), files };
}
