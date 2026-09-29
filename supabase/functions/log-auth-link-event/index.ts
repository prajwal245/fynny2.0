// Records reset/recovery link verification outcomes.
//
// We log to two places:
//   1. The `auth_link_events` table — durable, queryable analytics.
//   2. console.log() — surfaced in the function's edge logs for quick triage.
//
// This function intentionally has `verify_jwt = false` because reset-link
// failures happen *before* the user has a session.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_REASONS = new Set([
  "expired",
  "used",
  "invalid",
  "unknown",
  "verified",
]);
const ALLOWED_SOURCES = new Set(["url", "supabase"]);

interface Payload {
  reason?: string;
  source?: string;
  flow?: string;
  error_code?: string | null;
  description?: string | null;
  route?: string | null;
}

const truncate = (v: unknown, n: number): string | null => {
  if (v == null) return null;
  const s = String(v);
  return s.length > n ? s.slice(0, n) : s;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reason = String(body.reason ?? "").toLowerCase();
  const source = String(body.source ?? "url").toLowerCase();
  if (!ALLOWED_REASONS.has(reason)) {
    return new Response(JSON.stringify({ error: "invalid_reason" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return new Response(JSON.stringify({ error: "invalid_source" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const flow = truncate(body.flow ?? "password_recovery", 64) ?? "password_recovery";
  const errorCode = truncate(body.error_code, 128);
  const description = truncate(body.description, 500);
  const route = truncate(body.route, 256);
  const userAgent = truncate(req.headers.get("user-agent"), 500);

  // Surface in edge logs for quick monitoring.
  console.log(
    JSON.stringify({
      event: "auth_link_event",
      flow,
      reason,
      source,
      error_code: errorCode,
      description,
      route,
    }),
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: insertErr } = await admin.from("auth_link_events").insert({
    flow,
    reason,
    source,
    error_code: errorCode,
    description,
    route,
    user_agent: userAgent,
  });

  if (insertErr) {
    console.error("auth_link_event insert failed", insertErr);
    return new Response(
      JSON.stringify({ error: "insert_failed", detail: insertErr.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
