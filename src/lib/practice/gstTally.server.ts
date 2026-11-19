/**
 * Sales and purchase registers for GST checks, built from the Tally Day Books already uploaded for a client, so no separate register
 * needs exporting. Reads each stored Tally XML Day Book for the client, keeps the chosen month, and joins them (the same voucher
 * appearing in two overlapping Day Books counts once).
 */
import type { Db, FirmContext } from "./db.server";
import { BUCKET } from "./documents.server";
import { readTallyGst, readTallyGstSheet } from "./gst/tallyVouchers";
import { isTallyXml } from "./extract/tally";
import type { GstInvoice, ReadInvoices } from "./gst/invoices";

export interface TallyGstBooks {
  sales: ReadInvoices;
  purchases: ReadInvoices;
  /** Day Books read, and books files that were not a Day Book. */
  files: number;
  notXml: number;
}

export async function tallyGstBooks(db: Db, ctx: FirmContext, businessId: string, month: string): Promise<TallyGstBooks> {
  const { data } = await db
    .from("ca_document_extractions")
    .select("id, original_filename, storage_path, file_kind, side, extract_status")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "books")
    .limit(200);
  const docs = ((data ?? []) as { id: string; original_filename: string; storage_path: string | null; file_kind: string | null }[]).filter((d) => d.storage_path);
  const sales = new Map<string, GstInvoice>();
  const purchases = new Map<string, GstInvoice>();
  let files = 0;
  let notXml = 0;
  const key = (i: GstInvoice) => `${i.docType}|${i.no}|${i.gstin}|${i.party}|${i.date}|${i.total}`;
  let noGstin = false;
  for (const d of docs) {
    const dl = await db.storage.from(BUCKET).download(d.storage_path!);
    if (dl.error || !dl.data) continue;
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    let r: ReturnType<typeof readTallyGst> | null = null;
    if (/\.(xlsx|xls)$/i.test(d.original_filename) || d.file_kind === "xlsx") {
      // Tally's Excel Day Book: vouchers with their ledger legs, tax included, but no GSTIN.
      const XLSX = await import("xlsx");
      const wb = XLSX.read(bytes, { type: "array", cellDates: true, raw: false });
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" });
        const got = readTallyGstSheet(rows, { month });
        if (got.vouchers) { r = got; noGstin = true; break; }
      }
    } else {
      const text = new TextDecoder().decode(bytes);
      if (isTallyXml(text)) r = readTallyGst(text, { month });
    }
    if (!r) { notXml++; continue; }
    files++;
    for (const i of r.sales.invoices) sales.set(key(i), i);
    for (const i of r.purchases.invoices) purchases.set(key(i), i);
  }
  const wrap = (m: Map<string, GstInvoice>, what: string): ReadInvoices => ({
    invoices: [...m.values()],
    period: month,
    ownGstin: null,
    notes: [
      m.size ? `${m.size} ${what} from ${files} Tally Day Book${files === 1 ? "" : "s"}.` : `No ${what} vouchers for ${month} in the Tally Day Books on file.`,
      ...(m.size && noGstin ? ["A Tally Day Book does not carry the buyer or supplier GSTIN, so invoices are matched on their number."] : []),
    ],
  });
  return { sales: wrap(sales, "sales"), purchases: wrap(purchases, "purchases"), files, notXml };
}
