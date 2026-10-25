import { describe, expect, it } from "vitest";
import {
  ATTACH_WINDOW_DAYS,
  MAX_REWARD_MONTHS_PER_YEAR,
  eligibleToRefer,
  extendTrial,
  monthlyValue,
  newReferralCode,
  parseReferralCode,
  referralLink,
  referrerHasRoom,
  rewardMode,
  type FirmFacts,
} from "@/lib/practice/referrals";

const NOW = new Date("2026-10-26T06:00:00Z");
const firm = (o: Partial<FirmFacts> = {}): FirmFacts => ({ id: "f1", userId: "u1", email: "a@x.in", createdAt: "2026-10-25T06:00:00Z", isDemo: false, ...o });

describe("referral codes", () => {
  it("are 8 readable characters starting with FH", () => {
    for (let i = 0; i < 100; i++) expect(newReferralCode()).toMatch(/^FH[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });
  it("are read back from however a person types or pastes them", () => {
    expect(parseReferralCode("fh k7m2qx")).toBe("FHK7M2QX");
    expect(parseReferralCode(" FH-K7M2QX ")).toBe("FHK7M2QX");
    expect(parseReferralCode("FHK7M2Q")).toBeNull(); // too short
    expect(parseReferralCode("XXK7M2QXY")).toBeNull();
    expect(parseReferralCode("FH0O1IL2")).toBeNull(); // characters we never issue
    expect(parseReferralCode(null)).toBeNull();
  });
  it("make a link that lands on the home page with the code", () => {
    expect(referralLink("https://www.fynhelp.com/", "FHK7M2QX")).toBe("https://www.fynhelp.com/?ref=FHK7M2QX");
  });
});

describe("who may be referred", () => {
  const referrer = firm({ id: "r", userId: "ur", email: "r@x.in", createdAt: "2026-01-01T00:00:00Z" });
  const newFirm = firm({ id: "n", userId: "un", email: "n@x.in" });
  it("accepts a new firm from a different owner", () => {
    expect(eligibleToRefer(referrer, newFirm, false, NOW)).toEqual({ ok: true });
  });
  it("refuses each abuse pattern for its own reason", () => {
    expect(eligibleToRefer(referrer, referrer, false, NOW)).toEqual({ ok: false, reason: "self" });
    expect(eligibleToRefer(referrer, { ...newFirm, userId: "ur" }, false, NOW)).toEqual({ ok: false, reason: "same_owner" });
    expect(eligibleToRefer(referrer, { ...newFirm, email: " R@X.in " }, false, NOW)).toEqual({ ok: false, reason: "same_email" });
    expect(eligibleToRefer(referrer, { ...newFirm, isDemo: true }, false, NOW)).toEqual({ ok: false, reason: "demo" });
    expect(eligibleToRefer(referrer, newFirm, true, NOW)).toEqual({ ok: false, reason: "already_referred" });
  });
  it("allows a code only in a firm's first week", () => {
    const old = { ...newFirm, createdAt: new Date(NOW.getTime() - (ATTACH_WINDOW_DAYS + 1) * 86_400_000).toISOString() };
    expect(eligibleToRefer(referrer, old, false, NOW)).toEqual({ ok: false, reason: "not_new" });
    const edge = { ...newFirm, createdAt: new Date(NOW.getTime() - (ATTACH_WINDOW_DAYS - 1) * 86_400_000).toISOString() };
    expect(eligibleToRefer(referrer, edge, false, NOW).ok).toBe(true);
  });
});

describe("the reward", () => {
  it("is trial days for a firm still on trial, and a billing credit for everyone else", () => {
    expect(rewardMode("trialing")).toBe("trial_extension");
    expect(rewardMode("active")).toBe("billing_credit");
    expect(rewardMode("past_due")).toBe("billing_credit");
    expect(rewardMode("cancelled")).toBe("billing_credit");
    expect(rewardMode(undefined)).toBe("billing_credit");
  });
  it("adds 30 days to the end of a running trial", () => {
    expect(extendTrial("2026-10-30T00:00:00Z", NOW)).toBe("2026-11-29T00:00:00.000Z");
  });
  it("restarts a trial that has already ended, from today", () => {
    expect(extendTrial("2026-10-01T00:00:00Z", NOW)).toBe("2026-11-25T06:00:00.000Z");
    expect(extendTrial(null, NOW)).toBe("2026-11-25T06:00:00.000Z");
  });
  it("stops a referrer at 12 months a year", () => {
    expect(referrerHasRoom(0)).toBe(true);
    expect(referrerHasRoom(MAX_REWARD_MONTHS_PER_YEAR - 1)).toBe(true);
    expect(referrerHasRoom(MAX_REWARD_MONTHS_PER_YEAR)).toBe(false);
  });
  it("tells the billing team what a month is worth", () => {
    expect(monthlyValue({ monthly: 4499, annual: 44990 }, "monthly")).toBe(4499);
    expect(monthlyValue({ monthly: 4499, annual: 44990 }, "annual")).toBe(3749);
  });
});
