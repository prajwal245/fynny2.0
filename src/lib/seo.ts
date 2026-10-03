/**
 * SEO for every public page, in one place.
 *
 * `seo()` returns what a route's `head()` needs: title, description,
 * canonical, robots, Open Graph, Twitter and JSON-LD. TanStack keeps the
 * deepest route's tag when names collide, so the root only holds site-wide
 * defaults and each page sets its own.
 *
 * Canonical URLs are absolute, on one host, without query strings or a
 * trailing slash. Filtered or tracking URLs (?tab=, ?utm_…) all point back
 * to the clean page.
 */

/** The one public address of the site. Preview deployments are noindexed (vercel.json). */
export const SITE_URL = (
  (import.meta.env.VITE_SITE_URL as string | undefined) || "https://www.fynhelp.com"
).replace(/\/+$/, "");
export const SITE_NAME = "FynHelp";
export const ORG_NAME = "FynHelp Technologies";
export const SUPPORT_EMAIL = "support@fynhelp.com";
export const DEFAULT_OG = { path: "/og/default.png", alt: "FynHelp: month-end close software for CA firms in India" };

type Meta = Record<string, unknown>;
type Link = { rel: string; href: string; [k: string]: string };
export type JsonLd = Record<string, unknown>;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = `/${path.replace(/^\/+/, "")}`.split(/[?#]/)[0];
  const noSlash = clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
  return `${SITE_URL}${noSlash === "/" ? "/" : noSlash}`;
}

export interface SeoInput {
  /** Page title without the brand; " — FynHelp" is added unless `rawTitle`. */
  title: string;
  rawTitle?: boolean;
  /** 120–160 characters, written for the person searching. */
  description: string;
  /** Path of this page; becomes the canonical URL. */
  path: string;
  image?: string;
  imageAlt?: string;
  type?: "website" | "article";
  /** Keep out of search results (still followed for links). */
  noindex?: boolean;
  jsonLd?: JsonLd[];
  article?: { publishedTime?: string | null; modifiedTime?: string | null; section?: string | null; tags?: string[] | null };
}

export function seo(input: SeoInput): { meta: Meta[]; links: Link[] } {
  // Brand suffix only when it adds something and fits Google's ~60-character title.
  const withBrand = `${input.title} — ${SITE_NAME}`;
  const title =
    input.rawTitle || input.title.includes(SITE_NAME) || withBrand.length > 62 ? input.title : withBrand;
  const url = absoluteUrl(input.path);
  const image = absoluteUrl(input.image ?? DEFAULT_OG.path);
  const imageAlt = input.imageAlt ?? (input.image ? input.title : DEFAULT_OG.alt);
  const robots = input.noindex
    ? "noindex, follow"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

  const meta: Meta[] = [
    { title },
    { name: "description", content: input.description },
    { name: "robots", content: robots },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:description", content: input.description },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: imageAlt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: imageAlt },
  ];
  if (!input.image || input.image.startsWith("/og/")) {
    meta.push({ property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" });
  }
  if (input.article) {
    const a = input.article;
    if (a.publishedTime) meta.push({ property: "article:published_time", content: a.publishedTime });
    if (a.modifiedTime) meta.push({ property: "article:modified_time", content: a.modifiedTime });
    if (a.section) meta.push({ property: "article:section", content: a.section });
  }
  for (const ld of input.jsonLd ?? []) meta.push({ "script:ld+json": ld });

  // Noindexed pages still get a canonical so signals consolidate on the real page.
  return { meta, links: [{ rel: "canonical", href: url }] };
}

/** For app, auth and admin areas: never in search results, and nothing to share. */
export function noindexHead(title?: string) {
  return {
    meta: [
      ...(title ? [{ title }] : []),
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

/* ────────────────────────── JSON-LD builders ────────────────────────── */

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const SOFTWARE_ID = `${SITE_URL}/#software`;

export function organizationLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME,
    alternateName: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") },
    description:
      "FynHelp builds practice software for chartered accountant firms in India: document collection, bank reconciliation and source-traceable MIS on top of Tally and Zoho.",
    email: SUPPORT_EMAIL,
    address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" },
    areaServed: { "@type": "Country", name: "India" },
    contactPoint: [
      { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, areaServed: "IN", availableLanguage: ["English", "Hindi"] },
      { "@type": "ContactPoint", contactType: "sales", email: SUPPORT_EMAIL, areaServed: "IN", availableLanguage: ["English", "Hindi"] },
    ],
  };
}

/** No SearchAction: the site has no search results page for Google to send people to. */
export function websiteLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    description: "Month-end close software for CA firms in India.",
    inLanguage: "en-IN",
    publisher: { "@id": ORG_ID },
  };
}

/** Plans as shown on /pricing (monthly, exclusive of GST). Keep in step with the pricing page. */
const PLANS = [
  { name: "Pilot", price: "0", description: "Extract, Recon and Narrate for up to 3 client entities, free." },
  { name: "Starter", price: "2999", description: "15 active client entities included, unlimited users." },
  { name: "Professional", price: "5999", description: "40 active client entities included, Chaser follow-ups, unlimited users." },
  { name: "Scale", price: "12999", description: "100 active client entities included, unlimited users." },
];

export function softwareLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Accounting practice management",
    operatingSystem: "Web browser",
    inLanguage: "en-IN",
    description:
      "FynHelp helps CA firms close every client's month: it collects and reads bank statements and Tally or Zoho exports, reconciles bank to books, queues only real exceptions for review, and drafts a source-traceable MIS for partner sign-off.",
    featureList: [
      "Bank statement and Tally export extraction",
      "Bank-to-books reconciliation (exact, fuzzy and rule-based)",
      "Exception and review queues",
      "Source-traceable monthly MIS with partner sign-off",
      "Automated document follow-ups by email and WhatsApp",
    ],
    audience: { "@type": "BusinessAudience", audienceType: "Chartered accountant firms and accounting practices", geographicArea: { "@type": "Country", name: "India" } },
    publisher: { "@id": ORG_ID },
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: p.name,
      description: p.description,
      price: p.price,
      priceCurrency: "INR",
      url: absoluteUrl("/pricing"),
      availability: "https://schema.org/InStock",
      ...(p.price !== "0"
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: p.price, priceCurrency: "INR", unitText: "MONTH", valueAddedTaxIncluded: false } }
        : {}),
    })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

