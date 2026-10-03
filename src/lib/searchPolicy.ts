/**
 * Which URLs search engines may index, and the one URL shape per page.
 * Used by the server entry (src/server.ts) for every request.
 */

// The one host that should appear in search results; everything else
// (Vercel preview and project URLs) answers with noindex so it never competes.
const SITE_HOST = new URL(
  (process.env.VITE_SITE_URL || process.env.SITE_URL || "https://www.fynhelp.com").replace(/\/+$/, ""),
).host;
const INDEXABLE_HOSTS = new Set([SITE_HOST, SITE_HOST.replace(/^www\./, "")]);

// App, account and admin areas: never in search results.
const PRIVATE_PREFIXES = [
  "/v2", "/dashboard", "/admin", "/intern", "/blog-admin", "/ca", "/shared",
  "/login", "/signup", "/onboarding", "/reset-password", "/api", "/waitlist", "/demo",
];

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** The X-Robots-Tag value for a response, or null when the page may be indexed. */
export function robotsHeaderFor(host: string, path: string): string | null {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return isPrivatePath(path) || !INDEXABLE_HOSTS.has(h) ? "noindex, nofollow" : null;
}

/** One URL per page: no trailing slash (except "/"). 308 so search engines keep only one. */
export function normalizeUrl(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return new Response(null, { status: 308, headers: { location: path + url.search } });
  }
  return null;
}
