import { describe, expect, it } from "vitest";
import { isoMinutes, readingMinutes, shortAnswer, slugify, splitAtSection, withHeadingIds, wordCount } from "@/lib/articleStructure";

describe("article structure", () => {
  it("gives headings anchors, keeps existing ids, and makes repeats unique", () => {
    const { html, toc } = withHeadingIds('<h2>Why it matters</h2><p>x</p><h3>Cash &amp; bank</h3><h2>Why it matters</h2><h2 id="keep">Kept</h2><h4>no</h4>');
    expect(toc).toEqual([
      { id: "why-it-matters", text: "Why it matters", level: 2 },
      { id: "cash-and-bank", text: "Cash & bank", level: 3 },
      { id: "why-it-matters-2", text: "Why it matters", level: 2 },
      { id: "keep", text: "Kept", level: 2 },
    ]);
    expect(html).toContain('<h2 id="why-it-matters">');
    expect(html).toContain('<h2 id="keep">Kept</h2>');
    expect(html).not.toContain("<h4 id");
  });
  it("slugifies plainly", () => {
    expect(slugify("What is GSTR-2B? (2026)")).toBe("what-is-gstr-2b-2026");
    expect(slugify("???")).toBe("section");
  });
  it("takes the answer box first, then the excerpt, then the first real paragraph", () => {
    expect(shortAnswer('<div class="answer"><strong>Short answer</strong> Bank reconciliation matches the bank statement to the books line by line.</div><p>x</p>')).toBe("Short answer Bank reconciliation matches the bank statement to the books line by line.".replace(/^Short answer /, ""));
    expect(shortAnswer("<p>short</p>", "A clear excerpt that is long enough to be used as the answer on top.")).toMatch(/clear excerpt/);
    expect(shortAnswer("<p>tiny</p><p>" + "Real prose ".repeat(12) + "</p>")).toMatch(/^Real prose/);
    expect(shortAnswer("<p>tiny</p>")).toBe("");
  });
  it("counts words and reading time", () => {
    const body = `<p>${"word ".repeat(450)}</p>`;
    expect(wordCount(body)).toBe(450);
    expect(readingMinutes(body)).toBe(2);
    expect(readingMinutes("<p>hi</p>")).toBe(1);
    expect(isoMinutes(7)).toBe("PT7M");
  });
  it("splits a long article after the third section, and leaves a short one whole", () => {
    const long = Array.from({ length: 6 }, (_, i) => `<h2>S${i}</h2><p>b</p>`).join("");
    const [a, b] = splitAtSection(long, 3, 5);
    expect(a).toContain("S2");
    expect(a).not.toContain("S3");
    expect(b.startsWith("<h2>S3")).toBe(true);
    expect(splitAtSection("<h2>a</h2><h2>b</h2>")).toEqual(["<h2>a</h2><h2>b</h2>", ""]);
  });
});
