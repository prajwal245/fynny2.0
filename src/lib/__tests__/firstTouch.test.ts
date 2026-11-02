import { describe, expect, it } from "vitest";
import { classifyChannel } from "../attribution";
import { looksLikeTest } from "../admin/testLook";

describe("classifyChannel", () => {
  it("reads the campaign tags first", () => {
    expect(classifyChannel({ source: "meta", medium: "paid_social" })).toBe("paid-social");
    expect(classifyChannel({ source: "linkedin", medium: "organic-social" })).toBe("organic-social");
    expect(classifyChannel({ source: "newsletter", medium: "email" })).toBe("email");
    expect(classifyChannel({ source: "ca-group", medium: "group" })).toBe("referral");
    expect(classifyChannel({ source: "poster", medium: "qr" })).toBe("referral");
  });
  it("falls back to click ids, then the referring site", () => {
    expect(classifyChannel({ gclid: "abc" })).toBe("paid-search");
    expect(classifyChannel({ fbclid: "abc" })).toBe("paid-social");
    expect(classifyChannel({ referrerHost: "www.google.com" })).toBe("organic-search");
    expect(classifyChannel({ referrerHost: "www.linkedin.com" })).toBe("organic-social");
    expect(classifyChannel({ referrerHost: "someblog.in" })).toBe("referral");
  });
  it("calls a visit with no referrer, or from our own site, direct", () => {
    expect(classifyChannel({})).toBe("direct");
    expect(classifyChannel({ referrerHost: "www.fynhelp.com", ownHost: "www.fynhelp.com" })).toBe("direct");
  });
});

describe("looksLikeTest", () => {
  it("flags obvious test and fake sign-ups", () => {
    expect(looksLikeTest("Test CA firm", "a@b.in")).toBe(true);
    expect(looksLikeTest("My practice", "x@y.in")).toBe(true);
    expect(looksLikeTest("Rao & Co", "qa@gmail.com")).toBe(true);
    expect(looksLikeTest("Rao & Co", "someone@mailinator.com")).toBe(true);
    expect(looksLikeTest("Rao & Co", "tarun@fynhelp.com")).toBe(true);
  });
  it("leaves real firms alone", () => {
    expect(looksLikeTest("Sharma & Associates", "sharma@sharmaca.in")).toBe(false);
    expect(looksLikeTest("Contest Chartered Accountants", "info@contestca.in")).toBe(false);
  });
});
