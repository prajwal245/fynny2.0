/**
 * Tally connector upload: one company's Day Book (Tally XML) for one month.
 * POST /api/public/tally-ledger?company=<name>&month=YYYY-MM with the XML as the body.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/tally-ledger")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t = await import("@/lib/practice/tallyConnector.server");
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > t.MAX_LEDGER_BYTES) return json({ error: "Files larger than 25 MB cannot be processed." }, 413);
        const { adminDb } = await import("@/lib/practice/db.server");
        const db = await adminDb();
        const connector = await t.authConnector(db, request.headers.get("authorization"));
        if (!connector) return json({ error: "Unknown or revoked connector token" }, 401);
        const url = new URL(request.url);
        const company = (url.searchParams.get("company") ?? "").trim();
        const month = url.searchParams.get("month") ?? "";
        if (!company) return json({ error: "company is required" }, 400);
        try {
          const bytes = new Uint8Array(await request.arrayBuffer());
          const result = await t.ingestLedger(db, connector, company, month, bytes);
          return json(result, result.status === "paused" ? 402 : 200);
        } catch (e) {
          const code = (e as { code?: string }).code;
          const status = code === "billing_paused" || code === "plan_limit" ? 402 : code === "too_large" ? 413 : 422;
          return json({ error: (e as Error).message }, status);
        }
      },
    },
  },
});
