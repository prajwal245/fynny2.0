/**
 * Automatic press add. POST JSON { url, outlet?, headline?, summary?, published_on?, kind?, logo_url? }
 * with the key in the `x-press-key` header (or `Authorization: Bearer <key>`); the key is PRESS_INGEST_KEY.
 * Only the link is required: the headline, outlet, date and image are read from the article page.
 * Point Zapier, Make or a Google Alerts workflow at it and new coverage appears on /press by itself.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/press-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { keyMatches, ingestPress, validPressUrl } = await import("@/lib/press.server");
        const expected = process.env["PRESS_INGEST_KEY"] ?? "";
        const given = request.headers.get("x-press-key") ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!expected || !keyMatches(given, expected)) return json({ error: "Unauthorized" }, 401);
        let body: Record<string, string> = {};
        try {
          body = (await request.json()) as Record<string, string>;
        } catch {
          return json({ error: "Send JSON." }, 400);
        }
        if (typeof body.url !== "string" || !validPressUrl(body.url)) return json({ error: "A valid https url is required." }, 400);
        try {
          const { adminDb } = await import("@/lib/practice/db.server");
          const r = await ingestPress(await adminDb(), body as never);
          return json(r, r.created ? 201 : 200);
        } catch (e) {
          return json({ error: (e as Error).message }, 422);
        }
      },
    },
  },
});
