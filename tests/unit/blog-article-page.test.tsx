// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({}) } }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: unknown }) => <div>{children as never}</div> }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, ...r }: { to: string; children: unknown }) => <a href={to} {...r}>{children as never}</a> }));
vi.mock("@/components/site/cta", () => ({ SIGNUP_URL: "/signup", trackCta: () => undefined }));

import BlogArticlePage from "@/pages/BlogArticlePage";

const section = (i: number) => `<h2>Section ${i}</h2><p>${"Useful prose about month end close. ".repeat(12)}</p>`;
const post = {
  id: "1", slug: "month-end-close", title: "Month-end close for CA firms", excerpt: "A CA firm closes the month by reconciling the bank statement to the books, line by line, and chasing what is missing.", category: "Close",
  content: `<p>${"A CA firm closes the month by reconciling the bank statement to the books line by line. ".repeat(2)}</p>${[1, 2, 3, 4, 5, 6].map(section).join("")}<h2>Frequently asked questions</h2><h3>What is it?</h3><p>It is a checklist.</p>`,
  author_name: "Asha Rao", author_role: "Head of product", tags: ["close"], views: 12, reading_time_minutes: 6,
  published_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", cover_image_url: null, seo_title: null, seo_description: null, og_image: null,
};

describe("blog article page", () => {
  const html = renderToString(<BlogArticlePage post={post as never} related={[{ slug: "x", title: "Another", category: "Close", published_at: null, reading_time_minutes: 4 }]} />);
  it("puts the short answer, the heading anchors and the on-this-page list in the first HTML", () => {
    expect(html).toContain("In short");
    expect(html).toContain('data-speakable="true"');
    expect(html).toContain('id="section-1"');
    expect(html).toContain('href="#section-1"');
    expect(html).toContain("On this page");
  });
  it("shows the author, the dates, a call to action in the middle of a long article, and related reading", () => {
    expect(html).toContain("Asha Rao");
    expect(html).toContain("Updated");
    expect((html.match(/Start free trial/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Keep reading");
    expect(html).toContain("Another");
  });
});
