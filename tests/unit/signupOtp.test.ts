import { describe, expect, it } from "vitest";
import { OTP_SLOT_MS, looksFake, makeProof, otpCode, otpMatches, proofValid } from "@/lib/practice/signupOtp";

const S = "test-secret";
const NOW = Date.UTC(2026, 10, 4, 6, 0, 0);

describe("sign-up WhatsApp code", () => {
  it("is 6 digits, stable inside a slot and different per number", () => {
    const c = otpCode(S, "919820011223", NOW);
    expect(c).toMatch(/^\d{6}$/);
    expect(otpCode(S, "919820011223", NOW + 1000)).toBe(c);
    expect(otpCode(S, "919820011224", NOW)).not.toBe(c);
    expect(otpCode("other", "919820011223", NOW)).not.toBe(c);
  });
  it("accepts the current and the previous slot, and nothing else", () => {
    const d = "919820011223";
    const c = otpCode(S, d, NOW);
    expect(otpMatches(S, d, c, NOW)).toBe(true);
    expect(otpMatches(S, d, ` ${c.slice(0, 3)} ${c.slice(3)} `, NOW)).toBe(true);
    expect(otpMatches(S, d, c, NOW + OTP_SLOT_MS)).toBe(true);
    expect(otpMatches(S, d, c, NOW + 2 * OTP_SLOT_MS)).toBe(false);
    expect(otpMatches(S, d, "000000" === c ? "111111" : "000000", NOW)).toBe(false);
    expect(otpMatches(S, d, "12345", NOW)).toBe(false);
  });
  it("proof works only for its own number, before it expires", () => {
    const p = makeProof(S, "919820011223", NOW);
    expect(proofValid(S, "919820011223", p, NOW + 1000)).toBe(true);
    expect(proofValid(S, "919820011224", p, NOW + 1000)).toBe(false);
    expect(proofValid(S, "919820011223", p, NOW + 31 * 60_000)).toBe(false);
    expect(proofValid("other", "919820011223", p, NOW)).toBe(false);
    expect(proofValid(S, "919820011223", undefined, NOW)).toBe(false);
    expect(proofValid(S, "919820011223", "1.2", NOW)).toBe(false);
  });
  it("rejects numbers nobody owns", () => {
    for (const n of ["9999999999", "9876543210", "1234567890", "9898989898"]) expect(looksFake(n)).toBe(true);
    expect(looksFake("9820011223")).toBe(false);
  });
});
