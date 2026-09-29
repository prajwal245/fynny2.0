/**
 * CA Learning Brain — deduction provision weights (firm-scoped, cron only).
 * Stores relevance ratios per provision + entity type. No client data.
 */
import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request): Promise<Response> {
  const brain = await import("@/lib/caBrain.server");
  if (!brain.cronAuthorized(request)) return brain.unauthorized();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const firms = await brain.loadFirms(supabaseAdmin);
  const result = await brain.learnDeductions(supabaseAdmin, firms);
  console.log(JSON.stringify({ fn: "ca-brain-deduction-learning", ...result }));
  return brain.ok(result);
}

export const Route = createFileRoute("/api/public/ca-brain-deduction-learning")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
