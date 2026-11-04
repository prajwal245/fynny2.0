import { describe, expect, it } from "vitest";
import { cleanFirmName, cleanIcai } from "@/lib/practice/icai";

describe("ICAI membership number", () => {
  it("accepts 5 or 6 digits, tolerating spaces and a label", () => {
    expect(cleanIcai("245981")).toBe("245981");
    expect(cleanIcai(" 24 5981 ")).toBe("245981");
    expect(cleanIcai("M.No. 245981")).toBe("245981");
    expect(cleanIcai("84321")).toBe("84321");
  });
  it("rejects the wrong shape and obvious fakes", () => {
    for (const bad of ["", "1234", "1234567", "abc123", "000000", "111111", "123456", "654321", "ABCDEF"]) expect(cleanIcai(bad)).toBeNull();
  });
});

describe("firm name", () => {
  it("accepts a real name and rejects placeholders", () => {
    expect(cleanFirmName("  Mehta   and Associates ")).toBe("Mehta and Associates");
    for (const bad of ["", "ab", "test", "ABC", "n/a", "12345", "demo"]) expect(cleanFirmName(bad)).toBeNull();
  });
});
