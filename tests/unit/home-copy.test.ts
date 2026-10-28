import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_FAQS, PRICING_FAQS } from "@/content/faqs";

const home = readFileSync("src/pages/HomePage.tsx", "utf8");

describe("homepage copy", () => {
  it("labels the stats band for what each figure is", () => {
    for (const label of ["Processing speed", "Traceable", "Cost per client"]) expect(home).toContain(`badge: "${label}"`);
    for (const old of ["Time saved", "AI-native", "More revenue"]) expect(home).not.toContain(`badge: "${old}"`);
    expect(home).toContain("Offer a monthly MIS to every client and grow fees without adding staff.");
  });

  it("describes the same five matching passes everywhere", () => {
    const five = "exact, same-day, close, your firm’s rules and split payments";
    expect(home.split(five).length - 1).toBeGreaterThanOrEqual(3);
    expect(home).not.toMatch(/exact, then fuzzy|Exact, fuzzy and firm-rule/);
  });

  it("brings the agents into the hero, keeping the headline", () => {
    expect(home).toContain("Month-end close for CA firms,");
    expect(home).toContain("Four agents collect your clients&rsquo; documents, reconcile bank to Tally or Zoho, and draft a");
    expect(home).toContain("source-traceable MIS. Your team reviews the exceptions, and a partner signs.");
  });

  it("shows pricing once as a table, and once as a single line that links to it", () => {
    expect(home).not.toContain("Invest in the close you want");
    expect(home).toContain('href="#pricing"');
    expect(home).toContain("Priced per active client, never per seat");
    expect(home.match(/id="pricing"/g)).toHaveLength(1);
  });

  it("gives Scale both a sign-up and a Talk to us button", () => {
    expect(home).toContain('secondary: "Talk to us"');
    expect(home).toContain('cta: "Start free, no card", secondary: "Talk to us"');
  });

  it("uses curly apostrophes in the copy", () => {
    const strings = [...HOME_FAQS.flat(), ...PRICING_FAQS.flat()].join(" ");
    expect(strings).not.toMatch(/[A-Za-z]'[a-z]/);
    expect(home).not.toMatch(/"[^"\n]*[A-Za-z]'[a-z][^"\n]*"/);
  });
});
