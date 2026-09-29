/**
 * CA Learning Brain — recon tolerance learning (client-scoped, cron only).
 * Persists thresholds only; no amounts, vendor names or invoice numbers.
 */
import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request): Promise<Response> {
  const brain = await import("@/lib/caBrain.server");
  if (!brain.cronAuthorized(request)) return brain.unauthorized();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const firms = await brain.loadFirms(supabaseAdmin);
  const result = await brain.learnRecon(supabaseAdmin, firms);
  console.log(JSON.stringify({ fn: "ca-brain-recon-learning", ...result }));
  return brain.ok(result);
}

export const Route = createFileRoute("/api/public/ca-brain-recon-learning")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
