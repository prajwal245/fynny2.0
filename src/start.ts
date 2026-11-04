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

// Rate limits for every API action: server functions (per address, per signed-in
// user and per function) and /api routes (per address; webhooks get a higher
// ceiling because providers share addresses across many firms). Pages and
// static files are not counted. Policies live in lib/rateLimit.server.ts.
const WEBHOOK_PATHS = ["/api/public/whatsapp-webhook", "/api/public/razorpay-webhook", "/api/public/ca-invoice-payment-webhook"];
const rateLimitMiddleware = createMiddleware().server(async ({ next, request }) => {
  const path = new URL(request.url).pathname;
  const isFn = path.startsWith("/_serverFn/");
  const isApi = path.startsWith("/api/");
  if (!isFn && !isApi) return next();
  const rl = await import("./lib/rateLimit.server");
  const ip = rl.requestIp(request);
  const checks: [(typeof rl.POLICIES)[keyof typeof rl.POLICIES], string][] = [];
  if (isApi) checks.push([WEBHOOK_PATHS.includes(path) ? rl.POLICIES.webhookIp : rl.POLICIES.publicIp, `${ip}:${path}`]);
  else {
    checks.push([rl.POLICIES.sfnIp, ip]);
    // The user is read from the token only to name a bucket; the signature tail is
    // part of the name, so nobody can use up another person's allowance by guessing their id.
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const parts = token.split(".");
    if (parts.length === 3) {
      try {
        const sub = (JSON.parse(atob((parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string }).sub;
        if (sub) {
          const who = `${sub}:${(parts[2] ?? "").slice(0, 12)}`;
          checks.push([rl.POLICIES.sfnUser, who], [rl.POLICIES.sfnUserFn, `${who}:${path}`]);
        }
      } catch {
        /* not a readable token: the address limit still applies */
      }
    }
  }
  for (const [policy, subject] of checks) {
    const d = await rl.checkRateLimit(policy, subject);
    if (!d.allowed) return rl.tooManyResponse(d);
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
  requestMiddleware: [errorMiddleware, hostMiddleware, adminNetworkMiddleware, rateLimitMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
