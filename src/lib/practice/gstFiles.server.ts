/**
 * The GST reports a client already has on file, read from the same stored documents every other screen uses, so the GST page shows
 * what was uploaded anywhere (Documents, Data needed, the Close tab) instead of asking for the files again.
 */
import type { Db, FirmContext } from "./db.server";
import { BUCKET } from "./documents.server";
import { detectLedgerFile, type LedgerFileKind } from "./gst/ledgers";

export interface ClientGstFiles {
  rows: Partial<Record<LedgerFileKind, string[][]>>;
  /** Which stored file supplied each report, for the "from the client's files" line. */
  from: Partial<Record<LedgerFileKind, { id: string; name: string }>>;
}

/** Large sheets (a full-year Day Book) are not sent whole to the browser; the challan match then waits for the file to be dropped. */
const MAX_ROWS = 40_000;

export async function clientGstFiles(db: Db, ctx: FirmContext, businessId: string): Promise<ClientGstFiles> {
  const { data } = await db
    .from("ca_document_extractions")
    .select("id, original_filename, storage_path, extract_status, created_at")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .neq("extract_status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);
  const docs = ((data ?? []) as { id: string; original_filename: string | null; storage_path: string | null }[]).filter((d) => d.storage_path && /\.(xlsx|xls)$/i.test(d.original_filename ?? ""));
  const out: ClientGstFiles = { rows: {}, from: {} };
  const XLSX = await import("xlsx");
  for (const d of docs) {
    // Cheap names first: a Day Book or a ledger extract is not a GST report, and reading it whole would only cost time.
    const dl = await db.storage.from(BUCKET).download(d.storage_path!);
    if (dl.error || !dl.data) continue;
    try {
      const wb = XLSX.read(new Uint8Array(await dl.data.arrayBuffer()), { type: "array", raw: false });
      const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }) }));
      for (const f of detectLedgerFile(sheets)) {
        if (out.rows[f.kind]) continue; // the newest file for each report wins
        const rows = sheets.find((s) => s.name === f.sheet)!.rows;
        if (rows.length > MAX_ROWS) continue;
        out.rows[f.kind] = rows;
        out.from[f.kind] = { id: d.id, name: d.original_filename ?? "file" };
      }
    } catch {
      /* a file that cannot be read is skipped, not fatal */
    }
  }
  return out;
}
