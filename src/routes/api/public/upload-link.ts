/**
 * Upload-link API for the no-login page /u/<token>.
 *
 * GET  ?token=...                 who is asking and for what (nothing else about the firm)
 * POST multipart: token + file    one file; every check (token, expiry, size, type, limit) happens here
 *
 * Failed lookups and refusals look the same whatever the reason, so the endpoint cannot be used to
 * probe which links exist.
 */
import { createFileRoute } from "@tanstack/react-router";
import { MAX_FILE_BYTES } from "@/lib/practice/uploadLinks.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/upload-link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { adminDb } = await import("@/lib/practice/db.server");
        const { linkInfo } = await import("@/lib/practice/uploadLinks.server");
        return json(await linkInfo(await adminDb(), token));
      },
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > MAX_FILE_BYTES + 512 * 1024) return json({ ok: false, reason: "size", message: "That file is larger than 15 MB. Please send a smaller or compressed copy." }, 413);
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ ok: false, reason: "failed", message: "We could not read that upload. Please try again." }, 400);
        }
        const token = String(form.get("token") ?? "");
        const file = form.get("file");
        if (!(file instanceof File)) return json({ ok: false, reason: "empty", message: "Choose a file first." }, 400);
        const { adminDb } = await import("@/lib/practice/db.server");
        const { acceptUpload } = await import("@/lib/practice/uploadLinks.server");
        const result = await acceptUpload(await adminDb(), token, {
          name: file.name,
          mime: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
        return json(result, result.ok ? 200 : 400);
      },
    },
  },
});
