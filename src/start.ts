import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// The admin panel is reachable only from ADMIN_IP_ALLOWLIST when it is set.
// Admin server functions check the same list (and much more) on every call.
const adminNetworkMiddleware = createMiddleware().server(async ({ next, request }) => {
  const path = new URL(request.url).pathname;
  if (path === "/admin" || path.startsWith("/admin/")) {
    const { clientIp, networkAllowed } = await import("./lib/admin/security.server");
    if (!networkAllowed(clientIp(request)))
      return new Response("<!doctype html><title>Not available</title><p style=\"font-family:system-ui;padding:40px\">The FynHelp admin panel is not available from this network.</p>", {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
  }
  return next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, adminNetworkMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
