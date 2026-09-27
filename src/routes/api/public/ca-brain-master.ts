/**
 * CA Learning Brain — master orchestrator (cron only, secret gated).
 *
 * Runs the five learning modules in sequence against the same firm scope,
 * then runs a final privacy audit over everything written this run. Any firm
 * or client row that fails the audit is reverted to a safe empty state and
 * logged to ca_audit_events rather than left corrupted.
 */
import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request): Promise<Response> {
  const brain = await import("@/lib/caBrain.server");
  if (!brain.cronAuthorized(request)) return brain.unauthorized();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startedAt = Date.now();
  const firms = await brain.loadFirms(supabaseAdmin);

  const ocr_result = await brain.learnOcr(supabaseAdmin, firms);
  const recon_result = await brain.learnRecon(supabaseAdmin, firms);
  const deduction_result = await brain.learnDeductions(supabaseAdmin, firms);
  const chaser_result = await brain.learnChaser(supabaseAdmin, firms);
  const filing_result = await brain.learnFiling(supabaseAdmin, firms);

  // ---- Final privacy audit over persisted rows -------------------------
  const loose = supabaseAdmin as unknown as { from: (t: string) => any };
  let privacy_violations = 0;

  for (const firm of firms) {
    const { data: firmRow } = await loose
      .from("ca_firm_intelligence")
      .select("confidence_overrides, provision_weights")
      .eq("ca_firm_id", firm.id)
      .maybeSingle();

    if (firmRow) {
      const problems = brain.auditFirmPayload(firmRow);
      if (problems.length) {
        privacy_violations += 1;
        await loose.from("ca_audit_events").insert({
          ca_firm_id: firm.id,
          entity_type: "ca_brain",
          action: "brain_privacy_audit_failed",
          detail: { scope: "firm", problems },
        });
        await loose
          .from("ca_firm_intelligence")
          .update({ confidence_overrides: {}, provision_weights: {} })
          .eq("ca_firm_id", firm.id);
      }
    }

    const { data: clientRows } = await loose
      .from("ca_client_intelligence")
      .select("business_id, match_preferences, avg_response_days, avg_days_before_due, filing_risk_score, best_chase_day, preferred_channel, typical_docs_late")
      .eq("ca_firm_id", firm.id);

    for (const row of clientRows ?? []) {
      const problems = brain.auditClientPayload(row);
      if (!problems.length) continue;
      privacy_violations += 1;
      await loose.from("ca_audit_events").insert({
        ca_firm_id: firm.id,
        business_id: row.business_id,
        entity_type: "ca_brain",
        action: "brain_privacy_audit_failed",
        detail: { scope: "client", problems },
      });
      await loose
        .from("ca_client_intelligence")
        .update({
          match_preferences: {},
          avg_response_days: null,
          preferred_channel: null,
          best_chase_day: null,
          typical_docs_late: [],
        })
        .eq("ca_firm_id", firm.id)
        .eq("business_id", row.business_id);
    }
  }

  const nowIso = new Date().toISOString();
  for (const firm of firms) {
    await loose.from("ca_firms").update({ brain_last_run_at: nowIso }).eq("id", firm.id);
  }

  const signals_consumed =
    (ocr_result.signals_used ?? 0) +
    (recon_result.signals_used ?? 0) +
    (chaser_result.signals_used ?? 0) +
    (filing_result.signals_used ?? 0);

  const payload = {
    ocr_result,
    recon_result,
    deduction_result,
    chaser_result,
    filing_result,
    signals_consumed,
    total_firms_updated: firms.length,
    privacy_violations,
    duration_ms: Date.now() - startedAt,
  };
  console.log(JSON.stringify({ fn: "ca-brain-master", ...payload }));
  return brain.ok(payload);
}

export const Route = createFileRoute("/api/public/ca-brain-master")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
