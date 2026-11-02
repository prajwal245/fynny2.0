/**
 * Press items, server side: reading an article's details from its link, saving, and the automatic add.
 * Used by Admin, Press and by the key-protected endpoint /api/public/press-ingest.
 */
import { PracticeError } from "./practice/core";

export interface ArticleMeta {
  headline: string | null;
  outlet: string | null;
  summary: string | null;
  image: string | null;
  publishedOn: string | null;
}

/** A link we are willing to fetch: https only, no addresses or names that point inside a network. */
export function safeArticleUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new PracticeError("bad_url", "That is not a valid link.");
  }
  const host = u.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
  if (u.protocol !== "https:" || isIp || host === "localhost" || !host.includes(".") || /\.(local|internal|lan|home|corp)$/.test(host) || u.username || u.password)
    throw new PracticeError("bad_url", "Use the article's public https link.");
  return u;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8217;/g, "’").replace(/&#8211;/g, "–").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decode(c) : null;
}

/** Reads the headline, outlet, summary, image and date from an article page. Best effort: any field may be null. */
export async function readArticleMeta(rawUrl: string): Promise<ArticleMeta> {
  let url = safeArticleUrl(rawUrl);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (compatible; FynHelpPressBot/1.0; +https://www.fynhelp.com)", accept: "text/html" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = safeArticleUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new PracticeError("fetch_failed", `The site did not give the page (${res?.status ?? "no answer"}). Fill the details in by hand.`);
  // The head of the page is enough; cap what we read.
  const html = (await res.text()).slice(0, 400_000);
  const title = metaContent(html, "og:title") ?? metaContent(html, "twitter:title") ?? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1];
  const when = metaContent(html, "article:published_time") ?? metaContent(html, "datePublished") ?? metaContent(html, "date") ?? ld ?? null;
  const parsed = when && !Number.isNaN(new Date(when).getTime()) ? new Date(when).toISOString().slice(0, 10) : null;
  const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
  return {
    headline: title ? title.slice(0, 300) : null,
    outlet: metaContent(html, "og:site_name") ?? url.hostname.replace(/^(www|m|biz|business)\./, ""),
    summary: (metaContent(html, "og:description") ?? metaContent(html, "description"))?.slice(0, 400) ?? null,
    image: image && /^https:\/\//i.test(image) ? image.slice(0, 500) : null,
    publishedOn: parsed,
  };
}

export interface PressInput {
  id?: string;
  kind: "news" | "release";
  outlet: string;
  headline: string;
  summary?: string | null;
  url: string;
  publishedOn: string;
  logoUrl?: string | null;
  logoInvert?: boolean;
  imageUrl?: string | null;
  status: "published" | "hidden";
}

const clean = (v: string | null | undefined, n: number) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, n) : null;
};
export const validPressUrl = (u: string) => /^https:\/\/[^\s]+$/i.test(u) || /^\/[a-z0-9][^\s]*$/i.test(u);

function toRow(i: PressInput) {
  if (!validPressUrl(i.url.trim())) throw new PracticeError("bad_url", "The link must start with https:// (or be a path on this site, like /blog/...).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.publishedOn)) throw new PracticeError("bad_date", "Pick the publish date.");
  if (!i.outlet.trim() || !i.headline.trim()) throw new PracticeError("missing", "The outlet and headline are required.");
  return {
    kind: i.kind,
    outlet: i.outlet.trim().slice(0, 120),
    headline: i.headline.trim().slice(0, 300),
    summary: clean(i.summary, 400),
    url: i.url.trim().slice(0, 1000),
    published_on: i.publishedOn,
    logo_url: clean(i.logoUrl, 500),
    logo_invert: Boolean(i.logoInvert),
    image_url: clean(i.imageUrl, 500),
    status: i.status,
    updated_at: new Date().toISOString(),
  };
}

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function listPress(db: Db) {
  const { data, error } = await db.from("press_items").select("*").order("published_on", { ascending: false }).limit(500);
  if (error) throw new PracticeError("db_error", /press_items/.test(error.message) ? "The press table is not set up yet. Apply the latest database change." : error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function savePress(db: Db, input: PressInput, source: "admin" | "auto" = "admin") {
  const row = toRow(input);
  if (input.id) {
    const { data, error } = await db.from("press_items").update(row).eq("id", input.id).select("id, headline").maybeSingle();
    if (error) throw new PracticeError("db_error", /duplicate|unique/i.test(error.message) ? "That link is already on the page." : error.message);
    if (!data) throw new PracticeError("not_found", "Article not found.");
    return { id: data.id as string, headline: data.headline as string, created: false };
  }
  const { data, error } = await db.from("press_items").insert({ ...row, source }).select("id, headline").maybeSingle();
  if (error) throw new PracticeError("db_error", /duplicate|unique/i.test(error.message) ? "That link is already on the page." : error.message);
  return { id: data!.id as string, headline: data!.headline as string, created: true };
}

export async function deletePress(db: Db, id: string) {
  const { data } = await db.from("press_items").select("headline").eq("id", id).maybeSingle();
  const { error } = await db.from("press_items").delete().eq("id", id);
  if (error) throw new PracticeError("db_error", error.message);
  return { headline: (data?.headline as string | undefined) ?? "" };
}

/** Compares in constant time, so the key cannot be guessed from response times. */
export function keyMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * The automatic add: a link (and anything else the sender knows) in, a published press item out.
 * Missing details are read from the article page. Returns the existing item if the link is already there.
 */
export async function ingestPress(db: Db, b: { url: string; outlet?: string; headline?: string; summary?: string; published_on?: string; kind?: string; logo_url?: string }) {
  const url = b.url.trim();
  const { data: existing } = await db.from("press_items").select("id").eq("url", url).maybeSingle();
  if (existing) return { id: existing.id as string, created: false };
  let meta: ArticleMeta | null = null;
  if (!b.headline || !b.outlet || !b.published_on) {
    try {
      meta = await readArticleMeta(url);
    } catch {
      meta = null;
    }
  }
  const headline = (b.headline ?? meta?.headline ?? "").trim();
  if (!headline) throw new PracticeError("missing", "Could not find a headline. Send one with the link.");
  const r = await savePress(
    db,
    {
      kind: b.kind === "release" ? "release" : "news",
      outlet: (b.outlet ?? meta?.outlet ?? new URL(url).hostname).trim(),
      headline,
      summary: b.summary ?? meta?.summary ?? null,
      url,
      publishedOn: b.published_on && /^\d{4}-\d{2}-\d{2}/.test(b.published_on) ? b.published_on.slice(0, 10) : (meta?.publishedOn ?? new Date().toISOString().slice(0, 10)),
      logoUrl: b.logo_url ?? null,
      imageUrl: meta?.image ?? null,
      status: "published",
    },
    "auto",
  );
  return { id: r.id, created: true };
}
