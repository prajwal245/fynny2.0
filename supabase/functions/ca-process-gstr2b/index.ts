import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface GSTR2BRecord {
  gstin: string;
  trade_name?: string;
  invoice_no?: string;
  invoice_date?: string;
  taxable_value: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
}

interface GSTR2BPayload {
  business_id: string;
  filing_period: string;
  file_name: string;
  records: GSTR2BRecord[];
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const userClient = createClient(SUPABASE_URL, authHeader.replace("Bearer ", ""), { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

  const { data: caFirm } = await serviceClient
    .from("ca_firms").select("id").eq("user_id", user.id).maybeSingle();
  if (!caFirm) return new Response(JSON.stringify({ error: "CA firm not found" }), { status: 403, headers: corsHeaders });

  let body: GSTR2BPayload;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders }); }

  const { business_id, filing_period, file_name, records } = body;
  if (!business_id || !filing_period || !records?.length) {
    return new Response(JSON.stringify({ error: "business_id, filing_period, and records are required" }), { status: 400, headers: corsHeaders });
  }

  const { data: access } = await serviceClient
    .from("ca_client_access")
    .select("id")
    .eq("ca_firm_id", caFirm.id)
    .eq("business_id", business_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!access) return new Response(JSON.stringify({ error: "Access denied. This client is not in your portfolio." }), { status: 403, headers: corsHeaders });

  const { error: uploadErr } = await serviceClient
    .from("ca_gstr2b_uploads")
    .insert({
      business_id,
      ca_firm_id: caFirm.id,
      filing_period,
      uploaded_by: user.id,
      file_name,
      file_size_bytes: JSON.stringify(records).length,
      raw_data: records,
      record_count: records.length,
      processing_status: "processing",
    });

  if (uploadErr) return new Response(JSON.stringify({ error: uploadErr.message }), { status: 500, headers: corsHeaders });

  const { data: existingITC } = await serviceClient
    .from("ca_itc_records")
    .select("id, gstin_supplier, invoice_number, igst_amount, cgst_amount, sgst_amount, total_itc")
    .eq("business_id", business_id)
    .eq("ca_firm_id", caFirm.id)
    .eq("filing_period", filing_period);

  const gstr2bMap = new Map<string, GSTR2BRecord>();
  for (const r of records) {
    const key = `${r.gstin}:${r.invoice_no ?? ""}`;
    gstr2bMap.set(key, r);
  }

  let matched = 0, mismatch = 0, missing = 0;
  const updates: Array<{ id: string; match_status: string; gstr2b_taxable_value?: number; gstr2b_igst?: number; gstr2b_cgst?: number; gstr2b_sgst?: number; gstr2b_matched: boolean; mismatch_amount?: number }> = [];

  for (const record of existingITC ?? []) {
    const key = `${record.gstin_supplier}:${record.invoice_number ?? ""}`;
    const b2bRecord = gstr2bMap.get(key);

    if (!b2bRecord) {
      updates.push({ id: record.id, match_status: "missing_in_2b", gstr2b_matched: false });
      missing++;
      continue;
    }

    const b2bTotal = (b2bRecord.igst ?? 0) + (b2bRecord.cgst ?? 0) + (b2bRecord.sgst ?? 0);
    const tolerance = 1.0;
    const diff = Math.abs((record.total_itc ?? 0) - b2bTotal);

    if (diff <= tolerance) {
      updates.push({
        id: record.id,
        match_status: "matched",
        gstr2b_matched: true,
        gstr2b_taxable_value: b2bRecord.taxable_value,
        gstr2b_igst: b2bRecord.igst ?? 0,
        gstr2b_cgst: b2bRecord.cgst ?? 0,
        gstr2b_sgst: b2bRecord.sgst ?? 0,
      });
      matched++;
      gstr2bMap.delete(key);
    } else {
      updates.push({
        id: record.id,
        match_status: "mismatch",
        gstr2b_matched: false,
        gstr2b_taxable_value: b2bRecord.taxable_value,
        gstr2b_igst: b2bRecord.igst ?? 0,
        gstr2b_cgst: b2bRecord.cgst ?? 0,
        gstr2b_sgst: b2bRecord.sgst ?? 0,
        mismatch_amount: diff,
      });
      mismatch++;
      gstr2bMap.delete(key);
    }
  }

  const extraInserts = [];
  for (const [, r] of gstr2bMap) {
    extraInserts.push({
      business_id,
      ca_firm_id: caFirm.id,
      filing_period,
      gstin_supplier: r.gstin,
      supplier_name: r.trade_name ?? null,
      invoice_number: r.invoice_no ?? null,
      invoice_date: r.invoice_date ?? null,
      taxable_value: r.taxable_value,
      igst_amount: r.igst ?? 0,
      cgst_amount: r.cgst ?? 0,
      sgst_amount: r.sgst ?? 0,
      match_status: "extra_in_2b",
      gstr2b_matched: true,
      source: "gstr2b_upload",
    });
  }

  for (const u of updates) {
    await serviceClient.from("ca_itc_records").update({
      match_status: u.match_status,
      gstr2b_matched: u.gstr2b_matched,
      gstr2b_taxable_value: u.gstr2b_taxable_value,
      gstr2b_igst: u.gstr2b_igst,
      gstr2b_cgst: u.gstr2b_cgst,
      gstr2b_sgst: u.gstr2b_sgst,
      mismatch_amount: u.mismatch_amount,
      updated_at: new Date().toISOString(),
    }).eq("id", u.id);
  }

  if (extraInserts.length > 0) {
    await serviceClient.from("ca_itc_records").insert(extraInserts);
  }

  await serviceClient
    .from("ca_gstr2b_uploads")
    .update({ processing_status: "completed", processed_at: new Date().toISOString() })
    .eq("business_id", business_id)
    .eq("ca_firm_id", caFirm.id)
    .eq("filing_period", filing_period)
    .eq("file_name", file_name);

  await serviceClient.rpc("compute_client_health_score", {
    p_business_id: business_id,
    p_ca_firm_id: caFirm.id,
  });

  return new Response(
    JSON.stringify({
      success: true,
      records_processed: records.length,
      matched,
      mismatch,
      missing_in_2b: missing,
      extra_in_2b: extraInserts.length,
      match_rate: records.length > 0 ? Math.round((matched / records.length) * 100) : 0,
    }),
    { status: 200, headers: corsHeaders }
  );
});
