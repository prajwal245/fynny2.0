import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "FynHelp <noreply@fynhelp.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

const shell = (title: string, bodyHtml: string, cta?: { label: string; href: string }) => `
<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#F8F7F4;margin:0;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid rgba(26,26,26,0.08);overflow:hidden">
  <div style="background:#0F6E56;padding:24px 32px">
    <div style="font-family:Georgia,serif;font-size:21px;font-weight:700;color:#fff">FynHelp</div>
    <div style="font-size:10.5px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.4px;margin-top:3px">CA Portal</div>
  </div>
  <div style="padding:30px 32px">
    <h1 style="font-family:Georgia,serif;font-size:20px;color:#1A1A1A;margin:0 0 14px">${title}</h1>
    ${bodyHtml}
    ${cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:22px;background:#0F6E56;color:#fff;font-weight:600;font-size:14px;padding:12px 26px;border-radius:9px;text-decoration:none">${cta.label}</a>` : ""}
    <p style="font-size:12px;color:rgba(26,26,26,0.45);margin-top:26px">Sent by FynHelp on behalf of your CA firm.</p>
  </div>
</div></body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const internalService = req.headers.get("X-Internal-Service");
  const isInternalCall = internalService === "ca-compliance-alerts";

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let user: { id: string; email?: string } | null = null;
  if (!isInternalCall) {
    const { data: userRes } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    user = userRes?.user ?? null;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }


  let body: {
    kind?: "client_invite" | "team_invite" | "document_chase";
    request_title?: string;
    period?: string | null;
    doc_types?: string[];
    due_date?: string;
    days_overdue?: number;
    ca_firm_id?: string;
    to: string;
    client_name?: string;
    access_level?: string;
    accept_url?: string;
    role?: string;
    subject?: string;
    body?: string;
  };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid body" }), { status: 400, headers: cors });
  }

  const ADMIN_EMAILS = ["adireddytarun@fynhelp.com", "nidhi@fynhelp.com", "support@fynhelp.com"];
  const callerEmail = user?.email?.toLowerCase().trim() ?? "";

  // Generic admin-authored email: { to, subject, body }
  if (!body.kind && body.subject && body.body) {
    if (!isInternalCall && !ADMIN_EMAILS.includes(callerEmail)) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403, headers: cors });
    }

    if (!body.to) {
      return new Response(JSON.stringify({ success: false, error: "to is required" }), { status: 400, headers: cors });
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Email service not configured" }), { status: 500, headers: cors });
    }
    const genericHtml = shell(
      esc(body.subject),
      `<p style="font-size:14px;color:rgba(26,26,26,0.72);line-height:1.7;margin:0;white-space:pre-line">${esc(body.body)}</p>`,
    );
    const genericRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [body.to], subject: body.subject, html: genericHtml }),
    });
    const genericPayload = await genericRes.json().catch(() => ({}));
    if (!genericRes.ok) {
      console.error("resend error", genericPayload);
      return new Response(JSON.stringify({ success: false, error: "Email send failed", detail: genericPayload }), { status: 502, headers: cors });
    }
    return new Response(JSON.stringify({ success: true, id: genericPayload?.id ?? null }), { headers: cors });
  }

  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { kind, ca_firm_id, to } = body;

  if (!kind || !ca_firm_id || !to) {
    return new Response(JSON.stringify({ success: false, error: "kind, ca_firm_id and to are required" }), { status: 400, headers: cors });
  }


  // Caller must belong to the firm they are emailing on behalf of.
  const [{ data: firm }, { data: member }] = await Promise.all([
    admin.from("ca_firms").select("id, firm_name, user_id").eq("id", ca_firm_id).maybeSingle(),
    admin.from("ca_firm_members").select("id").eq("ca_firm_id", ca_firm_id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!firm) return new Response(JSON.stringify({ error: "Firm not found" }), { status: 404, headers: cors });
  if (firm.user_id !== user.id && !member) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
  }

  const firmName = esc(firm.firm_name ?? "your CA firm");
  let subject = "";
  let html = "";

  if (kind === "document_chase") {
    const docs = (body.doc_types ?? []).map((d) => esc(String(d))).join(", ") || "the requested documents";
    const period = body.period ? esc(String(body.period)) : "the current period";
    subject = `Reminder from ${firm.firm_name}: ${body.request_title ?? "documents"} pending for ${period}`;
    html = shell(
      "Documents still pending",
      `<p style="font-size:14px;color:rgba(26,26,26,0.72);line-height:1.7;margin:0">
         Hello ${esc(body.client_name ?? "there")},<br><br>
         <strong>${firmName}</strong> is still waiting for <strong>${docs}</strong> for the period <strong>${period}</strong>.<br>
         This was due on <strong>${esc(body.due_date ?? "")}</strong>${body.days_overdue ? ` — <strong>${Number(body.days_overdue)} day(s) overdue</strong>` : ""}.<br><br>
         Please upload the documents through your FynHelp client portal so your filings stay on schedule.
       </p>`,
      { label: "Upload documents", href: "https://fynhelp.com/client-portal" },
    );
  } else if (kind === "client_invite") {
    subject = `You have been invited to share financial access with ${firm.firm_name} on FynHelp`;
    html = shell(
      `${firmName} has requested access to your books`,
      `<p style="font-size:14px;color:rgba(26,26,26,0.72);line-height:1.7;margin:0">
         Hello ${esc(body.client_name ?? "there")},<br><br>
         <strong>${firmName}</strong> has invited you to share your financial data on FynHelp.<br>
         Requested access level: <strong>${esc(body.access_level ?? "read")}</strong>.<br><br>
         You can review and accept or decline this request using the link below. The invitation expires in 7 days.
       </p>`,
      body.accept_url ? { label: "Review invitation", href: body.accept_url } : undefined,
    );
  } else {
    subject = `You have been invited to join ${firm.firm_name} on FynHelp`;
    html = shell(
      `Join ${firmName} on FynHelp`,
      `<p style="font-size:14px;color:rgba(26,26,26,0.72);line-height:1.7;margin:0">
         You have been invited to join <strong>${firmName}</strong>'s CA portal as
         <strong>${esc(body.role ?? "member")}</strong>. Create your account with this email address to get access.
       </p>`,
      { label: "Open CA Portal", href: "https://fynhelp.com/ca/register" },
    );
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: cors });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("resend error", payload);
    return new Response(JSON.stringify({ error: "Email send failed", detail: payload }), { status: 502, headers: cors });
  }

  return new Response(JSON.stringify({ ok: true, id: payload?.id ?? null }), { headers: cors });
});
