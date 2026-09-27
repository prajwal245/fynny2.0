/**
 * Blog posts are often pasted in from an SEO writing template that carries
 * production scaffolding into the body: an "SEO Information" field table, a
 * duplicated "Blog Title" block, a table of contents, internal-linking notes
 * and fact-check notes. None of that belongs on the public article.
 *
 * These helpers strip that scaffolding at render time (and are also used for
 * the one-off content cleanup), working on raw HTML strings so they are safe
 * during SSR.
 */

const HEADING_RE = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

/** Sections removed entirely (heading + everything until the next heading). */
const DROP_SECTIONS = [
  "seo information",
  "blog title",
  "table of contents",
  "internal linking suggestions",
  "internal links",
  "fact check notes",
  "fact-check notes",
  "meta information",
  "keyword research",
];

/** Sections whose heading is dropped but whose body is kept. */
const UNWRAP_SECTIONS = ["featured snippet answer", "introduction", "intro"];

const stripTags = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** "12. Why Cash Flow Matters" -> "Why Cash Flow Matters" */
const stripNumberPrefix = (text: string) => text.replace(/^\s*\d+[.)]\s+/, "");

const normalise = (text: string) => stripNumberPrefix(stripTags(text)).toLowerCase().replace(/[:.]+$/, "").trim();

export interface CleanOptions {
  /** Post title — leading headings that repeat it are dropped. */
  title?: string;
  /** Cover image already shown in the page header — removed from the body. */
  coverImageUrl?: string | null;
}

const slugish = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function cleanArticleHtml(html: string, options: CleanOptions = {}): string {
  if (!html) return "";

  if (options.coverImageUrl) {
    const src = options.coverImageUrl.split("?")[0];
    const esc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html
      .replace(new RegExp(`<figure\\b[^>]*>(?:(?!</figure>)[\\s\\S])*?${esc}[\\s\\S]*?</figure>`, "gi"), "")
      .replace(new RegExp(`<img\\b[^>]*${esc}[^>]*>`, "gi"), "");

    // A leading image simply repeats the hero cover shown above the body.
    html = html.replace(
      /^(\s*(?:<p>\s*)?)(?:<figure\b[\s\S]*?<\/figure>|<img\b[^>]*>)(\s*(?:<\/p>)?\s*)/i,
      "",
    );
  }




  const headings: { start: number; end: number; level: number; inner: string }[] = [];
  let match: RegExpExecArray | null;
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(html)) !== null) {
    headings.push({
      start: match.index,
      end: match.index + match[0].length,
      level: Number(match[1]),
      inner: match[2],
    });
  }

  if (headings.length === 0) return html;

  let out = html.slice(0, headings[0].start);
  const postTitle = options.title ? slugish(options.title) : "";
  let seenBody = stripTags(out).length > 0;

  headings.forEach((h, i) => {
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].start : html.length;
    const body = html.slice(h.end, bodyEnd);
    const title = normalise(h.inner);

    if (DROP_SECTIONS.some((s) => title === s || title.startsWith(`${s} `))) return;

    // Leading top-level headings restate the post title — the page already has an H1.
    if (!seenBody && (h.level === 1 || (postTitle && slugish(title) === postTitle))) {
      out += body;
      if (stripTags(body).length > 0) seenBody = true;
      return;
    }
    seenBody = true;

    if (UNWRAP_SECTIONS.includes(title)) {
      out += body;
      return;
    }

    const cleanTitle = h.inner.replace(/^(\s*(?:<(?:strong|b|em|span)[^>]*>\s*)*)\s*\d+[.)]\s+/i, "$1");
    const level = h.level === 1 ? 2 : h.level;
    out += `<h${level}>${cleanTitle}</h${level}>${body}`;
  });

  return out
    .replace(/(?:\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+(<hr\s*\/?>)/gi, "$1")
    .replace(/(<hr\s*\/?>)(?:\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/gi, "$1")
    .replace(/(?:<hr\s*\/?>\s*){2,}/gi, "<hr />")
    .replace(/^(?:\s*(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>|<hr\s*\/?>)\s*)+/i, "")
    .replace(/(?:\s*(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>|<hr\s*\/?>)\s*)+$/i, "")
    .trim();
}

/** First real sentence(s) of an article, for use when a post has no excerpt. */
export function articleExcerpt(html: string, maxLength = 200, options: CleanOptions = {}): string {
  const text = stripTags(cleanArticleHtml(html, options));
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;
}