export function faqLd(faqs: [string, string][]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

export function webPageLd(o: { type?: string; name: string; description: string; path: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": o.type ?? "WebPage",
    "@id": `${absoluteUrl(o.path)}#webpage`,
    url: absoluteUrl(o.path),
    name: o.name,
    description: o.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": SITE_ID },
    about: { "@id": ORG_ID },
  };
}

export function articleLd(p: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  publishedTime?: string | null;
  modifiedTime?: string | null;
  authorName?: string | null;
  section?: string | null;
  tags?: string[] | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title.slice(0, 110),
    description: p.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(p.path) },
    url: absoluteUrl(p.path),
    image: [absoluteUrl(p.image || DEFAULT_OG.path)],
    ...(p.publishedTime ? { datePublished: p.publishedTime } : {}),
    ...(p.modifiedTime || p.publishedTime ? { dateModified: p.modifiedTime || p.publishedTime } : {}),
    author: p.authorName ? { "@type": "Person", name: p.authorName } : { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    inLanguage: "en-IN",
    ...(p.section ? { articleSection: p.section } : {}),
    ...(p.tags?.length ? { keywords: p.tags.join(", ") } : {}),
  };
}

/** Plain text for meta descriptions: no tags, collapsed spaces, cut on a word. */
export function toDescription(text: string, max = 158): string {
  const plain = text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:.\s]+$/, "")}…`;
}
