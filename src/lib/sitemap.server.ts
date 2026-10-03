/**
 * The pages search engines should index, and the blog posts that are
 * published. Anything noindexed (app, sign-in, resources, community) is
 * deliberately left out.
 */
import { SITE_URL, absoluteUrl } from "./seo";

export const INDEXABLE_PAGES: { path: string; changefreq: "weekly" | "monthly" | "yearly"; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pipeline", changefreq: "monthly", priority: "0.9" },
  { path: "/agents/extract", changefreq: "monthly", priority: "0.8" },
  { path: "/agents/recon", changefreq: "monthly", priority: "0.8" },
  { path: "/agents/narrate", changefreq: "monthly", priority: "0.8" },
  { path: "/agents/chaser", changefreq: "monthly", priority: "0.8" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/ca-firms", changefreq: "monthly", priority: "0.8" },
  { path: "/use-cases", changefreq: "monthly", priority: "0.7" },
  { path: "/security", changefreq: "monthly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "yearly", priority: "0.5" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
  { path: "/terms", changefreq: "yearly", priority: "0.2" },
];

export type PublishedPost = { slug: string; updated_at: string | null; published_at: string | null };

function supabaseRest(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

/** Published posts, newest first. A database hiccup returns [] rather than breaking the sitemap. */
export async function publishedPosts(): Promise<PublishedPost[]> {
  const sb = supabaseRest();
  if (!sb) return [];
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/blog_posts?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc&limit=1000`,
      { headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` } },
    );
    if (!res.ok) return [];
    return ((await res.json()) as PublishedPost[]).filter((p) => p.slug && /^[a-z0-9-]+$/i.test(p.slug));
  } catch {
    return [];
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const day = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function buildSitemap(): Promise<string> {
  const posts = await publishedPosts();
  const newestPost = day(posts[0]?.updated_at ?? posts[0]?.published_at);
  const rows = [
    ...INDEXABLE_PAGES.map((p) => {
      const lastmod = p.path === "/blog" ? newestPost : null;
      return `  <url><loc>${esc(absoluteUrl(p.path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`;
    }),
    ...posts.map((p) => {
      const lastmod = day(p.updated_at ?? p.published_at);
      return `  <url><loc>${esc(`${SITE_URL}/blog/${p.slug}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>monthly</changefreq><priority>0.6</priority></url>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}
