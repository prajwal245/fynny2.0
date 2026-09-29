import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const fmtInr = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n)
    ? `Rs ${Math.round(n).toLocaleString("en-IN")}`
    : "Rs —";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsRes.claims.sub as string;
    const email = (claimsRes.claims.email as string | undefined) ?? null;

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "").trim();
    if (!organization_id) return json({ error: "organization_id required" }, 400);

    if (!RESEND_API_KEY) {
      return json({ success: false, error: "Email service not configured" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: profile } = await admin
      .from("profiles").select("business_id, org_id, email").eq("user_id", userId).maybeSingle();
    const ownedOrg = profile?.business_id ?? profile?.org_id ?? null;
    if (!ownedOrg || String(ownedOrg) !== organization_id) {
      return json({ error: "You do not own this organization" }, 403);
    }
    const toEmail = email ?? (profile as any)?.email;
    if (!toEmail) return json({ success: false, error: "No recipient email on file" });

    const { data: liq } = await admin
      .from("liquidity_metrics")
      .select("cash_position, burn_rate, runway_months, health_score")
      .eq("business_id", organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Attempt revenue metrics (table may not exist in all environments)
    let mrr: number | null = null;
    let churn: number | null = null;
    try {
      const { data: rev } = await admin
        .from("revenue_quality")
        .select("mrr, churn_rate")
        .eq("business_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rev) {
        mrr = (rev as any).mrr ?? null;
        churn = (rev as any).churn_rate ?? null;
      }
    } catch { /* ignore */ }

    const cash = (liq as any)?.cash_position ?? null;
    const burn = (liq as any)?.burn_rate ?? null;
    const runway = (liq as any)?.runway_months ?? null;
    const health = (liq as any)?.health_score ?? null;

    const revBlock = mrr !== null
      ? `<tr><td style="padding:6px 0;color:#4A4540;">MRR</td><td style="padding:6px 0;font-weight:600;color:#1A1008;text-align:right;">${fmtInr(mrr)}</td></tr>
         <tr><td style="padding:6px 0;color:#4A4540;">Churn rate</td><td style="padding:6px 0;font-weight:600;color:#1A1008;text-align:right;">${churn !== null ? `${(churn as number).toFixed(1)}%` : "—"}</td></tr>`
      : "";

    const html = `<!doctype html><html><body style="margin:0;background:#EFE8D8;font-family:Inter,Arial,sans-serif;color:#1A1008;">
      <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
        <h1 style="font-size:20px;margin:0 0 8px;color:#1A1008;">Your weekly financial summary from FYNHelp</h1>
        <p style="font-size:13px;color:#4A4540;margin:0 0 20px;">A quick snapshot of your business this week.</p>
        <div style="background:#FFFFFF;border:1px solid #D4C9A8;border-radius:10px;padding:20px;">
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#4A4540;">Cash position</td><td style="padding:6px 0;font-weight:600;color:#1A1008;text-align:right;">${fmtInr(cash)}</td></tr>
            <tr><td style="padding:6px 0;color:#4A4540;">Burn rate / month</td><td style="padding:6px 0;font-weight:600;color:#1A1008;text-align:right;">${fmtInr(burn)}</td></tr>
            <tr><td style="padding:6px 0;color:#4A4540;">Runway</td><td style="padding:6px 0;font-weight:600;color:#1A1008;text-align:right;">${runway !== null ? `${runway} months` : "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#4A4540;">Health score</td><td style="padding:6px 0;font-weight:600;color:#1A1008;text-align:right;">${health !== null ? `${health}/100` : "—"}</td></tr>
            ${revBlock}
          </table>
        </div>
        <p style="font-size:12px;color:#4A4540;margin:20px 0 0;">View your full dashboard at <a href="https://fynhelp.com/dashboard/liquidity" style="color:#A93838;">fynhelp.com/dashboard/liquidity</a></p>
      </div>
    </body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Fynny <fynny@fynhelp.com>",
        to: [toEmail],
        subject: "Your FYNHelp weekly financial summary",
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ success: false, error: `Resend ${res.status}: ${t.slice(0, 200)}` });
    }
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
