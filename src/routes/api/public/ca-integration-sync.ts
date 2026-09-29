/**
 * Scheduled integration sync (Data & Integration OS).
 *
 * Pulls every connection where `integrations.auto_sync_enabled` is true and
 * the configured interval has elapsed, using the same routines as the manual
 * "Sync now" buttons. Each run opens/closes a `ca_sync_jobs` row and writes a
 * `ca_audit_events` entry, so scheduled pulls are as traceable as manual ones.
 *
 * Secret-gated with the CA cron secret (`x-cron-secret` header or
 * `Authorization: Bearer <secret>`). No PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";

const DAY = 86_400_000;
const SUPPORTED = ["zoho_books", "razorpay"] as const;

async function run(request: Request): Promise<Response> {
  const accepted = [process.env["CA_CRON_SECRET"], process.env["CA_INTEGRATION_SYNC_SECRET"]].filter(
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
  const helpers = await import("@/lib/caSync.server");
  const admin = supabaseAdmin as never as Parameters<typeof helpers.runRazorpaySync>[0];
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: connections, error } = await supabaseAdmin
    .from("integrations")
    .select("organization_id, provider, auto_sync_frequency, last_auto_sync_at")
    .eq("auto_sync_enabled", true)
    .in("provider", SUPPORTED as unknown as string[])
    .limit(500);

  if (error) {
    console.error(JSON.stringify({ fn: "ca-integration-sync", step: "load_connections", error: error.message }));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let records = 0;

  for (const c of connections ?? []) {
    const businessId = String(c.organization_id ?? "");
    const provider = String(c.provider);
    if (!businessId) continue;

    const intervalDays = c.auto_sync_frequency === "weekly" ? 7 : 1;
    const last = c.last_auto_sync_at ? new Date(c.last_auto_sync_at as string).getTime() : 0;
    if (last && now - last < intervalDays * DAY) continue;

    // Only sync businesses a CA firm actively manages — the firm owns the job trail.
    const { data: access } = await supabaseAdmin
      .from("ca_client_access")
      .select("ca_firm_id")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const firmId = (access?.ca_firm_id as string | undefined) ?? null;
    if (!firmId) continue;

    attempted++;
    try {
      const result =
        provider === "zoho_books"
          ? await helpers.runZohoBooksSync(admin, { firmId, businessId, actorId: null })
          : await helpers.runRazorpaySync(admin, { firmId, businessId, actorId: null });
      if (result.success) {
        succeeded++;
        records += result.records_synced;
      } else {
        failed++;
        console.error(JSON.stringify({ fn: "ca-integration-sync", provider, errors: result.errors }));
      }
    } catch (e) {
      failed++;
      console.error(JSON.stringify({ fn: "ca-integration-sync", provider, error: (e as Error).message }));
    }

    await supabaseAdmin
      .from("integrations")
      .update({ last_auto_sync_at: nowIso })
      .eq("organization_id", businessId)
      .eq("provider", provider);
  }

  console.log(JSON.stringify({ fn: "ca-integration-sync", attempted, succeeded, failed, records }));

  return new Response(JSON.stringify({ attempted, succeeded, failed, records }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/ca-integration-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
