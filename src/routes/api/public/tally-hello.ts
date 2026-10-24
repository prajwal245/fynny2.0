/**
 * Tally connector check-in. The connector sends its secret token as a Bearer header, the
 * companies open in Tally and its version; it gets back which companies are linked to a
 * client, which months to send, and whether a person asked for a sync now.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/tally-hello")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 200_000) return json({ error: "Payload too large" }, 413);
        const { adminDb } = await import("@/lib/practice/db.server");
        const t = await import("@/lib/practice/tallyConnector.server");
        const db = await adminDb();
        const connector = await t.authConnector(db, request.headers.get("authorization"));
        if (!connector) return json({ error: "Unknown or revoked connector token" }, 401);
        let body: Record<string, unknown> = {};
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        return json(await t.hello(db, connector, body));
      },
    },
  },
});
