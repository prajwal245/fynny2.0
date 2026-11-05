/**
 * Tally connector: one company's ledger names, so approved lines can only go to ledgers that exist.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/tally-ledgers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 2_000_000) return json({ error: "Payload too large" }, 413);
        const { adminDb } = await import("@/lib/practice/db.server");
        const t = await import("@/lib/practice/tallyConnector.server");
        const db = await adminDb();
        const connector = await t.authConnector(db, request.headers.get("authorization"));
        if (!connector) return json({ error: "Unknown or revoked connector token" }, 401);
        const { limitRequest, POLICIES } = await import("@/lib/rateLimit.server");
        const limited = await limitRequest(POLICIES.connector, connector.id, "This connector is sending too fast. It will retry shortly.");
        if (limited) return limited;
        let body: Record<string, unknown> = {};
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const p = await import("@/lib/practice/tallyPosting.server");
        try {
          return json(await p.ingestLedgers(db, connector, String(body.company ?? "").trim(), body.ledgers));
        } catch (e) {
          return json({ error: (e as Error).message }, 422);
        }
      },
    },
  },
});
