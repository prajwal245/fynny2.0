import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "FYNHelp <noreply@fynhelp.com>";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: { ca_firm_id: string; type: "approved" | "rejected"; reason?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400, headers: corsHeaders });
  }

  const { ca_firm_id, type, reason } = body;
  if (!ca_firm_id || !type) {
    return new Response(JSON.stringify({ error: "ca_firm_id and type required" }), { status: 400, headers: corsHeaders });
  }

  const { data: firm, error: firmErr } = await serviceClient
    .from("ca_firms")
    .select("firm_name, email")
    .eq("id", ca_firm_id)
    .maybeSingle();

  const ca_name = firm?.firm_name ?? "there";

  if (firmErr || !firm) {
    return new Response(JSON.stringify({ error: "CA firm not found" }), { status: 404, headers: corsHeaders });
  }

  if (!firm.email) {
    return new Response(JSON.stringify({ error: "CA firm has no email address" }), { status: 400, headers: corsHeaders });
  }

  let subject = "";
  let html = "";

  if (type === "approved") {
    subject = "Your FYNHelp CA Portal is now active";
    html = `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#F4EDDA;margin:0;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid rgba(26,16,8,0.08);overflow:hidden">
  <div style="background:#1A1008;padding:28px 32px">
    <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#F4EDDA">FYNHelp</div>
    <div style="font-size:11px;color:#8B6914;text-transform:uppercase;letter-spacing:1px;margin-top:4px">CA Partner Portal</div>
  </div>
  <div style="padding:32px">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#1A1008;margin:0 0 12px 0">Welcome to FYNHelp CA Portal, ${ca_name}</h1>
    <p style="font-size:14px;color:rgba(26,16,8,0.7);line-height:1.7;margin:0 0 20px 0">
      Your application for <strong>${firm.firm_name}</strong> has been reviewed and approved by our compliance team. Your CA Partner Portal is now fully active.
    </p>
    <div style="background:#F4EDDA;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;font-weight:600;color:#8B6914;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">What you can do now</div>
      <div style="font-size:13px;color:rgba(26,16,8,0.75);line-height:1.8">
        Onboard client portfolios and manage up to 20 clients free<br>
        Generate compliance calendars for every client automatically<br>
        Run ITC reconciliation with GSTR-2B matching<br>
        Use bulk filing queue for up to 50 clients at once<br>
        Message clients directly through the portal
      </div>
    </div>
    <a href="https://fynhelp.com/ca/login" style="display:inline-block;background:#C41E1E;color:#ffffff;font-family:Inter,sans-serif;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
      Sign in to CA Portal
    </a>
    <p style="font-size:12px;color:rgba(26,16,8,0.45);margin-top:24px">
      Questions? Reply to this email or contact support@fynhelp.com
    </p>
  </div>
</div>
</body>
</html>`;
  } else {
    subject = "FYNHelp CA Portal — Application update";
    html = `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#F4EDDA;margin:0;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid rgba(26,16,8,0.08);overflow:hidden">
  <div style="background:#1A1008;padding:28px 32px">
    <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#F4EDDA">FYNHelp</div>
    <div style="font-size:11px;color:#8B6914;text-transform:uppercase;letter-spacing:1px;margin-top:4px">CA Partner Portal</div>
  </div>
  <div style="padding:32px">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#1A1008;margin:0 0 12px 0">Application update for ${firm.firm_name}</h1>
    <p style="font-size:14px;color:rgba(26,16,8,0.7);line-height:1.7;margin:0 0 20px 0">
      Dear ${ca_name}, we have reviewed your CA Partner Portal application. Unfortunately we were unable to approve it at this time.
    </p>
    <div style="background:#FEE2E2;border-radius:8px;padding:16px 20px;margin-bottom:24px;border-left:4px solid #C41E1E">
      <div style="font-size:11px;font-weight:600;color:#991B1B;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Reason for rejection</div>
      <div style="font-size:13px;color:rgba(26,16,8,0.8);line-height:1.6">${reason ?? "Please contact support for details."}</div>
    </div>
    <p style="font-size:14px;color:rgba(26,16,8,0.7);line-height:1.7;margin:0 0 20px 0">
      You are welcome to reapply after addressing the above. Please contact us if you need any clarification.
    </p>
    <a href="mailto:support@fynhelp.com" style="display:inline-block;background:#1A1008;color:#F4EDDA;font-family:Inter,sans-serif;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">
      Contact Support
    </a>
  </div>
</div>
</body>
</html>`;
  }

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [firm.email],
      subject,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error("Resend error:", errBody);
    return new Response(JSON.stringify({ error: "Email send failed", detail: errBody }), { status: 500, headers: corsHeaders });
  }

  await serviceClient.from("ca_notifications").insert({
    ca_firm_id,
    title: type === "approved" ? "Account approved" : "Application rejected",
    message: type === "approved"
      ? "Your FYNHelp CA Portal account has been approved. You can now log in and start onboarding clients."
      : `Your application was rejected. Reason: ${reason ?? "Contact support for details."}`,
    severity: type === "approved" ? "info" : "warning",
    is_read: false,
  });

  return new Response(JSON.stringify({ success: true, type, email_sent_to: firm.email }), {
    status: 200, headers: corsHeaders,
  });
});
