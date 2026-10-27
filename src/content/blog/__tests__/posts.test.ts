import { describe, expect, it } from "vitest";
import { STATIC_POSTS, publishedStatic } from "..";
import { faqFromHtml } from "@/lib/blog";

/** Posts that live in the database and are linked from the new articles. */
const DB_SLUGS = [
  "month-end-close-checklist-ca-firms",
  "gstr-2b-reconciliation-with-books",
  "bank-reconciliation-automation-ca-firms-india",
  "compliance-calendar-fy-2026-27",
  "tally-export-to-fynhelp",
  "tally-on-cloud-to-fynhelp",
  "connect-zoho-books-to-fynhelp",
  "best-bank-reconciliation-software-ca-firms-india",
  "month-end-close-walkthrough-sample-files",
];
const PAGES = ["/launch", "/pricing", "/samples", "/agents/recon", "/agents/narrate", "/agents/chaser"];

describe("launch articles", () => {
  it("are ten, each with its own address", () => {
    expect(STATIC_POSTS).toHaveLength(10);
    expect(new Set(STATIC_POSTS.map((p) => p.slug)).size).toBe(10);
    for (const p of STATIC_POSTS) expect(p.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("have titles and descriptions that fit a search result", () => {
    for (const p of STATIC_POSTS) {
      expect(p.seo_title.length, p.slug).toBeLessThanOrEqual(60);
      expect(p.seo_description.length, p.slug).toBeLessThanOrEqual(160);
      expect(p.seo_description.length, p.slug).toBeGreaterThan(100);
    }
  });

  it("open with a short answer, answer questions, and end with the way in", () => {
    for (const p of STATIC_POSTS) {
      expect(p.content, p.slug).toContain('class="answer"');
      expect(faqFromHtml(p.content).length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.content, p.slug).toContain('href="/launch"');
    }
  });

  it("link only to pages and articles that exist", () => {
    const all = new Set([...DB_SLUGS, ...STATIC_POSTS.map((p) => p.slug)]);
    for (const p of STATIC_POSTS) {
      for (const [, href] of p.content.matchAll(/href="([^"]+)"/g)) {
        if (href.startsWith("https://")) continue;
        if (href.startsWith("/blog/")) expect(all.has(href.replace("/blog/", "")), `${p.slug} -> ${href}`).toBe(true);
        else expect(PAGES.includes(href), `${p.slug} -> ${href}`).toBe(true);
      }
    }
  });

  it("carry no placeholder text and no invented statistics", () => {
    for (const p of STATIC_POSTS) {
      expect(p.content, p.slug).not.toMatch(/\[[A-Za-z ]{2,}\]|lorem|TODO|XX%/i);
    }
  });

  it("are all live now", () => {
    expect(publishedStatic()).toHaveLength(10);
  });
});
