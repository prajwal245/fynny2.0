import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface OnboardRequest {
  business_id: string;
  access_level?: string;
  module_access?: string[];
  notes?: string;
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

  const userClient = createClient(SUPABASE_URL, authHeader.replace("Bearer ", ""), {
    auth: { persistSession: false },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

  const { data: caFirm, error: caErr } = await serviceClient
    .from("ca_firms")
    .select("id, is_active, is_verified, firm_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (caErr || !caFirm) return new Response(JSON.stringify({ error: "CA firm not found" }), { status: 403, headers: corsHeaders });
  if (!caFirm.is_active) return new Response(JSON.stringify({ error: "CA firm account is inactive" }), { status: 403, headers: corsHeaders });

  let body: OnboardRequest;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders }); }

  const { business_id, access_level = "full", module_access, notes } = body;
  if (!business_id) return new Response(JSON.stringify({ error: "business_id is required" }), { status: 400, headers: corsHeaders });

  const { data: business, error: bizErr } = await serviceClient
    .from("businesses")
    .select("id, business_name, gstin, industry")
    .eq("id", business_id)
    .maybeSingle();

  if (bizErr || !business) return new Response(JSON.stringify({ error: "Business not found. Check the business ID." }), { status: 404, headers: corsHeaders });

  const { data: existingAccess } = await serviceClient
    .from("ca_client_access")
    .select("id, is_active")
    .eq("ca_firm_id", caFirm.id)
    .eq("business_id", business_id)
    .maybeSingle();

  if (existingAccess) {
    if (existingAccess.is_active) {
      return new Response(JSON.stringify({ error: "This client is already in your portfolio." }), { status: 409, headers: corsHeaders });
    }
    const { error: reactivateErr } = await serviceClient
      .from("ca_client_access")
      .update({ is_active: true, access_level, module_access, notes, granted_at: new Date().toISOString() })
      .eq("id", existingAccess.id);
    if (reactivateErr) return new Response(JSON.stringify({ error: reactivateErr.message }), { status: 500, headers: corsHeaders });
  } else {
    const { error: insertErr } = await serviceClient
      .from("ca_client_access")
      .insert({
        ca_firm_id: caFirm.id,
        business_id,
        client_user_id: null,
        access_level,
        module_access: module_access ?? ["liquidity", "revenue", "cost", "gst", "governance", "hr"],
        notes,
        is_active: true,
        granted_at: new Date().toISOString(),
      });
    if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: corsHeaders });
  }

  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${fyStart}-${String(fyStart + 1).slice(2)}`;

  const { data: calResult, error: calErr } = await serviceClient
    .rpc("generate_compliance_calendar", {
      p_business_id: business_id,
      p_ca_firm_id: caFirm.id,
      p_financial_year: fy,
    });

  if (calErr) console.error("Calendar generation error:", calErr.message);

  const { data: healthResult, error: healthErr } = await serviceClient
    .rpc("compute_client_health_score", {
      p_business_id: business_id,
      p_ca_firm_id: caFirm.id,
    });

  if (healthErr) console.error("Health score error:", healthErr.message);

  const { error: notifErr } = await serviceClient
    .from("ca_notifications")
    .insert({
      ca_firm_id: caFirm.id,
      business_id,
      title: "Client onboarded successfully",
      message: `${business.business_name} has been added to your portfolio. Compliance calendar generated for FY ${fy}.`,
      severity: "info",
      is_read: false,
    });

  if (notifErr) console.error("Notification error:", notifErr.message);

  const { data: accessRecord } = await serviceClient
    .from("ca_client_access")
    .select("client_reference_code, storage_namespace")
    .eq("ca_firm_id", caFirm.id)
    .eq("business_id", business_id)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      success: true,
      business_name: business.business_name,
      ca_firm_id: caFirm.id,
      financial_year: fy,
      calendar_events_created: calResult ?? 0,
      health_score: healthResult,
      client_reference_code: accessRecord?.client_reference_code,
      storage_namespace: accessRecord?.storage_namespace,
    }),
    { status: 200, headers: corsHeaders }
  );
});
