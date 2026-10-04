/**
 * Scheduled Gmail check (Vercel cron, or any scheduler with the cron secret).
 * The work itself lives in src/lib/practice/gmailIntake.server.ts and runs as
 * the first step of the practice tick, followed by Extract on what arrived.
 *
 * Secret gated (`x-cron-secret` header or `Authorization: Bearer <secret>`).
 * Returns counts only, never message content.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function authorized(request: Request): boolean {
  const accepted = [process.env["CA_CRON_SECRET"], process.env["CRON_SECRET"]].filter((s): s is string => Boolean(s));
  const provided = request.headers.get("x-cron-secret") ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided || !accepted.length) return false;
  let ok = false;
  for (const s of accepted) {
    const a = Buffer.from(s);
    const b = Buffer.from(provided);
    if (a.length === b.length && timingSafeEqual(a, b)) ok = true;
  }
  return ok;
}

async function run(request: Request): Promise<Response> {
  if (!authorized(request))
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  const { practiceTick } = await import("@/lib/practice/cron.server");
  const result = await practiceTick({ gmailBudgetMs: 30_000 });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/public/ca-poll-gmail")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
