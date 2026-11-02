/**
 * Press data for the /press page and the home page "Featured in" strip.
 * Read from the press_items table (added in Admin, or automatically), with the launch coverage kept in
 * code as a fallback so the page is never empty if the database cannot be reached.
 */
import { supabase } from "@/integrations/supabase/client";
import { PRESS as STATIC, pressLogo } from "@/content/press";
import { SITE_URL } from "@/lib/seo";

export type PressKind = "news" | "release";

export interface PressEntry {
  id: string;
  kind: PressKind;
  outlet: string;
  headline: string;
  summary: string | null;
  /** https://... for an outlet, or a path on this site. */
  url: string;
  /** YYYY-MM-DD */
  publishedOn: string;
  logo: string | null;
  /** The logo file is white-on-dark: show it black. */
  logoInvert: boolean;
  image: string | null;
}

export const isExternal = (url: string) => /^https?:\/\//i.test(url);

interface Row {
  id: string;
  kind: string;
  outlet: string;
  headline: string;
  summary: string | null;
  url: string;
  published_on: string;
  logo_url: string | null;
  logo_invert: boolean | null;
  image_url: string | null;
}

const fromRow = (r: Row): PressEntry => ({
  id: r.id,
  kind: r.kind === "release" ? "release" : "news",
  outlet: r.outlet,
  headline: r.headline,
  summary: r.summary,
  url: r.url,
  publishedOn: String(r.published_on).slice(0, 10),
  logo: r.logo_url,
  logoInvert: Boolean(r.logo_invert),
  image: r.image_url,
});

const fromStatic = (): PressEntry[] =>
  STATIC.map((p) => ({
    id: `static:${p.id}`,
    kind: "news" as const,
    outlet: p.outlet,
    headline: p.headline,
    summary: null,
    url: p.url,
    publishedOn: "2026-11-02",
    logo: pressLogo(p.id) ?? null,
    logoInvert: Boolean(p.lightLogo),
    image: null,
  }));

/** Newest first. Never throws: a database problem returns the coverage kept in code. */
export async function fetchPress(): Promise<PressEntry[]> {
  try {
    // The table comes with a database change, so it is not in the generated types yet.
    const sb = supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: Row[] | null; error: unknown }> } } } };
    const { data, error } = await sb
      .from("press_items")
      .select("id, kind, outlet, headline, summary, url, published_on, logo_url, logo_invert, image_url")
      .eq("status", "published")
      .order("published_on", { ascending: false });
    if (error || !data?.length) return fromStatic();
    return data.map(fromRow);
  } catch {
    return fromStatic();
  }
}

/** Outlets with a logo, for the home page strip. */
export const withLogos = (items: PressEntry[]) => items.filter((p) => p.logo && p.kind === "news");

export const absoluteLink = (url: string) => (isExternal(url) ? url : `${SITE_URL}${url}`);

/** ItemList of NewsArticle, so search engines and AI answers can read the coverage. */
export function pressLd(items: PressEntry[], limit = 50): Record<string, unknown> {
  const list = items.slice(0, limit);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "FynHelp in the news",
    numberOfItems: list.length,
    itemListElement: list.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "NewsArticle",
        headline: p.headline,
        url: absoluteLink(p.url),
        datePublished: p.publishedOn,
        ...(p.image ? { image: p.image } : {}),
        ...(p.summary ? { description: p.summary } : {}),
        publisher: { "@type": "Organization", name: p.outlet },
        about: { "@type": "Organization", name: "FynHelp", url: SITE_URL },
      },
    })),
  };
}
