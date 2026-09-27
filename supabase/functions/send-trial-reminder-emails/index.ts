// Sends 7-day, 1-day, and expired trial reminder emails via Resend.
// Runs via pg_cron (once daily) or manual POST. Idempotent per business via boolean flags.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const APP_URL = "https://fynhelp.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function shell(title: string, body: string, cta: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#EFE8D8;font-family:Inter,Arial,sans-serif;color:#1A1008;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:22px;margin:0 0 12px;color:#1A1008;">${title}</h1>
      <div style="background:#FFFFFF;border:1px solid #D4C9A8;border-radius:10px;padding:22px;font-size:14px;line-height:1.55;color:#4A4540;">
        ${body}
        <div style="margin-top:22px;">
          <a href="${cta.href}" style="display:inline-block;background:#A93838;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;">${cta.label}</a>
        </div>
      </div>
      <p style="font-size:12px;color:#4A4540;margin:18px 0 0;">FynHelp · Financial intelligence for Indian SMEs · <a href="${APP_URL}" style="color:#A93838;">fynhelp.com</a></p>
    </div>
  </body></html>`;
}

type Bucket = "7d" | "1d" | "expired";

function template(bucket: Bucket, businessName: string, daysLeft: number) {
  const upgrade = `${APP_URL}/dashboard/settings/billing`;
  if (bucket === "7d") {
    return {
      subject: "7 days left in your FynHelp trial",
      html: shell(
        "7 days left in your FynHelp trial",
        `<p>Hi from FynHelp,</p>
         <p>Your free trial for <strong>${businessName}</strong> ends in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>. Upgrade to keep your dashboard, GST intelligence, reports and Fynny AI running without interruption.</p>`,
        { href: upgrade, label: "Upgrade my plan" },
      ),
    };
  }
  if (bucket === "1d") {
    return {
      subject: "Your FynHelp trial ends tomorrow",
      html: shell(
        "Your FynHelp trial ends tomorrow",
        `<p>Heads up — the free trial for <strong>${businessName}</strong> ends in less than 24 hours.</p>
         <p>Upgrade now to avoid losing access to your dashboard, alerts, and Fynny AI. Questions? Reply to this email.</p>`,
        { href: upgrade, label: "Upgrade now" },
      ),
    };
  }
  return {
    subject: "Your FynHelp trial has ended",
    html: shell(
      "Your FynHelp trial has ended",
      `<p>Your free trial for <strong>${businessName}</strong> has ended. Your data is safe — upgrade to a paid plan to restore access to your dashboard, reports and Fynny AI.</p>
       <p>Need help choosing a plan? Just reply to this email.</p>`,
      { href: upgrade, label: "Upgrade to keep using FynHelp" },
    ),
  };
}

async function sendEmail(RESEND_API_KEY: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FynHelp <hello@fynhelp.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  // Simple protection: either a valid cron secret or a caller-supplied service role
  const auth = req.headers.get("Authorization") ?? "";
  const providedSecret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  const authed =
    (CRON_SECRET && providedSecret === CRON_SECRET) ||
    auth === `Bearer ${SERVICE}`;
  if (!authed) return json({ error: "Unauthorized" }, 401);

  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE);
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  const nowIso = new Date().toISOString();
  const in7d = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const in1d = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();

  const buckets: Array<{
    bucket: Bucket;
    flag: string;
    query: () => Promise<any>;
  }> = [
    {
      bucket: "7d",
      flag: "trial_reminder_7d_sent",
      query: () =>
        admin
          .from("businesses")
          .select("id, business_name, trial_ends_at")
          .eq("trial_reminder_7d_sent", false)
          .eq("is_demo", false)
          .gt("trial_ends_at", nowIso)
          .lte("trial_ends_at", in7d),
    },
    {
      bucket: "1d",
      flag: "trial_reminder_1d_sent",
      query: () =>
        admin
          .from("businesses")
          .select("id, business_name, trial_ends_at")
          .eq("trial_reminder_1d_sent", false)
          .eq("is_demo", false)
          .gt("trial_ends_at", nowIso)
          .lte("trial_ends_at", in1d),
    },
    {
      bucket: "expired",
      flag: "trial_expired_notified",
      query: () =>
        admin
          .from("businesses")
          .select("id, business_name, trial_ends_at")
          .eq("trial_expired_notified", false)
          .eq("is_demo", false)
          .lte("trial_ends_at", nowIso),
    },
  ];

  const summary: Record<string, { candidates: number; sent: number; skipped: number; errors: string[] }> = {};

  for (const b of buckets) {
    const { data: rows, error } = await b.query();
    if (error) {
      summary[b.bucket] = { candidates: 0, sent: 0, skipped: 0, errors: [error.message] };
      continue;
    }
    const s = { candidates: rows?.length ?? 0, sent: 0, skipped: 0, errors: [] as string[] };
    for (const biz of rows ?? []) {
      // Look up owner email via profiles + auth.users
      const { data: prof } = await admin
        .from("profiles")
        .select("user_id")
        .eq("business_id", biz.id)
        .limit(1)
        .maybeSingle();
      if (!prof?.user_id) { s.skipped++; continue; }
      const { data: userRes } = await admin.auth.admin.getUserById(prof.user_id);
      const email = userRes?.user?.email;
      if (!email) { s.skipped++; continue; }

      const endsAt = new Date(biz.trial_ends_at as string);
      const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const { subject, html } = template(b.bucket, biz.business_name ?? "your business", daysLeft);

      if (dryRun) { s.sent++; continue; }
      try {
        await sendEmail(RESEND_API_KEY, email, subject, html);
        await admin.from("businesses").update({ [b.flag]: true }).eq("id", biz.id);
        s.sent++;
      } catch (e) {
        s.errors.push(`${biz.id}: ${(e as Error).message}`);
      }
    }
    summary[b.bucket] = s;
  }

  return json({ ok: true, dry_run: dryRun, summary });
});
