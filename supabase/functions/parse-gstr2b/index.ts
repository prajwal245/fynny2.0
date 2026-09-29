import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^(0[1-9]|1[0-2])(20\d{2})$/; // MMYYYY
const MAX_BYTES = 10 * 1024 * 1024;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const num = (v: unknown) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const normInv = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** GST portal dates are dd-mm-yyyy; CSV may be yyyy-mm-dd or dd/mm/yyyy. */
function toIsoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type Parsed = {
  gstin_supplier: string;
  supplier_name: string | null;
  invoice_number: string;
  invoice_date: string | null;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
};

/** Format A — official GSTR-2B JSON download. */
function parseJson(raw: string): Parsed[] {
  const doc = JSON.parse(raw);
  const b2b = doc?.data?.docdata?.b2b ?? doc?.docdata?.b2b ?? doc?.b2b ?? [];
  if (!Array.isArray(b2b)) throw new Error("GSTR-2B JSON has no data.docdata.b2b array");
  const out: Parsed[] = [];
  for (const supplier of b2b) {
    const ctin = String(supplier?.ctin ?? "").trim().toUpperCase();
    const name = supplier?.trdnm ?? supplier?.trade_name ?? null;
    for (const inv of supplier?.inv ?? []) {
      let igst = 0, cgst = 0, sgst = 0, txval = 0;
      for (const itm of inv?.itms ?? []) {
        const det = itm?.itm_det ?? itm ?? {};
        igst += num(det.iamt);
        cgst += num(det.camt);
        sgst += num(det.samt);
        txval += num(det.txval);
      }
      out.push({
        gstin_supplier: ctin,
        supplier_name: name ? String(name) : null,
        invoice_number: normInv(inv?.inum),
        invoice_date: toIsoDate(inv?.dt),
        taxable_value: txval || num(inv?.txval) || Math.max(num(inv?.val) - (igst + cgst + sgst), 0),
        igst, cgst, sgst,
      });
    }
  }
  return out;
}

