/**
 * Runs the year-end checks for one client from the files already on it: the Day Book, the Trial Balance and masters, the GSTR-1 report
 * and the AIS read text. Nothing is uploaded again. A check whose file is not on the client comes back blocked, naming the file.
 */
import type { Db, FirmContext } from "./db.server";
import { BUCKET } from "./documents.server";
import { loadVouchers } from "./reviewChecks.server";
import { clientGstFiles } from "./gstFiles.server";
import { detectWorkbook, monthsIn, readPortalReport } from "./gst/reports";
import { sumInvoices } from "./gst/returns";
import { readTrialBalance, readLedgerMasters } from "./review/trialBalance";
import { booksTds } from "./tax/tds";
import { entityFromName, readAis, runYearChecks, type Ais, type Gstr1Month, type YearCheck } from "./review/yearChecks";

export interface YearChecksResult { checks: YearCheck[]; from: Record<string, string>; vouchers: number }

async function gstr1Months(db: Db, ctx: FirmContext, businessId: string): Promise<{ months: Gstr1Month[]; name: string } | null> {
  const { data } = await db.from("ca_document_extractions").select("original_filename, storage_path").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).neq("extract_status", "archived").order("created_at", { ascending: false }).limit(200);
  const docs = ((data ?? []) as { original_filename: string | null; storage_path: string | null }[]).filter((d) => d.storage_path && /gstr[\s_-]?1|sales/i.test(d.original_filename ?? "") && /\.xlsx?$/i.test(d.original_filename ?? ""));
  const XLSX = await import("xlsx");
  for (const d of docs) {
    const dl = await db.storage.from(BUCKET).download(d.storage_path!);
    if (dl.error || !dl.data) continue;
    try {
      const wb = XLSX.read(new Uint8Array(await dl.data.arrayBuffer()), { type: "array", raw: false });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }) }));
      const w = detectWorkbook(sheets);
      if (w.kind !== "gstr1_report") continue;
      const rows = sheets.find((s) => s.name === w.sheet)!.rows;
      const months = monthsIn(rows).map((month) => { const t = sumInvoices(readPortalReport(rows, { month, kind: "gstr1" }).invoices); return { month, taxable: t.taxable, tax: t.igst + t.cgst + t.sgst + t.cess }; });
      if (months.length) return { months, name: d.original_filename ?? "GSTR-1" };
    } catch { /* a file that cannot be read is skipped */ }
  }
  return null;
}

async function aisOf(db: Db, ctx: FirmContext, businessId: string): Promise<{ ais: Ais; name: string } | null> {
  const { data } = await db.from("ca_document_extractions").select("original_filename, preview:extracted->>text_preview, kind:extracted->>reference_kind").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).neq("extract_status", "archived").limit(200);
  const hit = ((data ?? []) as { original_filename: string | null; preview: string | null; kind: string | null }[]).find((d) => d.kind === "ais" || /\bais\b/i.test(d.original_filename ?? ""));
  if (!hit) return null;
  return { ais: readAis(hit.preview ?? ""), name: hit.original_filename ?? "AIS" };
}

export async function clientYearChecks(db: Db, ctx: FirmContext, businessId: string): Promise<YearChecksResult> {
  const [{ vouchers }, gst, g1, ais, client] = await Promise.all([
    loadVouchers(db, ctx, businessId),
    clientGstFiles(db, ctx, businessId),
    gstr1Months(db, ctx, businessId),
    aisOf(db, ctx, businessId),
    db.from("ca_clients").select("client_name, entity_type").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).maybeSingle(),
  ]);
  const tb = gst.rows.trial_balance ? readTrialBalance(gst.rows.trial_balance) : null;
  const masters = gst.rows.ledger_masters ? readLedgerMasters(gst.rows.ledger_masters) : [];
  const dayNames = [...new Set(vouchers.flatMap((v) => v.legs.map((l) => l.ledger)))];
  const ledgers: { name: string; group?: string | null }[] = tb?.ledgers.length ? tb.ledgers.map((l) => ({ name: l.name, group: l.group })) : masters.length ? masters.map((m) => ({ name: m.name, group: m.group })) : dayNames.map((name) => ({ name }));
  const tdsLedgers = ledgers.filter((l) => /tds.*receivable|receivable.*tds|tcs.*receivable/i.test(l.name) || /tds receivable/i.test(l.group ?? "")).map((l) => l.name);
  const tdsInBooks = vouchers.length && tdsLedgers.length ? booksTds(vouchers, tdsLedgers).total : null;
  const c = client.data as { client_name?: string; entity_type?: string } | null;
  const checks = runYearChecks({
    vouchers, tb: tb?.ledgers.length ? tb : null, ledgers, gstr1: g1?.months ?? null, ais: ais?.ais ?? null, tdsInBooks,
    entity: entityFromName(c?.client_name, c?.entity_type),
  });
  const from: Record<string, string> = {};
  if (gst.from.trial_balance) from["Trial Balance"] = gst.from.trial_balance.name;
  if (g1) from["GSTR-1"] = g1.name;
  if (ais) from["AIS"] = ais.name;
  return { checks, from, vouchers: vouchers.length };
}
