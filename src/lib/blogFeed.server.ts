import { fetchPublishedPosts, listExcerpt } from "@/lib/blog";
import { absoluteUrl } from "@/lib/seo";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 for the blog: the 30 newest published articles with their title, link, date, category and summary. */
export async function buildBlogFeed(): Promise<string> {
  const posts = (await fetchPublishedPosts()).slice(0, 30);
  const items = posts
    .map((p) => {
      const url = absoluteUrl(`/blog/${p.slug}`);
      return `    <item><title>${esc(p.title)}</title><link>${esc(url)}</link><guid isPermaLink="true">${esc(url)}</guid>${p.published_at ? `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : ""}${p.category ? `<category>${esc(p.category)}</category>` : ""}<description>${esc(listExcerpt(p))}</description></item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>The FynHelp blog</title>\n    <link>${esc(absoluteUrl("/blog"))}</link>\n    <atom:link href="${esc(absoluteUrl("/blog/rss.xml"))}" rel="self" type="application/rss+xml" />\n    <description>Practical guides for CA firms in India on month-end close, bank reconciliation, client MIS and GST.</description>\n    <language>en-IN</language>\n${items}\n  </channel>\n</rss>\n`;
}
