/**
 * CA Learning Brain — filing risk learning (client-scoped, cron only).
 * Stores a risk band and average days-before-due. No penalties or amounts.
 */
import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request): Promise<Response> {
  const brain = await import("@/lib/caBrain.server");
  if (!brain.cronAuthorized(request)) return brain.unauthorized();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const firms = await brain.loadFirms(supabaseAdmin);
  const result = await brain.learnFiling(supabaseAdmin, firms);
  console.log(JSON.stringify({ fn: "ca-brain-filing-learning", ...result }));
  return brain.ok(result);
}

export const Route = createFileRoute("/api/public/ca-brain-filing-learning")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
