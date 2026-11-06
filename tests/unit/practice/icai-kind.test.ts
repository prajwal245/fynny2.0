import { describe, expect, it } from "vitest";
import { needsIcai } from "@/lib/practice/icai";

describe("who needs an ICAI number at sign-up", () => {
  it("a CA does, and so does anyone who did not say what they are (older links)", () => {
    expect(needsIcai("ca")).toBe(true);
    expect(needsIcai(undefined)).toBe(true);
    expect(needsIcai(null)).toBe(true);
    expect(needsIcai("")).toBe(true);
  });
  it("an accounting firm or a company finance team does not", () => {
    expect(needsIcai("accounting")).toBe(false);
    expect(needsIcai("inhouse")).toBe(false);
  });
  it("an unknown value is treated like a CA, never as a way around the check", () => {
    expect(needsIcai("anything-else")).toBe(true);
  });
});