/** Minimal RFC4180-ish CSV splitter (handles quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Format B — simple CSV. */
function parseCsv(raw: string): Parsed[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error("CSV has no data rows");
  const header = splitCsvLine(lines[0]).map(normKey);
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(normKey(n));
      if (i !== -1) return i;
    }
    return -1;
  };
  const iGstin = idx("GSTIN", "supplier gstin", "ctin");
  const iName = idx("Supplier Name", "supplier", "trade name");
  const iInv = idx("Invoice Number", "invoice no", "inum", "invoice");
  const iDate = idx("Invoice Date", "date", "dt");
  const iTax = idx("Taxable Value", "taxable", "txval");
  const iIgst = idx("IGST", "igst amount", "iamt");
  const iCgst = idx("CGST", "cgst amount", "camt");
  const iSgst = idx("SGST", "sgst amount", "samt");
  if (iInv === -1) throw new Error("CSV must contain an 'Invoice Number' column");

  const out: Parsed[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const invoice_number = normInv(c[iInv]);
    if (!invoice_number) continue;
    out.push({
      gstin_supplier: iGstin === -1 ? "" : String(c[iGstin] ?? "").trim().toUpperCase(),
      supplier_name: iName === -1 ? null : (c[iName] || null),
      invoice_number,
      invoice_date: iDate === -1 ? null : toIsoDate(c[iDate]),
      taxable_value: iTax === -1 ? 0 : num(c[iTax]),
      igst: iIgst === -1 ? 0 : num(c[iIgst]),
      cgst: iCgst === -1 ? 0 : num(c[iCgst]),
      sgst: iSgst === -1 ? 0 : num(c[iSgst]),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let uploadId: string | null = null;

  try {
    // --- auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, error: "Missing authorization header" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Invalid or expired session" }, 401);
    }
    const uid = userData.user.id;

    // --- input ---
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ success: false, error: "Expected multipart/form-data" }, 400);
    }
    const file = form.get("file");
    const ca_firm_id = String(form.get("ca_firm_id") ?? "");
    const business_id = String(form.get("business_id") ?? "");
    const filing_period = String(form.get("filing_period") ?? "").trim();

    const errs: string[] = [];
    if (!(file instanceof File)) errs.push("file is required");
    if (!UUID_RE.test(ca_firm_id)) errs.push("ca_firm_id must be a uuid");
    if (!UUID_RE.test(business_id)) errs.push("business_id must be a uuid");
    if (!PERIOD_RE.test(filing_period)) errs.push("filing_period must be MMYYYY");
    if (errs.length) return json({ success: false, error: errs.join("; ") }, 400);

    const upload = file as File;
    if (upload.size > MAX_BYTES) return json({ success: false, error: "File exceeds 10MB" }, 400);

    // --- authorisation: caller belongs to the firm, firm is linked to the client ---
    const [{ data: ownerFirm }, { data: memberRow }] = await Promise.all([
      admin.from("ca_firms").select("id").eq("id", ca_firm_id).eq("user_id", uid).maybeSingle(),
      admin.from("ca_firm_members").select("id")
        .eq("ca_firm_id", ca_firm_id).eq("user_id", uid).eq("status", "active").maybeSingle(),
    ]);
    if (!ownerFirm && !memberRow) {
      return json({ success: false, error: "You do not have access to this CA firm" }, 403);
    }
    const [{ data: accessRow }, { data: clientRow }] = await Promise.all([
      admin.from("ca_client_access").select("id")
        .eq("ca_firm_id", ca_firm_id).eq("business_id", business_id).eq("is_active", true).maybeSingle(),
      admin.from("ca_clients").select("id")
        .eq("ca_firm_id", ca_firm_id).eq("business_id", business_id).maybeSingle(),
    ]);
    if (!accessRow && !clientRow) {
      return json({ success: false, error: "This client is not linked to your firm" }, 403);
    }

    const mm = filing_period.slice(0, 2);
    const yyyy = filing_period.slice(2);
    const periodLabel = `${MONTHS[Number(mm) - 1]} ${yyyy}`;
    const periodVariants = [filing_period, periodLabel];

    // --- upload log row (pending) ---
    const { data: logRow } = await admin.from("ca_gstr2b_uploads").insert({
      ca_firm_id, business_id,
      filing_period: periodLabel,
      file_name: upload.name,
      file_size_bytes: upload.size,
      processing_status: "processing",
      uploaded_by: uid,
    }).select("id").maybeSingle();
    uploadId = logRow?.id ?? null;

    // --- parse ---
    const raw = await upload.text();
    const isJson = upload.name.toLowerCase().endsWith(".json") || raw.trim().startsWith("{");
    let records: Parsed[];
    try {
      records = isJson ? parseJson(raw) : parseCsv(raw);
    } catch (e) {
      throw new Error(`Could not parse file: ${e instanceof Error ? e.message : String(e)}`);
    }
    records = records.filter((r) => r.invoice_number);
    if (!records.length) throw new Error("No invoice records found in the file");

    // --- existing book records for this client ---
    const { data: existing, error: exErr } = await admin
      .from("ca_itc_records")
      .select("id, invoice_number, filing_period, total_itc")
      .eq("business_id", business_id).eq("ca_firm_id", ca_firm_id).eq("is_demo", false);
    if (exErr) throw new Error(exErr.message);

    const byInvoice = new Map<string, { id: string; filing_period: string; total_itc: number | null }>();
    for (const r of existing ?? []) {
      const key = normInv(r.invoice_number);
      if (key && !byInvoice.has(key)) byInvoice.set(key, r as never);
    }

    let matched = 0, added = 0;
    const seen = new Set<string>();
    const inserts: Record<string, unknown>[] = [];

    for (const r of records) {
      if (seen.has(r.invoice_number)) continue;
      seen.add(r.invoice_number);
      const hit = byInvoice.get(r.invoice_number);
      if (hit) {
        const { error } = await admin.from("ca_itc_records").update({
          gstr2b_matched: true,
          match_status: "matched",
          mismatch_amount: 0,
          gstr2b_taxable_value: r.taxable_value,
          gstr2b_igst: r.igst,
          gstr2b_cgst: r.cgst,
          gstr2b_sgst: r.sgst,
          updated_at: new Date().toISOString(),
        }).eq("id", hit.id);
        if (error) throw new Error(error.message);
        matched++;
      } else {
        inserts.push({
          ca_firm_id, business_id,
          filing_period: periodLabel,
          gstin_supplier: r.gstin_supplier || "UNKNOWN",
          supplier_name: r.supplier_name,
          invoice_number: r.invoice_number,
          invoice_date: r.invoice_date,
          taxable_value: r.taxable_value,
          igst_amount: r.igst,
          cgst_amount: r.cgst,
          sgst_amount: r.sgst,
          gstr2b_taxable_value: r.taxable_value,
          gstr2b_igst: r.igst,
          gstr2b_cgst: r.cgst,
          gstr2b_sgst: r.sgst,
          gstr2b_matched: true,
          match_status: "extra_in_2b",
          source: "gstr2b_upload",
          is_demo: false,
        });
        added++;
      }
    }

    if (inserts.length) {
      const { error } = await admin.from("ca_itc_records").insert(inserts);
      if (error) throw new Error(error.message);
    }

    // --- book rows for this period that the 2B does not contain ---
    let mismatched = 0;
    const stale = (existing ?? []).filter(
      (r) => periodVariants.includes(String(r.filing_period)) && !seen.has(normInv(r.invoice_number)),
    );
    for (const r of stale) {
      const { error } = await admin.from("ca_itc_records").update({
        match_status: "mismatch",
        gstr2b_matched: false,
        mismatch_amount: Number(r.total_itc ?? 0),
        updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (error) throw new Error(error.message);
      mismatched++;
    }

    if (uploadId) {
      await admin.from("ca_gstr2b_uploads").update({
        processing_status: "completed",
        processed_at: new Date().toISOString(),
        record_count: records.length,
        records_parsed: records.length,
        records_matched: matched,
        records_mismatched: mismatched,
        records_new: added,
      }).eq("id", uploadId);
    }

    return json({
      success: true,
      records_parsed: records.length,
      records_matched: matched,
      records_mismatched: mismatched,
      records_new: added,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    if (uploadId) {
      await admin.from("ca_gstr2b_uploads").update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        error_message: message.slice(0, 500),
      }).eq("id", uploadId);
    }
    console.error("[parse-gstr2b]", message);
    return json({ success: false, error: message }, 400);
  }
});
