import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: authErr } = await userClient.auth.getClaims(token);
  if (authErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }

  let body: { business_id?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400, headers: corsHeaders });
  }
  const { business_id } = body;
  if (!business_id) {
    return new Response(JSON.stringify({ error: "business_id required" }), { status: 400, headers: corsHeaders });
  }

  // Authorization: caller must belong to this business.
  const { data: profile } = await serviceClient
    .from("profiles").select("business_id").eq("user_id", claimsData.claims.sub).maybeSingle();
  if (!profile?.business_id || profile.business_id !== business_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: recentTx, error: recentErr } = await serviceClient
    .from("transactions")
    .select("amount, direction, date, balance_after")
    .eq("business_id", business_id)
    .gte("date", cutoff)
    .order("date", { ascending: false });

  if (recentErr) {
    return new Response(JSON.stringify({ error: recentErr.message }), { status: 500, headers: corsHeaders });
  }

  const { data: latestTx } = await serviceClient
    .from("transactions")
    .select("balance_after")
    .eq("business_id", business_id)
    .not("balance_after", "is", null)
    .order("date", { ascending: false })
    .limit(1);

  const txList = recentTx ?? [];
  const totalIn = txList.filter((t) => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = txList.filter((t) => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);
  const monthlyBurn = Math.max(0, totalOut - totalIn);
  const cashPosition = latestTx?.[0]?.balance_after != null
    ? Number(latestTx[0].balance_after)
    : totalIn - totalOut;
  const runwayMonths = monthlyBurn > 0 ? Math.round((cashPosition / monthlyBurn) * 10) / 10 : 99;
  const runwayDays = Math.round(runwayMonths * 30);

  let healthScore = 100;
  if (runwayMonths < 1) healthScore = 10;
  else if (runwayMonths < 3) healthScore = 30;
  else if (runwayMonths < 6) healthScore = 60;
  else if (runwayMonths < 12) healthScore = 80;

  const healthStatus = healthScore >= 80 ? "healthy" : healthScore >= 60 ? "watch" : healthScore >= 30 ? "warning" : "critical";

  const { error: upsertErr } = await serviceClient
    .from("liquidity_metrics")
    .upsert({
      business_id,
      cash_position: cashPosition,
      burn_rate_current: monthlyBurn,
      runway_months: runwayMonths,
      runway_days: runwayDays,
      health_score: healthScore,
      health_status: healthStatus,
      recorded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    success: true,
    cash_position: cashPosition,
    burn_rate_current: monthlyBurn,
    runway_months: runwayMonths,
    runway_days: runwayDays,
    health_score: healthScore,
    health_status: healthStatus,
    transactions_analyzed: txList.length,
  }), { status: 200, headers: corsHeaders });
});
