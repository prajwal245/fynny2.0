import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPANY } from "@/content/legal/company";

/**
 * Public pages may only claim what is true. These claims were removed because the code does not back them; a change that
 * brings one back fails here. When a claim becomes true (a certification, an Indian region), change this test in the same commit.
 */
const PUBLIC_FILES = [
  "src/components/home/SecuritySection.tsx",
  "src/components/home/TrustSection.tsx",
  "src/components/home/FAQSection.tsx",
  "src/components/home/PricingSection.tsx",
  "src/components/solutions/BackendInfrastructure.tsx",
  "src/pages/SecurityPage.tsx",
];

const NEVER = [/zero-knowledge/i, /(we|even our engineers) (cannot|can'?t|could not) (decrypt|read|see)/i, /can'?t see your data/i, /SOC ?2/i, /ISO ?27001/i, /penetration test/i, /99\.9\s*%/, /RBI data localis/i, /RBI data localiz/i, /same (security )?standards? (used )?by (HDFC|ICICI)/i];
const text = (f: string) => readFileSync(f, "utf8");

describe("public security claims match reality", () => {
  for (const f of PUBLIC_FILES) {
    it(`${f} makes no unbacked claim`, () => {
      const t = text(f);
      for (const re of NEVER) {
        // SecurityPage legitimately says "Certifications: None yet"; it must not name a standard it lacks.
        expect(t, `${f} matches ${re}`).not.toMatch(re);
      }
    });
  }

  it("names an Indian region only when the database is in one", () => {
    const inIndia = /mumbai|hyderabad|ap-south/i.test(COMPANY.region);
    if (inIndia) return;
    for (const f of PUBLIC_FILES) {
      const t = text(f).replace(/Moving data to an Indian region is planned[^"`]*/g, "").replace(/India region planned/g, "").replace(/Indian region/gi, "");
      expect(t, `${f} claims an Indian region`).not.toMatch(/mumbai|ap-south-1|never leaves india|data (is )?hosted in india|stored in india/i);
    }
  });

  it("fills the legal entity so the policy is not 'to be published'", () => {
    expect(COMPANY.entity).toMatch(/PRIVATE LIMITED$/);
    expect(COMPANY.cin).toMatch(/^[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/);
  });

  it("lists every AI provider the code can call as a sub-processor", () => {
    const llm = text("src/lib/practice/llm.server.ts");
    const policy = text("src/content/legal/privacy.ts");
    if (/api\.groq\.com/.test(llm)) expect(policy).toMatch(/Groq/);
    if (/ai\.gateway\.lovable\.dev/.test(llm)) expect(policy).toMatch(/Lovable AI Gateway/);
    if (/generativelanguage\.googleapis\.com/.test(llm)) expect(policy).toMatch(/Gemini/);
  });
});
