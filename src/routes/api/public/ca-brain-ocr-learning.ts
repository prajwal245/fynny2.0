/**
 * CA Learning Brain — OCR confidence learning (firm-scoped, cron only).
 * Reads statistical columns only; extracted document content is never touched.
 */
import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request): Promise<Response> {
  const brain = await import("@/lib/caBrain.server");
  if (!brain.cronAuthorized(request)) return brain.unauthorized();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const firms = await brain.loadFirms(supabaseAdmin);
  const result = await brain.learnOcr(supabaseAdmin, firms);
  console.log(JSON.stringify({ fn: "ca-brain-ocr-learning", ...result }));
  return brain.ok(result);
}

export const Route = createFileRoute("/api/public/ca-brain-ocr-learning")({
  server: { handlers: { POST: ({ request }) => run(request), GET: ({ request }) => run(request) } },
});
