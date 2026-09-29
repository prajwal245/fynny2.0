/**
 * Chaser auto-escalation.
 *
 * Any document request that was chased more than two days ago and still has no
 * reply is escalated: the request status moves to `escalated`, a chaser event is
 * recorded for the timeline, the firm gets a notification and the brain is told.
 *
 * Secret-gated with the CA cron secret (`x-cron-secret` header or
 * `Authorization: Bearer <secret>`). No PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";

const DAY = 86_400_000;

interface ChaserRow {
  id: string;
  ca_firm_id: string;
  business_id: string;
  title: string;
}

async function run(request: Request): Promise<Response> {
  const accepted = [process.env["CA_CRON_SECRET"], process.env["CRON_SECRET"]].filter(
    (s): s is string => Boolean(s),
  );
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!accepted.length || !provided || !accepted.includes(provided)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * DAY).toISOString();

  // Chased at least two days ago, no reply, not already escalated or fulfilled.
  const { data, error } = await supabaseAdmin
    .from("ca_document_requests")
    .select("id, ca_firm_id, business_id, title")
    .in("status", ["pending", "sent", "chased"])
    .not("last_chased_at", "is", null)
    .lt("last_chased_at", twoDaysAgo)
    .limit(500);

  if (error) {
    console.error(JSON.stringify({ fn: "ca-auto-escalate-chasers", step: "load", error: error.message }));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const toEscalate = (data ?? []) as ChaserRow[];
  if (!toEscalate.length) {
    console.log(JSON.stringify({ fn: "ca-auto-escalate-chasers", escalated: 0 }));
    return new Response(JSON.stringify({ escalated: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  const ids = toEscalate.map((c) => c.id);
  const { error: updErr } = await supabaseAdmin
    .from("ca_document_requests")
    .update({ status: "escalated", escalated_at: nowIso, updated_at: nowIso } as never)
    .in("id", ids);
  if (updErr) {
    console.error(JSON.stringify({ fn: "ca-auto-escalate-chasers", step: "update", error: updErr.message }));
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  await supabaseAdmin.from("ca_chaser_events").insert(
    toEscalate.map((c) => ({
      chaser_id: c.id,
      ca_firm_id: c.ca_firm_id,
      business_id: c.business_id,
      event_type: "auto_escalated",
      note: "No reply after 2 days — auto-escalated to partner",
    })) as never,
  );

  await supabaseAdmin.from("ca_notifications").insert(
    toEscalate.map((c) => ({
      ca_firm_id: c.ca_firm_id,
      business_id: c.business_id,
      type: "chaser_escalated",
      severity: "critical",
      title: "Chaser escalated",
      message: `No reply to "${c.title}" after 2 days. Needs partner follow-up.`,
      is_read: false,
    })) as never,
  );

  await supabaseAdmin.from("ca_brain_events").insert(
    toEscalate.map((c) => ({
      ca_firm_id: c.ca_firm_id,
      business_id: c.business_id,
      event_type: "chaser_escalated",
      payload: { chaser_id: c.id, subject: c.title, auto: true },
    })) as never,
  );

  console.log(`[fyn:chaser] auto-escalated ${toEscalate.length} chasers`);
  return new Response(JSON.stringify({ escalated: toEscalate.length }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/ca-auto-escalate-chasers")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
