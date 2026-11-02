import { describe, expect, it } from "vitest";
import { keyMatches, safeArticleUrl, validPressUrl } from "@/lib/press.server";
import { pressLd, withLogos, type PressEntry } from "@/lib/press";

const item = (o: Partial<PressEntry> = {}): PressEntry => ({
  id: "1", kind: "news", outlet: "Deccan Business", headline: "A headline", summary: null, url: "https://deccanbusiness.com/a/", publishedOn: "2026-11-02", logo: null, logoInvert: false, image: null, ...o,
});

describe("press links", () => {
  it("accepts public https articles and paths on this site only", () => {
    expect(validPressUrl("https://outlet.com/a")).toBe(true);
    expect(validPressUrl("/blog/some-post")).toBe(true);
    expect(validPressUrl("http://outlet.com/a")).toBe(false);
    expect(validPressUrl("javascript:alert(1)")).toBe(false);
    expect(validPressUrl("//evil.com")).toBe(false);
  });
  it("refuses to fetch anything that points inside a network", () => {
    for (const bad of ["http://outlet.com/a", "https://127.0.0.1/a", "https://localhost/a", "https://10.0.0.5/a", "https://[::1]/a", "https://intranet/a", "https://svc.internal/a", "https://user:pw@outlet.com/a"])
      expect(() => safeArticleUrl(bad), bad).toThrow();
    expect(safeArticleUrl("https://www.nationnewsbrief.com/x/").hostname).toBe("www.nationnewsbrief.com");
  });
  it("compares the ingest key exactly", () => {
    expect(keyMatches("abc123", "abc123")).toBe(true);
    expect(keyMatches("abc124", "abc123")).toBe(false);
    expect(keyMatches("", "abc123")).toBe(false);
    expect(keyMatches("abc123", "")).toBe(false);
    expect(keyMatches("abc12", "abc123")).toBe(false);
  });
});

describe("press page data", () => {
  it("lists each article as a NewsArticle with its date, outlet and link", () => {
    const ld = pressLd([item(), item({ id: "2", url: "/blog/x", outlet: "FynHelp" })]) as { numberOfItems: number; itemListElement: { item: Record<string, unknown> }[] };
    expect(ld.numberOfItems).toBe(2);
    expect(ld.itemListElement[0].item).toMatchObject({ "@type": "NewsArticle", headline: "A headline", datePublished: "2026-11-02", url: "https://deccanbusiness.com/a/" });
    expect(String(ld.itemListElement[1].item["url"])).toMatch(/^https:\/\/.+\/blog\/x$/);
  });
  it("shows only outlets with a logo in the home page strip", () => {
    expect(withLogos([item(), item({ id: "2", logo: "https://x/y.png" }), item({ id: "3", logo: "https://x/z.png", kind: "release" })]).map((p) => p.id)).toEqual(["2"]);
  });
});
