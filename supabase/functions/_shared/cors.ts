/**
 * Shared CORS allow-list for FynHelp edge functions.
 *
 * Browser callers are limited to our own origins. Non-browser callers (cron,
 * server-to-server) send no Origin header and are unaffected.
 */
const STATIC_ALLOWED = new Set([
  "https://fynhelp.com",
  "https://www.fynhelp.com",
  "https://fynhelp.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
]);

/** Lovable preview/sandbox origins, e.g. https://id-preview--<uuid>.lovable.app */
const ALLOWED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i,
];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED.has(origin)) return true;
  return ALLOWED_PATTERNS.some((re) => re.test(origin));
}

export function corsHeaders(req: Request, extra: Record<string, string> = {}): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = isAllowedOrigin(origin);
  return {
    // Only echo an origin we trust; unknown origins get no CORS grant at all.
    ...(allowed ? { "Access-Control-Allow-Origin": origin as string } : {}),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...extra,
  };
}

/** Standard preflight response. Returns null when the request is not OPTIONS. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Guard for state-changing calls made from a browser. */
export function rejectDisallowedOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/** Rejects oversized payloads before they are buffered into memory. */
export function rejectOversizedBody(req: Request, maxBytes = 1_000_000): Response | null {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) {
    return new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: corsHeaders(req),
    });
  }
  return null;
}
