import { describe, expect, it } from "vitest";
import { absoluteUrl, articleLd, breadcrumbLd, faqLd, seo, softwareLd, toDescription } from "@/lib/seo";
import { AGENT_SEO } from "@/components/site/agents";
import { HOME_FAQS, PRICING_FAQS } from "@/content/faqs";

const metaOf = (h: ReturnType<typeof seo>, key: string) =>
  h.meta.find((m) => (m as { name?: string; property?: string }).name === key || (m as { property?: string }).property === key) as
    | { content: string }
    | undefined;

describe("seo()", () => {
  it("builds one clean canonical: absolute, no query, no trailing slash", () => {
    expect(absoluteUrl("/pricing/?utm_source=x")).toBe("https://www.fynhelp.com/pricing");
    expect(absoluteUrl("/")).toBe("https://www.fynhelp.com/");
    const h = seo({ title: "Pricing", description: "d", path: "/pricing?tab=a" });
    expect(h.links).toEqual([{ rel: "canonical", href: "https://www.fynhelp.com/pricing" }]);
    expect(metaOf(h, "og:url")?.content).toBe("https://www.fynhelp.com/pricing");
  });

  it("adds the brand only when it fits and is not already there", () => {
    expect(seo({ title: "Pricing", description: "d", path: "/" }).meta[0]).toEqual({ title: "Pricing — FynHelp" });
    expect(seo({ title: "Contact FynHelp: talk to the team", description: "d", path: "/" }).meta[0]).toEqual({ title: "Contact FynHelp: talk to the team" });
    const long = "A very long page title that would push past what search shows";
    expect(seo({ title: long, description: "d", path: "/" }).meta[0]).toEqual({ title: long });
  });

  it("marks noindex pages and indexable pages correctly", () => {
    expect(metaOf(seo({ title: "x", description: "d", path: "/", noindex: true }), "robots")?.content).toBe("noindex, follow");
    expect(metaOf(seo({ title: "x", description: "d", path: "/" }), "robots")?.content).toMatch(/^index, follow/);
  });

  it("gives every page Open Graph and Twitter cards with an absolute image", () => {
    const h = seo({ title: "x", description: "d", path: "/a", image: "/og/recon.png" });
    for (const k of ["og:title", "og:description", "og:image", "og:url", "twitter:card", "twitter:title", "twitter:image"]) {
      expect(metaOf(h, k)?.content, k).toBeTruthy();
    }
    expect(metaOf(h, "og:image")?.content).toBe("https://www.fynhelp.com/og/recon.png");
  });

  it("keeps every module title within what search results show", () => {
    for (const [slug, s] of Object.entries(AGENT_SEO)) {
      const t = (seo({ title: s.title, description: s.description, path: `/agents/${slug}` }).meta[0] as { title: string }).title;
      expect(t.length, t).toBeLessThanOrEqual(62);
      expect(s.description.length, slug).toBeGreaterThan(110);
      expect(s.description.length, slug).toBeLessThanOrEqual(200);
    }
  });
});

describe("structured data", () => {
  it("is valid JSON with schema.org types", () => {
    for (const ld of [softwareLd(), faqLd(HOME_FAQS), faqLd(PRICING_FAQS), breadcrumbLd([{ name: "Pricing", path: "/pricing" }])]) {
      const round = JSON.parse(JSON.stringify(ld));
      expect(round["@context"]).toBe("https://schema.org");
      expect(typeof round["@type"]).toBe("string");
    }
  });

  it("prices plans in INR, matching the pricing page", () => {
    const offers = softwareLd().offers as { name: string; price: string; priceCurrency: string }[];
    expect(offers.map((o) => [o.name, o.price])).toEqual([["Pilot", "0"], ["Starter", "2999"], ["Professional", "5999"], ["Scale", "12999"]]);
    expect(offers.every((o) => o.priceCurrency === "INR")).toBe(true);
  });

  it("numbers breadcrumbs from Home with absolute URLs", () => {
    const items = breadcrumbLd([{ name: "Product", path: "/pipeline" }, { name: "Recon", path: "/agents/recon" }]).itemListElement as { position: number; item: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].item).toBe("https://www.fynhelp.com/agents/recon");
  });

  it("describes blog posts as BlogPosting with dates and a publisher", () => {
    const a = articleLd({ title: "T", description: "D", path: "/blog/t", publishedTime: "2026-09-01T00:00:00Z" });
    expect(a["@type"]).toBe("BlogPosting");
    expect(a.datePublished).toBe("2026-09-01T00:00:00Z");
    expect(a.dateModified).toBe("2026-09-01T00:00:00Z");
    expect(a.publisher).toEqual({ "@id": "https://www.fynhelp.com/#organization" });
  });
});

describe("toDescription", () => {
  it("strips HTML and cuts on a word with an ellipsis", () => {
    const d = toDescription(`<p>${"word ".repeat(60)}</p>`);
    expect(d.length).toBeLessThanOrEqual(158);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/</);
  });
});
