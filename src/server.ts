import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

import { normalizeUrl, robotsHeaderFor } from "./lib/searchPolicy";

/**
 * Only the services the site really uses may load scripts, frames or receive
 * requests: Supabase, Google Analytics, PostHog (both only after consent),
 * Razorpay Checkout, Calendly, YouTube embeds in articles, Google Fonts /
 * Fontshare, and the breached-password check.
 */
function contentSecurityPolicy(): string {
  const supa = (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").replace(/\/$/, "");
  const supaWs = supa.replace(/^http/, "ws");
  const analytics = "https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net";
  const posthog = "https://us.i.posthog.com https://us-assets.i.posthog.com";
  const razorpay = "https://checkout.razorpay.com https://api.razorpay.com https://lumberjack.razorpay.com";
  const calendly = "https://calendly.com https://assets.calendly.com";
  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(supa) ? " ws://127.0.0.1:* ws://localhost:*" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${analytics} ${posthog} ${razorpay} ${calendly}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com https://assets.calendly.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com https://api.fontshare.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supa} ${supaWs} ${analytics} ${posthog} ${razorpay} https://api.pwnedpasswords.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io${local}`.replace(/\s+/g, " "),
    `frame-src 'self' ${razorpay} ${calendly} https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com`,
    "worker-src 'self' blob:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.razorpay.com",
    "frame-ancestors 'self'",
    ...(local ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function withSearchHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host).split(",")[0].trim();
  const headers = new Headers(response.headers);
  const robots = robotsHeaderFor(host, url.pathname);
  if (robots) headers.set("x-robots-tag", robots);
  if ((headers.get("content-type") ?? "").includes("text/html")) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("x-frame-options", "SAMEORIGIN");
    headers.set("content-security-policy", contentSecurityPolicy());
    headers.set("permissions-policy", 'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")');
    headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const redirect = normalizeUrl(request);
      if (redirect) return redirect;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSearchHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
