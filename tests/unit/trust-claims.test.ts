import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPANY } from "@/content/legal/company";

/**
 * Public pages may only claim what is true. These claims were removed because the code does not back them; a change that
 * brings one back fails here. When a claim becomes true (a certification, an Indian region), change this test in the same commit.
 */
const PUBLIC_FILES = [
  "src/pages/HomePage.tsx",
  "src/pages/AboutPage.tsx",
  "src/pages/ContactPage.tsx",
  "src/pages/CAFirmsPage.tsx",
  "src/pages/AccountingFirmsPage.tsx",
  "src/content/accountingFirmsFaqs.ts",
  "src/pages/EnterprisePage.tsx",
  "src/pages/PipelinePage.tsx",
  "src/pages/PressPage.tsx",
  "src/pages/PricingPage.tsx",
  "src/pages/SecurityPage.tsx",
  "src/pages/LoginPage.tsx",
  "src/components/site/SiteShell.tsx",
  "src/components/site/agents.ts",
  "src/content/faqs.ts",
  "public/llms.txt",
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
      expect(t, `${f} claims an Indian region`).not.toMatch(/mumbai|ap-south-1|never leaves india|data (is )?hosted in india|stored in india|stays in india/i);
    }
  });

  it("shows no street address or care-of name anywhere, only city and state on the legal pages", () => {
    expect(COMPANY.address).not.toMatch(/c\/o|\d{6}|nagar|road|street/i);
    for (const f of ["src/pages/AboutPage.tsx", "src/pages/ContactPage.tsx", "src/components/site/SiteShell.tsx"]) expect(text(f), f).not.toMatch(/COMPANY\.address/);
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

describe("public copy reads like a product, not a template", () => {
  const BUZZ = [/game.?chang/i, /supercharg/i, /revolutioni[sz]/i, /cutting.edge/i, /unlock the power/i, /\bai.powered\b/i, /welcome to your/i, /lorem ipsum/i, /next.gen(eration)?\b/i, /world.class/i];
  for (const f of PUBLIC_FILES) {
    it(`${f} has no template wording`, () => {
      const t = text(f);
      for (const re of BUZZ) expect(t, `${f} matches ${re}`).not.toMatch(re);
    });
  }
  it("shows no testimonial or customer-logo block the firm cannot back", () => {
    for (const f of ["src/pages/HomePage.tsx", "src/components/site/siteTheme.ts"]) expect(text(f)).not.toMatch(/fh-quote|testimonial/i);
  });
  it("the README is about this product, not a tool's default", () => {
    const t = text("README.md");
    expect(t).not.toMatch(/Lovable project|TODO: Document/i);
    expect(t).toMatch(/chartered accountant/i);
  });
  it("names no placeholder company as a real client in the public examples", () => {
    for (const f of ["src/components/home/AgentsBento.tsx", "src/pages/HomePage.tsx"]) expect(text(f)).not.toMatch(/\bAcme\b/);
  });
});
