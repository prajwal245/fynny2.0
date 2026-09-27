import { createClient } from "npm:@supabase/supabase-js@2";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Type": "application/json",
};

const ALLOWED_TABLES = new Set([
  "bank_transactions",
  "invoices",
  "liquidity_metrics",
  "revenue_metrics",
  "cost_anomalies",
  "gst_filings",
  "cohort_analysis",
  "churn_signals",
  "customers",
  "vendors",
  "tds_filings",
  "vendor_payments",
  "subscriptions",
]);

// Tables keyed by org_id instead of business_id
const ORG_ID_TABLES = new Set(["revenue_metrics", "cost_anomalies"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 2_000_000);
  if (sizeBlock) return sizeBlock;
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ success: false, error: "Invalid body" }, 400);
    }

    const { table, business_id, filters, select, limit, order } = body as {
      table?: string;
      business_id?: string;
      filters?: Record<string, string>;
      select?: string;
      limit?: number;
      order?: { column: string; ascending: boolean };
    };

    if (!table || typeof table !== "string" || !ALLOWED_TABLES.has(table)) {
      return json({ success: false, error: "Table not allowed" }, 403);
    }
    if (!business_id || !UUID_RE.test(business_id)) {
      return json({ success: false, error: "Invalid business_id" }, 400);
    }

    // Admin client on Lovable Cloud for access resolution
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const allowed = new Set<string>();

    const { data: profile } = await admin
      .from("profiles")
      .select("business_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.business_id) allowed.add(profile.business_id as string);

    // CA access: grants created by this user
    const { data: grantedRows } = await admin
      .from("ca_client_access")
      .select("business_id")
      .eq("granted_by", userId);
    for (const r of grantedRows ?? []) if (r.business_id) allowed.add(r.business_id as string);

    // CA access: user belongs to a CA firm with client access rows
    const { data: firm } = await admin
      .from("ca_firms")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (firm?.id) {
      const { data: firmRows } = await admin
        .from("ca_client_access")
        .select("business_id")
        .eq("ca_firm_id", firm.id);
      for (const r of firmRows ?? []) if (r.business_id) allowed.add(r.business_id as string);
    }

    if (!allowed.has(business_id)) {
      return json({ success: false, error: "Forbidden: no access to this business" }, 403);
    }

    const external = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "https://wiknwxniwqvsxgyzqqxu.supabase.co",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const keyColumn = ORG_ID_TABLES.has(table) ? "org_id" : "business_id";
    let query = external.from(table).select(select ?? "*").eq(keyColumn, business_id);

    if (filters && typeof filters === "object") {
      for (const [k, v] of Object.entries(filters)) {
        if (typeof k === "string" && /^[a-z0-9_]+$/i.test(k)) query = query.eq(k, v);
      }
    }

    if (order?.column) {
      query = query.order(order.column, { ascending: !!order.ascending });
    } else if (table === "liquidity_metrics") {
      query = query.order("recorded_at", { ascending: false });
    }

    const effectiveLimit =
      typeof limit === "number" && limit > 0
        ? Math.min(limit, 5000)
        : table === "liquidity_metrics"
          ? 1
          : 1000;
    query = query.limit(effectiveLimit);

    const { data, error } = await query;
    if (error) return json({ success: false, error: error.message }, 400);

    return json({ success: true, data: data ?? [] });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
