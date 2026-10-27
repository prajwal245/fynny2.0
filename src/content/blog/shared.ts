/**
 * Articles written in the codebase rather than the database, so they publish with a deploy and need no SQL.
 * They are merged with the database posts in `src/lib/blog.ts` and appear in the sitemap automatically.
 */
export interface StaticPost {
  slug: string;
  title: string;
  excerpt: string;
  seo_title: string;
  seo_description: string;
  category: string;
  tags: string[];
  reading_time_minutes: number;
  /** ISO date. A post is shown from this day. */
  published_at: string;
  content: string;
}

/** The closing call to action every article ends with: the launch page, which also applies the 30-day offer. */
export const cta = (line: string) =>
  `<h2>Try it on your own client</h2><p>${line} FynHelp reconciles bank to Tally or Zoho, chases missing documents and drafts a source-traceable MIS that a partner signs off. <a href="/launch">Start free for 30 days</a> or <a href="https://calendly.com/nidhi-fynhelp/nidhi-meetings">book a 20-minute demo</a>.</p>`;

/** A question and its answer in the form the article page turns into FAQ markup for search engines. */
export const faq = (items: [string, string][]) =>
  `<h2>Frequently asked questions</h2>${items.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join("")}`;

export const table = (head: string[], rows: string[][]) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

export const answer = (text: string) => `<p class="answer"><strong>Short answer</strong>${text}</p>`;

export const PUBLISHED = "2026-10-27T06:30:00.000Z";
