import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("what the site says about Zoho Books matches what the product does", () => {
  const surfaces = ["src/content/faqs.ts", "src/pages/SecurityPage.tsx", "src/pages/HomePage.tsx", "src/content/legal/terms.ts", "public/llms.txt", "src/v2/components/ZohoBooks.tsx"];

  it("no page still promises that FynHelp never writes to Zoho or to the ledger in general", () => {
    for (const f of surfaces) {
      const t = read(f);
      expect(t, f).not.toMatch(/never writes? (to|back)[^.]{0,30}(Tally or Zoho|your ledger|your books)/i);
      expect(t, f).not.toMatch(/does not post or alter entries in Tally, Zoho/i);
    }
  });

  it("says read-only by default and names the one narrow exception, on security, FAQ and the terms", () => {
    for (const f of ["src/content/faqs.ts", "src/pages/SecurityPage.tsx", "src/content/legal/terms.ts"]) {
      const t = read(f);
      expect(t, f).toMatch(/read-only/i);
      expect(t, f).toMatch(/approv/i);
    }
    expect(read("src/pages/SecurityPage.tsx")).toMatch(/never writes to Tally/);
  });

  it("still never claims to write to Tally", () => {
    for (const f of surfaces) expect(read(f), f).not.toMatch(/(?<!never )writes? to Tally/i);
  });
});
