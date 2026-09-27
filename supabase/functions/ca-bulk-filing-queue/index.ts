import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface BulkFilingRequest {
  client_ids: string[];
  filing_type: "GSTR1" | "GSTR3B" | "TDS_CHALLAN";
  filing_period: string;
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
    .from("ca_firms").select("id, firm_name").eq("user_id", user.id).maybeSingle();
  if (!caFirm) return new Response(JSON.stringify({ error: "CA firm not found" }), { status: 403, headers: corsHeaders });

  let body: BulkFilingRequest;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders }); }

  const { client_ids, filing_type, filing_period } = body;
  if (!client_ids?.length || !filing_type || !filing_period) {
    return new Response(JSON.stringify({ error: "client_ids, filing_type, and filing_period are required" }), { status: 400, headers: corsHeaders });
  }
  if (client_ids.length > 50) {
    return new Response(JSON.stringify({ error: "Maximum 50 clients per bulk filing job" }), { status: 400, headers: corsHeaders });
  }

  const { data: authorizedAccess } = await serviceClient
    .from("ca_client_access")
    .select("business_id")
    .eq("ca_firm_id", caFirm.id)
    .eq("is_active", true)
    .in("business_id", client_ids);

  const authorizedIds = new Set((authorizedAccess ?? []).map((a: { business_id: string }) => a.business_id));
  const unauthorizedIds = client_ids.filter((id) => !authorizedIds.has(id));

  if (unauthorizedIds.length > 0) {
    return new Response(
      JSON.stringify({ error: "Some clients are not in your portfolio.", unauthorized_ids: unauthorizedIds }),
      { status: 403, headers: corsHeaders }
    );
  }

  const { data: job, error: jobErr } = await serviceClient
    .from("ca_bulk_filing_jobs")
    .insert({
      ca_firm_id: caFirm.id,
      created_by: user.id,
      filing_type,
      filing_period,
      client_ids,
      total_clients: client_ids.length,
      processed_clients: 0,
      failed_clients: 0,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobErr || !job) return new Response(JSON.stringify({ error: jobErr?.message ?? "Failed to create job" }), { status: 500, headers: corsHeaders });

  const { data: businesses } = await serviceClient
    .from("businesses")
    .select("id, business_name, gstin, registered_address")
    .in("id", client_ids);

  const bizMap = new Map((businesses ?? []).map((b: { id: string; business_name: string; gstin: string; registered_address?: string }) => [b.id, b]));

  const outputPayloads: Array<{
    business_id: string;
    business_name: string;
    gstin: string;
    filing_type: string;
    filing_period: string;
    generated_at: string;
    generated_by: string;
    itc_records?: { matched: number; mismatch: number; missing: number };
    compliance_status?: string;
    note: string;
  }> = [];

  let processed = 0, failed = 0;

  for (const clientId of client_ids) {
    const biz = bizMap.get(clientId);
    if (!biz) { failed++; continue; }

    const { data: itcSummary } = await serviceClient
      .from("ca_itc_records")
      .select("match_status")
      .eq("business_id", clientId)
      .eq("ca_firm_id", caFirm.id)
      .eq("filing_period", filing_period);

    const matchCounts = (itcSummary ?? []).reduce(
      (acc: { matched: number; mismatch: number; missing: number }, r: { match_status: string }) => {
        if (r.match_status === "matched") acc.matched++;
        else if (r.match_status === "mismatch") acc.mismatch++;
        else if (r.match_status === "missing_in_2b") acc.missing++;
        return acc;
      },
      { matched: 0, mismatch: 0, missing: 0 }
    );

    const { data: compliance } = await serviceClient
      .from("ca_compliance_events")
      .select("status, due_date")
      .eq("business_id", clientId)
      .eq("ca_firm_id", caFirm.id)
      .eq("event_type", filing_type)
      .eq("filing_period", filing_period)
      .maybeSingle();

    outputPayloads.push({
      business_id: clientId,
      business_name: biz.business_name,
      gstin: biz.gstin ?? "GSTIN not set",
      filing_type,
      filing_period,
      generated_at: new Date().toISOString(),
      generated_by: caFirm.firm_name,
      itc_records: matchCounts,
      compliance_status: compliance?.status ?? "not_found",
      note: "This payload is generated for manual GST portal upload. Direct API filing requires GSP registration.",
    });

    processed++;
  }

  await serviceClient
    .from("ca_bulk_filing_jobs")
    .update({
      status: failed === client_ids.length ? "failed" : failed > 0 ? "partial" : "completed",
      processed_clients: processed,
      failed_clients: failed,
      output_json: outputPayloads,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return new Response(
    JSON.stringify({
      success: true,
      job_id: job.id,
      filing_type,
      filing_period,
      total: client_ids.length,
      processed,
      failed,
      status: failed === client_ids.length ? "failed" : failed > 0 ? "partial" : "completed",
      output: outputPayloads,
    }),
    { status: 200, headers: corsHeaders }
  );
});
