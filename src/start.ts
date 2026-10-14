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

// One host for search engines: fynhelp.com → https://www.fynhelp.com (www is the
// host already indexed and named in every canonical tag). Removed pages answer
// 410 Gone so they drop out of the index quickly.
const GONE = new Set(["/blog/budgetvsforecast", "/blog/ca-vs-cfo-for-indian-sme", "/blog/5-signs-you-need-ai-cfo"]);
const hostMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  const host = (request.headers.get("x-forwarded-host") ?? url.host).toLowerCase();
  if (host === "fynhelp.com") {
    return new Response(null, { status: 301, headers: { location: `https://www.fynhelp.com${url.pathname}${url.search}`, "cache-control": "public, max-age=86400" } });
  }
  if (GONE.has(url.pathname.replace(/\/$/, ""))) {
    return new Response(
      '<!doctype html><meta name="robots" content="noindex"><title>Gone — FynHelp</title><p style="font-family:system-ui;padding:40px">This article was removed. <a href="/blog">Read the FynHelp blog</a>.</p>',
      { status: 410, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } },
    );
  }
  return next();
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
  requestMiddleware: [errorMiddleware, hostMiddleware, adminNetworkMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
