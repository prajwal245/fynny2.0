// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseMobile } from "@/lib/practice/mobile";

describe("mobile numbers at sign-up", () => {
  it("takes an Indian mobile as people type it", () => {
    for (const raw of ["9820011223", "98200 11223", "098200 11223", "+91 98200 11223", "91-9820011223", "+919820011223", "0091 98200 11223"])
      expect(parseMobile(raw)).toEqual({ digits: "919820011223", display: "+91 98200 11223" });
  });

  it("refuses numbers that cannot be a mobile", () => {
    for (const raw of ["", "   ", "12345", "5820011223", "98200 1122", "98200112233", "abc", "+91 58200 11223", "919820011", "98200 1122"]) expect(parseMobile(raw)).toBeNull();
  });

  it("takes other countries only with their country code", () => {
    expect(parseMobile("+44 7911 123456")).toEqual({ digits: "447911123456", display: "+447911123456" });
    expect(parseMobile("+971 50 123 4567")?.digits).toBe("971501234567");
    expect(parseMobile("447911123456")).toBeNull();
    expect(parseMobile("+1234")).toBeNull();
  });
});
