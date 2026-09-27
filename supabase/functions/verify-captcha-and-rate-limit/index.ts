import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const LIMITS: Record<string, { max: number; window: number; lockout: number }> = {
  login:          { max: 5,  window: 900,  lockout: 1800 },
  sign_in:        { max: 5,  window: 900,  lockout: 1800 },
  ca_login:       { max: 5,  window: 900,  lockout: 1800 },
  ca_register:    { max: 3,  window: 3600, lockout: 7200 },
  blog_admin_login: { max: 5, window: 900,  lockout: 1800 },
  admin_login:    { max: 3,  window: 900,  lockout: 3600 },
  register:       { max: 3,  window: 3600, lockout: 7200 },
  sign_up:        { max: 3,  window: 3600, lockout: 7200 },
  reset_password: { max: 3,  window: 3600, lockout: 3600 },
  demo_access:    { max: 10, window: 900,  lockout: 900  },
};

async function verifyCaptcha(token: string, ip?: string): Promise<boolean> {
  if (!HCAPTCHA_SECRET) return true;
  const body = new URLSearchParams({ secret: HCAPTCHA_SECRET, response: token });
  if (ip) body.append("remoteip", ip);
  const res = await fetch("https://hcaptcha.com/siteverify", { method: "POST", body });
  const json = await res.json();
  return json.success === true;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  let body: { captcha_token?: string; identifier: string; action: string };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }

  const { captcha_token, identifier, action } = body;
  if (!identifier || !action) return new Response(JSON.stringify({ error: "identifier and action required" }), { status: 400, headers: corsHeaders });

  const config = LIMITS[action];
  if (!config) return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (captcha_token) {
    const ok = await verifyCaptcha(captcha_token, ip);
    if (!ok) {
      return new Response(
        JSON.stringify({ allowed: false, error: "CAPTCHA verification failed. Please try again." }),
        { status: 200, headers: corsHeaders }
      );
    }
  }

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: ipCheck } = await supa.rpc("check_and_increment_rate_limit", {
    p_identifier: `ip:${ip}`,
    p_action: action,
    p_max_attempts: config.max * 3,
    p_window_seconds: config.window,
    p_lockout_seconds: config.lockout,
  });

  if (ipCheck && !ipCheck.allowed) {
    return new Response(
      JSON.stringify({
        allowed: false,
        error: `Too many attempts from this network. Please wait ${Math.ceil((ipCheck.retry_after_seconds ?? 900) / 60)} minutes before trying again.`,
        retry_after_seconds: ipCheck.retry_after_seconds,
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  const { data: idCheck } = await supa.rpc("check_and_increment_rate_limit", {
    p_identifier: `user:${identifier.toLowerCase().trim()}`,
    p_action: action,
    p_max_attempts: config.max,
    p_window_seconds: config.window,
    p_lockout_seconds: config.lockout,
  });

  if (idCheck && !idCheck.allowed) {
    return new Response(
      JSON.stringify({
        allowed: false,
        error: `Too many failed attempts. This account is locked for ${Math.ceil((idCheck.retry_after_seconds ?? 1800) / 60)} minutes.`,
        retry_after_seconds: idCheck.retry_after_seconds,
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({ allowed: true, attempts_remaining: idCheck?.attempts_remaining }),
    { status: 200, headers: corsHeaders }
  );
});
