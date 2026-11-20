import { describe, expect, it } from "vitest";
import { buildPartyMaster } from "@/lib/practice/review/partyMaster";
import type { MasterRow } from "@/lib/practice/review/trialBalance";

const m = (name: string, primary: string, gstin: string | null, pan: string | null, billWise = false): MasterRow => ({ name, group: primary, primary, gstin, pan, state: "Telangana", regType: "Regular", billWise, opening: 0 });
describe("party master from Tally masters", () => {
  const b = buildPartyMaster([
    m("Malkhed Real Estate", "Sundry Debtors", "36AABCM1234F1Z5", null, true),
    m("Malkhed Real Estate (IT Works)", "Current Assets", "36AABCM1234F1Z5", null),
    m("Vendor Two", "Sundry Creditors", null, "ABCDE1234F"),
    m("Vendor Three", "Sundry Creditors", null, null),
    m("Mistyped", "Sundry Creditors", "36AAACX9999K1Z1", "AAACY9999K"),
    m("Office rent", "Indirect Expenses", null, null),
  ]);
  it("takes PAN from the GSTIN when the master has none, and treats ledgers with one GSTIN as one party", () => {
    const mal = b.parties.find((p) => p.party === "Malkhed Real Estate")!;
    expect(mal).toMatchObject({ pan: "AABCM1234F", panFrom: "gstin", aliases: ["Malkhed Real Estate (IT Works)"], billWise: true });
    expect(b.parties.some((p) => p.party === "Malkhed Real Estate (IT Works)")).toBe(false);
  });
  it("leaves expense ledgers out and flags a party with no identity at all", () => {
    expect(b.parties.map((p) => p.party)).not.toContain("Office rent");
    expect(b.issues.find((i) => i.kind === "no_pan_no_gstin")?.party).toBe("Vendor Three");
  });
  it("flags a PAN that disagrees with the one inside the GSTIN", () => {
    expect(b.issues.find((i) => i.kind === "pan_gstin_mismatch")?.detail).toMatch(/AAACY9999K.*AAACX9999K/);
  });
  it("counts what it found", () => {
    expect(b).toMatchObject({ withGstin: 2, billWise: 1 });
  });
});
