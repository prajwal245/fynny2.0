/**
 * Scheduled compliance alerting.
 *
 * Creates one notification per upcoming/overdue compliance event (deduplicated
 * on compliance_event_id) and flips past-due pending events to overdue.
 *
 * Callers must present the cron secret (`x-cron-secret` header or
 * `Authorization: Bearer <secret>`). No PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";
import { penaltyEstimate } from "@/lib/caPenalty";

const DAY = 86_400_000;

async function run(request: Request): Promise<Response> {
  const secret = process.env["CA_CRON_SECRET"];
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * DAY);

  const { data: events, error } = await supabaseAdmin
    .from("ca_compliance_events")
    .select("id, ca_firm_id, business_id, event_type, filing_period, due_date, status")
    .neq("status", "filed")
    .not("ca_firm_id", "is", null)
    .lte("due_date", horizon.toISOString().slice(0, 10))
    .limit(5000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = events ?? [];
  const ids = rows.map((e) => e.id);

  const existing = new Set<string>();
  if (ids.length) {
    const { data: notifs } = await supabaseAdmin
      .from("ca_notifications")
      .select("compliance_event_id")
      .in("compliance_event_id", ids);
    for (const n of notifs ?? []) {
      if (n.compliance_event_id) existing.add(n.compliance_event_id as string);
    }
  }

  // Client names for the alert copy.
  const businessIds = [...new Set(rows.map((e) => e.business_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (businessIds.length) {
    const { data: clients } = await supabaseAdmin
      .from("ca_clients")
      .select("business_id, client_name")
      .in("business_id", businessIds);
    for (const c of clients ?? []) {
      if (c.business_id) names.set(c.business_id as string, c.client_name as string);
    }
  }

  // Per-firm notification preferences. Missing keys fire (backward compatible);
  // only an explicit "false" suppresses a reminder window.
  const firmIds = [...new Set(rows.map((e) => e.ca_firm_id).filter(Boolean))] as string[];
  const prefs = new Map<string, Record<string, unknown>>();
  if (firmIds.length) {
    const { data: firms } = await supabaseAdmin
      .from("ca_firms")
      .select("id, notification_prefs")
      .in("id", firmIds);
    for (const f of firms ?? []) {
      prefs.set(f.id as string, (f.notification_prefs ?? {}) as Record<string, unknown>);
    }
  }

  const prefAllows = (firmId: string | null, daysRemaining: number): boolean => {
    const p = firmId ? prefs.get(firmId) : undefined;
    if (!p) return true;
    const key = daysRemaining <= 0 ? "compliance_0d" : daysRemaining <= 3 ? "compliance_3d" : "compliance_7d";
    const value = p[key];
    if (value === undefined || value === null) return true;
    return String(value) !== "false";
  };

  const inserts = rows
    .filter((e) => !existing.has(e.id))
    .filter((e) => {
      const days = Math.ceil((new Date(e.due_date as string).getTime() - now.getTime()) / DAY);
      return prefAllows((e.ca_firm_id as string) ?? null, days);
    })
    .map((e) => {

      const due = new Date(e.due_date as string);
      const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / DAY);
      const penalty = penaltyEstimate(e.event_type as string, e.due_date as string, now);
      const severity = daysRemaining < 0 ? "critical" : daysRemaining <= 3 ? "warning" : "info";
      const clientName = names.get(e.business_id as string) ?? "client";
      return {
        ca_firm_id: e.ca_firm_id,
        business_id: e.business_id,
        compliance_event_id: e.id,
        type: "compliance_due",
        title: `Filing due: ${e.event_type} for ${clientName}`,
        message: `Due ${e.due_date}. ${daysRemaining} days remaining. Penalty risk: Rs ${penalty.toLocaleString("en-IN")}.`,
        severity,
        is_read: false,
        is_demo: false,
        metadata: {
          compliance_event_id: e.id,
          client_id: e.business_id,
          return_type: e.event_type,
          due_date: e.due_date,
          filing_period: e.filing_period,
          penalty_estimate: penalty,
        },
      };
    });

  let alertsCreated = 0;
  if (inserts.length) {
    const { data: created, error: insErr } = await supabaseAdmin
      .from("ca_notifications")
      .insert(inserts as never)
      .select("id");
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    alertsCreated = created?.length ?? 0;
  }

  const today = now.toISOString().slice(0, 10);
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("ca_compliance_events")
    .update({ status: "overdue", updated_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("due_date", today)
    .select("id");

  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ alerts_created: alertsCreated, events_updated: updated?.length ?? 0 }),
    { headers: { "content-type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/public/ca-compliance-auto-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
