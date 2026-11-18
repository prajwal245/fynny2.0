/**
 * Tally connector pairing. The connector sends the code a person got in FynHelp and receives its token once. Public by design (the
 * connector has nothing yet), so it is limited per caller address, and a code works once, for 15 minutes.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/tally-pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 4_000) return json({ error: "Payload too large" }, 413);
        let body: { code?: string; host_name?: string; agent_version?: string } = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
        const { limitRequest, POLICIES } = await import("@/lib/rateLimit.server");
        const limited = await limitRequest(POLICIES.connectorPair, ip, "Too many pairing attempts. Wait a few minutes and try again.");
        if (limited) return limited;
        const { adminDb } = await import("@/lib/practice/db.server");
        const t = await import("@/lib/practice/tallyConnector.server");
        const res = await t.redeemPairing(await adminDb(), String(body.code ?? ""), body.host_name, body.agent_version);
        return res.ok ? json({ token: res.token, name: res.name }) : json({ error: res.error }, res.status);
      },
    },
  },
});
