/**
 * The FynHelp Tally agent talks to this one endpoint, outbound over HTTPS.
 *   POST { kind: "pair", code, label, agentVersion?, tallyVersion? }  → { token }
 *   POST { kind: "companies", companies }                             (Bearer token)
 *   POST { kind: "snapshot", company, fyStart, asOn, groups, ledgers } (Bearer token)
 * Read-only: nothing here ever reaches back into the client's Tally.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ingestPayload } from "@/lib/practice/tally/payload";

const MAX_BYTES = 8 * 1024 * 1024;

const pairPayload = z.object({
  kind: z.literal("pair"),
  code: z.string().min(8).max(40),
  label: z.string().trim().max(80).default("Windows PC"),
  agentVersion: z.string().max(40).optional(),
  tallyVersion: z.string().max(80).optional(),
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/integrations/tally/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES) return reply({ ok: false, error: "That upload is too large." }, 413);
        let raw: unknown;
        try {
          const text = await request.text();
          if (text.length > MAX_BYTES) return reply({ ok: false, error: "That upload is too large." }, 413);
          raw = JSON.parse(text);
        } catch {
          return reply({ ok: false, error: "The request was not valid JSON." }, 400);
        }

        const { adminDb } = await import("@/lib/practice/db.server");
        const tally = await import("@/lib/practice/tally.server");
        const db = await adminDb();
        try {
          if ((raw as { kind?: string })?.kind === "pair") {
            const p = pairPayload.safeParse(raw);
            if (!p.success) return reply({ ok: false, error: "The pairing request was incomplete." }, 400);
            const r = await tally.redeemPairing(db, p.data.code, p.data);
            return reply({ ok: true, token: r.token });
          }
          const agent = await tally.authAgent(db, request.headers.get("authorization"));
          const p = ingestPayload.safeParse(raw);
          if (!p.success) return reply({ ok: false, error: `The data was not in the expected shape: ${p.error.issues[0]?.path.join(".") || "body"} ${p.error.issues[0]?.message ?? ""}`.trim() }, 400);
          if (p.data.kind === "companies") return reply({ ok: true, ...(await tally.ingestCompanies(db, agent, p.data)) });
          return reply({ ok: true, ...(await tally.ingestSnapshot(db, agent, p.data)) });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          const status = err.code === "unauthorised" ? 401 : err.code === "bad_code" || err.code === "bad_period" ? 400 : 500;
          if (status === 500) console.error("[tally] agent request failed:", err.message);
          return reply({ ok: false, error: status === 500 ? "FynHelp could not save that. The agent will retry." : err.message }, status);
        }
      },
    },
  },
});
