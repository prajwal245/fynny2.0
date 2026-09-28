/**
 * Auto follow-up engine (Chaser OS).
 *
 * Runs every active `ca_follow_up_rules` row and chases overdue document
 * requests exactly the way the manual "Chase now" button does: sends the
 * `document_chase` email, records a `ca_client_messages` row and bumps
 * `chaser_count` / `last_chased_at`. Long-wait rules with an escalation role
 * also raise a critical `ca_notifications` entry for the firm.
 *
 * Secret-gated with the cron secret (`x-cron-secret` header or
 * `Authorization: Bearer <secret>`). No PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";

const DAY = 86_400_000;

interface RuleRow {
  id: string;
  ca_firm_id: string;
  rule_name: string;
  trigger_event: string;
  wait_days: number;
  action_type: string;
  escalate_to_role: string | null;
}

interface RequestRow {
  id: string;
  ca_firm_id: string;
  business_id: string;
  title: string;
  period: string | null;
  doc_types: string[] | null;
  due_date: string;
  last_chased_at: string | null;
  chaser_count: number | null;
}

const daysOverdue = (due: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(due).getTime()) / DAY));

async function run(request: Request): Promise<Response> {
  // Either the shared CA cron secret or the scheduler-specific secret is accepted.
  const accepted = [process.env["CA_CRON_SECRET"], process.env["CRON_SECRET"], process.env["CA_AUTO_FOLLOWUP_SECRET"]].filter(
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
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: rulesData, error: rulesErr } = await supabaseAdmin
    .from("ca_follow_up_rules")
    .select("id, ca_firm_id, rule_name, trigger_event, wait_days, action_type, escalate_to_role")
    .eq("is_active", true)
    .limit(500);

  if (rulesErr) {
    console.error(JSON.stringify({ fn: "ca-auto-followup", step: "load_rules", error: rulesErr.message }));
    return new Response(JSON.stringify({ error: rulesErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const rules = ((rulesData ?? []) as RuleRow[]).filter(
    (r) => r.trigger_event === "document_overdue" && r.action_type === "email",
  );

  let processed = 0;
  let chased = 0;
  let escalated = 0;
  const chasedIds = new Set<string>();

  for (const rule of rules) {
    const wait = Math.min(30, Math.max(1, Number(rule.wait_days) || 3));
    const cutoff = new Date(now.getTime() - wait * DAY).toISOString();

    const { data: reqData, error: reqErr } = await supabaseAdmin
      .from("ca_document_requests")
      .select("id, ca_firm_id, business_id, title, period, doc_types, due_date, last_chased_at, chaser_count")
      .eq("ca_firm_id", rule.ca_firm_id)
      .neq("status", "fulfilled")
      // Requests scheduled by the practice Chaser follow their own schedule.
      .or("managed_by.is.null,managed_by.neq.practice")
      .lt("due_date", cutoff.slice(0, 10))
      .limit(500);

    if (reqErr) {
      console.error(JSON.stringify({ fn: "ca-auto-followup", step: "load_requests", rule: rule.id, error: reqErr.message }));
      continue;
    }

    const due = ((reqData ?? []) as RequestRow[]).filter(
      (r) => !r.last_chased_at || r.last_chased_at < cutoff,
    );
    processed += due.length;
    if (!due.length) continue;

    // Client contact details for this firm's affected clients.
    const businessIds = [...new Set(due.map((r) => r.business_id).filter(Boolean))];
    const clients = new Map<string, { client_name: string; client_email: string | null }>();
    if (businessIds.length) {
      const { data: cls } = await supabaseAdmin
        .from("ca_clients")
        .select("business_id, client_name, client_email")
        .eq("ca_firm_id", rule.ca_firm_id)
        .in("business_id", businessIds);
      for (const c of cls ?? []) {
        if (c.business_id) {
          clients.set(c.business_id as string, {
            client_name: c.client_name as string,
            client_email: (c.client_email as string | null) ?? null,
          });
        }
      }
    }

    for (const r of due) {
      if (chasedIds.has(r.id)) continue;
      const client = clients.get(r.business_id);
      const od = daysOverdue(r.due_date, now);
      const docList = r.doc_types?.length ? r.doc_types.join(", ") : "the requested documents";

      if (client?.client_email) {
        const { error: mailErr } = await supabaseAdmin.functions.invoke("ca-send-email", {
          body: {
            kind: "document_chase",
            ca_firm_id: rule.ca_firm_id,
            to: client.client_email,
            client_name: client.client_name,
            request_title: r.title,
            period: r.period,
            doc_types: r.doc_types ?? [],
            due_date: r.due_date,
            days_overdue: od,
          },
        });
        if (mailErr) {
          console.error(JSON.stringify({ fn: "ca-auto-followup", step: "send_email", request: r.id, error: mailErr.message }));
          continue;
        }
      }

      const message = `Automated reminder — we are still waiting for ${docList}${r.period ? ` for the period ${r.period}` : ""}. It was due on ${r.due_date} (${od} days ago). Please upload via your FynHelp portal.`;

      await supabaseAdmin.from("ca_client_messages").insert({
        ca_firm_id: rule.ca_firm_id,
        business_id: r.business_id,
        sender_type: "ca",
        message,
        is_read: false,
      } as never);

      const { error: updErr } = await supabaseAdmin
        .from("ca_document_requests")
        .update({
          last_chased_at: nowIso,
          chaser_count: (r.chaser_count ?? 0) + 1,
          updated_at: nowIso,
        })
        .eq("id", r.id);
      if (updErr) {
        console.error(JSON.stringify({ fn: "ca-auto-followup", step: "bump_counter", request: r.id, error: updErr.message }));
        continue;
      }
      chasedIds.add(r.id);
      chased++;

      if (wait >= 7 && rule.escalate_to_role) {
        const { error: notifErr } = await supabaseAdmin.from("ca_notifications").insert({
          ca_firm_id: rule.ca_firm_id,
          business_id: r.business_id,
          type: "escalation",
          severity: "critical",
          title: `Escalated: ${client?.client_name ?? "Client"} has not submitted ${docList} for ${r.period ?? "the current period"} — ${od} days overdue`,
          message: `Rule "${rule.rule_name}" escalated this request to ${rule.escalate_to_role}. Automatic chases have not produced the documents.`,
          is_read: false,
          is_demo: false,
          metadata: {
            document_request_id: r.id,
            rule_id: rule.id,
            escalate_to_role: rule.escalate_to_role,
            days_overdue: od,
          },
        } as never);
        if (notifErr) {
          console.error(JSON.stringify({ fn: "ca-auto-followup", step: "escalate", request: r.id, error: notifErr.message }));
        } else {
          escalated++;
        }
      }
    }
  }

  console.log(JSON.stringify({ fn: "ca-auto-followup", rules: rules.length, processed, chased, escalated }));

  return new Response(JSON.stringify({ processed, chased, escalated }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/ca-auto-followup")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
