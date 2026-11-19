/**
 * The structure of an article, worked out from its HTML so it is the same on the server (first response, what search engines and AI
 * answer engines read) and in the browser: heading anchors, the "on this page" list, a short answer to put at the top, word count.
 * Pure string work, no DOM, so it is safe during server rendering.
 */
export interface TocItem { id: string; text: string; level: 2 | 3 }

const text = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8377;|&#x20b9;/gi, "₹").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";

/** Gives every h2 and h3 an id (kept if it already has one, made unique if two headings read alike) and lists them. */
export function withHeadingIds(html: string): { html: string; toc: TocItem[] } {
  const used = new Set<string>();
  const toc: TocItem[] = [];
  const out = html.replace(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, attrs: string, inner: string) => {
    const label = text(inner);
    if (!label) return _m;
    const have = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    let id = have ?? slugify(label);
    for (let n = 2; used.has(id); n++) id = `${have ?? slugify(label)}-${n}`;
    used.add(id);
    toc.push({ id, text: label, level: Number(lvl) as 2 | 3 });
    return `<h${lvl}${have ? attrs : `${attrs} id="${id}"`}>${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

/**
 * A short, self-contained answer for the top of the page: the article's own answer box if it has one, else its excerpt, else the first
 * paragraph that reads like prose. Answer engines and featured snippets quote exactly this kind of block.
 */
export function shortAnswer(html: string, excerpt?: string | null): string {
  const box = /<(?:div|p|section|aside)\b[^>]*class\s*=\s*["'][^"']*\banswer\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|section|aside)>/i.exec(html);
  if (box) {
    const t = text(box[1]!).replace(/^(short answer|quick answer|answer|in short|tl;?dr)\s*:?\s*/i, "");
    if (t.length >= 40) return t;
  }
  if (excerpt && excerpt.trim().length >= 40) return excerpt.trim();
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = text(m[1]!);
    if (t.length >= 80 && !/^(by|updated|published)\b/i.test(t)) return t.length > 320 ? `${t.slice(0, 317).replace(/\s+\S*$/, "")}…` : t;
  }
  return "";
}

export const wordCount = (html: string) => (text(html).match(/\S+/g) ?? []).length;

/** Minutes to read at 200 words a minute, at least one. */
export const readingMinutes = (html: string) => Math.max(1, Math.round(wordCount(html) / 200));

/** Splits the body after the Nth h2 (when there are enough sections) so a call to action can sit in the middle of a long article. */
export function splitAtSection(html: string, afterH2 = 3, minH2 = 5): [string, string] {
  const marks = [...html.matchAll(/<h2\b/gi)].map((m) => m.index!);
  if (marks.length < minH2 || marks.length <= afterH2) return [html, ""];
  const at = marks[afterH2]!;
  return [html.slice(0, at), html.slice(at)];
}

/** ISO 8601 duration for schema.org timeRequired: 7 minutes is "PT7M". */
export const isoMinutes = (n: number) => `PT${Math.max(1, Math.round(n))}M`;
