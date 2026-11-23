/**
 * Unsiloed webhook: a parse job that was still running when the upload returned has finished. The signature is checked first; nothing
 * is read from an unsigned request. The result is stored on the document and the document is read again, where the fallback uses it
 * without calling the vendor a second time. Set UNSILOED_WEBHOOK_SECRET, and UNSILOED_WEBHOOK_URL to https://<domain>/api/webhooks/unsiloed.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/webhooks/unsiloed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readUnsilodConfig } =
          await import("@/lib/practice/extract/fallback/config");
        const cfg = readUnsilodConfig();
        if (!cfg.enabled || !cfg.webhookSecret)
          return json({ error: "Not configured" }, 503);
        const raw = await request.text();
        if (raw.length > 2_000_000)
          return json({ error: "Payload too large" }, 413);
        const { signatureValid, readWebhook } =
          await import("@/lib/practice/extract/fallback/webhook");
        if (
          !(await signatureValid(
            raw,
            request.headers.get(cfg.signatureHeader),
            cfg.webhookSecret,
          ))
        )
          return json({ error: "Bad signature" }, 401);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const { jobId, finished } = readWebhook(body);
        if (!jobId) return json({ error: "No job id" }, 400);
        if (!finished) return json({ ok: true, ignored: "not finished" });
        try {
          const { adminDb } = await import("@/lib/practice/db.server");
          const db = await adminDb();
          const { data } = await db
            .from("ca_document_extractions")
            .select("id, extracted")
            .eq("extracted->parser_fallback_pending->>job_id", jobId)
            .limit(1);
          const doc = (data ?? [])[0] as
            | { id: string; extracted: Record<string, unknown> | null }
            | undefined;
          if (!doc) return json({ ok: true, ignored: "no matching document" });
          const pending = (doc.extracted?.["parser_fallback_pending"] ??
            null) as { tier?: "fast" | "lite" } | null;
          const { createHttpClient } =
            await import("@/lib/practice/extract/fallback/client");
          const res = await createHttpClient(cfg).fetchJob(jobId);
          if (!res.markdown)
            return json({ ok: true, ignored: "no result yet" });
          const extracted = {
            ...(doc.extracted ?? {}),
            parser_fallback_result: {
              tier: pending?.tier ?? "fast",
              markdown: res.markdown,
              credits_used: res.creditsUsed,
              pages: res.pages,
              job_id: jobId,
            },
          };
          await db
            .from("ca_document_extractions")
            .update({ extracted })
            .eq("id", doc.id);
          const { processExtraction } =
            await import("@/lib/practice/documents.server");
          await processExtraction(db, doc.id, { trigger: "retry" });
          return json({ ok: true });
        } catch (e) {
          // Never ask the vendor to retry forever for our own failure; the document keeps its primary result.
          console.error(`[unsiloed-webhook] ${(e as Error).message}`);
          return json({ ok: false }, 200);
        }
      },
    },
  },
});
