/**
 * Zoho Books sends people back here after consent (register this exact URL in
 * the Zoho API Console). The code is swapped for tokens on the server, then
 * the person returns to Settings with the outcome.
 */
import { createFileRoute } from "@tanstack/react-router";

const back = (request: Request, outcome: string, message?: string) => {
  const url = new URL("/app/settings", request.url);
  url.searchParams.set("zoho", outcome);
  if (message) url.searchParams.set("zoho_msg", message.slice(0, 200));
  return new Response(null, {
    status: 302,
    headers: { location: url.pathname + url.search, "set-cookie": "fh_zoho_nonce=; Path=/api/integrations/zoho; Max-Age=0; HttpOnly; SameSite=Lax" },
  });
};

export const Route = createFileRoute("/api/integrations/zoho/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        if (q.get("error")) return back(request, "denied", "Zoho sign-in was cancelled.");
        const code = q.get("code");
        const state = q.get("state");
        if (!code || !state) return back(request, "error", "Zoho did not send a sign-in code.");
        const nonce = /(?:^|;\s*)fh_zoho_nonce=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
        try {
          const zoho = await import("@/lib/practice/zoho.server");
          const { firmId, userId, write } = await zoho.verifyState(state, nonce);
          const { adminDb, firmContext, canSignOff } = await import("@/lib/practice/db.server");
          const db = await adminDb();
          // The person who started must still be a partner of that firm.
          const ctx = await firmContext(db, userId);
          if (ctx.firmId !== firmId || !canSignOff(ctx)) return back(request, "error", "Only a partner of the firm can connect Zoho Books.");
          await zoho.completeConnect(db, firmId, userId, code, q.get("accounts-server"), write);
          return back(request, write ? "write_granted" : "connected");
        } catch (e) {
          console.error("[zoho] callback failed:", (e as Error).message);
          return back(request, "error", (e as Error).message || "Zoho Books could not be connected.");
        }
      },
    },
  },
});
