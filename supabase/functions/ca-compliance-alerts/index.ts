import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const log = (level: "INFO" | "WARN" | "ERROR", event: string, data?: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...data }));

const fmtDate = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
const daysOverdue = (d: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

type AlertedEvent = {
  event_id: string;
  event_type: string;
  filing_period: string;
  due_date: string;
  days_overdue: number;
  business_id: string;
};

type AlertedFirm = {
  firm_id: string;
  firm_name: string;
  firm_email: string;
  events_count: number;
  events: AlertedEvent[];
  email_sent: boolean;
  email_error: string | null;
};

type SkippedEvent = {
  event_id: string;
  firm_id: string;
  reason: "duplicate_within_24h" | "firm_no_email";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = Date.now();
  const runAt = new Date().toISOString();

  try {
    const nowIso = new Date().toISOString();
    const { data: events, error } = await admin
      .from("ca_compliance_events")
      .select("id, ca_firm_id, business_id, event_type, filing_period, due_date, status")
      .neq("status", "filed")
      .lt("due_date", nowIso)
      .eq("is_demo", false)
      .order("due_date", { ascending: true });

    if (error) {
      log("ERROR", "query_failed", { error: error.message });
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: cors });
    }

    const byFirm = new Map<string, typeof events>();
    for (const e of events ?? []) {
      if (!e.ca_firm_id) continue;
      const list = byFirm.get(e.ca_firm_id) ?? [];
      list.push(e);
      byFirm.set(e.ca_firm_id, list as typeof events);
    }

    log("INFO", "run_start", {
      total_overdue_events: events?.length ?? 0,
      distinct_firms: byFirm.size,
    });

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let firmsAlerted = 0;
    let eventsProcessed = 0;
    let skipped = 0;
    let eventsSkippedDuplicate = 0;
    let firmsSkippedNoEmail = 0;
    const alertedFirms: AlertedFirm[] = [];
    const skippedEvents: SkippedEvent[] = [];

    for (const [firmId, firmEvents] of byFirm.entries()) {
      const { data: firm } = await admin
        .from("ca_firms")
        .select("id, email, ca_name, firm_name")
        .eq("id", firmId)
        .maybeSingle();
      if (!firm?.email) {
        skipped += firmEvents!.length;
        firmsSkippedNoEmail++;
        for (const ev of firmEvents!) {
          skippedEvents.push({ event_id: ev.id, firm_id: firmId, reason: "firm_no_email" });
        }
        log("WARN", "firm_skip_no_email", { firm_id: firmId, firm_name: firm?.firm_name ?? null });
        continue;
      }

      const fresh: NonNullable<typeof events> = [];
      for (const ev of firmEvents!) {
        const { data: existing } = await admin
          .from("ca_notifications")
          .select("id")
          .eq("ca_firm_id", firmId)
          .eq("type", "compliance_overdue")
          .like("message", `%${ev.id}%`)
          .gte("created_at", since)
          .limit(1);
        if (existing && existing.length > 0) {
          skipped++;
          eventsSkippedDuplicate++;
          skippedEvents.push({ event_id: ev.id, firm_id: firmId, reason: "duplicate_within_24h" });
          log("INFO", "event_skip_duplicate", {
            firm_id: firmId,
            event_id: ev.id,
            event_type: ev.event_type,
            filing_period: ev.filing_period,
          });
          continue;
        }
        fresh.push(ev);
      }

      if (fresh.length === 0) continue;

      for (const ev of fresh) {
        await admin.from("ca_notifications").insert({
          ca_firm_id: firmId,
          business_id: ev.business_id,
          type: "compliance_overdue",
          title: "Compliance event overdue",
          message: `Filing ${ev.event_type} for period ${ev.filing_period} was due on ${fmtDate(ev.due_date)} and has not been filed. Penalty may apply. [event:${ev.id}]`,
          severity: "warning",
          is_read: false,
          is_demo: false,
        });
        eventsProcessed++;
        log("INFO", "notification_inserted", {
          firm_id: firmId,
          event_id: ev.id,
          event_type: ev.event_type,
          filing_period: ev.filing_period,
          days_overdue: daysOverdue(ev.due_date),
        });
      }

      const lines = fresh
        .map(
          (ev) =>
            `• Client ${ev.business_id ?? "—"} — ${ev.event_type} (${ev.filing_period}) — due ${fmtDate(ev.due_date)} — ${daysOverdue(ev.due_date)} day(s) overdue`,
        )
        .join("\n");

      const emailBody = `Hello ${firm.ca_name ?? firm.firm_name ?? "there"},

The following compliance filings for your clients are overdue:

${lines}

Please review and file these at the earliest to avoid penalties.`;

      let emailSent = false;
      let emailError: string | null = null;

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ca-send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            "X-Internal-Service": "ca-compliance-alerts",
          },
          body: JSON.stringify({
            to: firm.email,
            subject: `Action required: ${fresh.length} overdue compliance filing(s) for your clients`,
            body: emailBody,
          }),
        });
        if (!res.ok) {
          emailError = await res.text();
          console.error("ca-send-email failed", firmId, emailError);
          log("ERROR", "email_failed", { firm_id: firmId, firm_email: firm.email, error: emailError });
        } else {
          emailSent = true;
          log("INFO", "email_sent", { firm_id: firmId, firm_email: firm.email, events_count: fresh.length });
        }
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
        console.error("ca-send-email error", firmId, e);
        log("ERROR", "email_failed", { firm_id: firmId, firm_email: firm.email, error: emailError });
      }

      alertedFirms.push({
        firm_id: firmId,
        firm_name: firm.firm_name ?? firm.ca_name ?? "",
        firm_email: firm.email,
        events_count: fresh.length,
        events: fresh.map((ev) => ({
          event_id: ev.id,
          event_type: ev.event_type,
          filing_period: ev.filing_period,
          due_date: ev.due_date,
          days_overdue: daysOverdue(ev.due_date),
          business_id: ev.business_id,
        })),
        email_sent: emailSent,
        email_error: emailError,
      });

      firmsAlerted++;
    }

    const durationMs = Date.now() - startedAt;
    log("INFO", "run_complete", {
      firms_alerted: firmsAlerted,
      events_processed: eventsProcessed,
      skipped,
      duration_ms: durationMs,
    });

    return new Response(
      JSON.stringify({
        success: true,
        run_at: runAt,
        duration_ms: durationMs,
        summary: {
          total_overdue_events: events?.length ?? 0,
          distinct_firms_with_overdue: byFirm.size,
          firms_alerted: firmsAlerted,
          events_processed: eventsProcessed,
          events_skipped_duplicate: eventsSkippedDuplicate,
          firms_skipped_no_email: firmsSkippedNoEmail,
        },
        alerted_firms: alertedFirms,
        skipped_events: skippedEvents,
      }),
      { headers: cors },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    log("ERROR", "run_failed", { error: msg, duration_ms: Date.now() - startedAt });
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: cors });
  }
});
