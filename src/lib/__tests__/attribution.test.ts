// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({ default: { __loaded: false, capture: vi.fn(), init: vi.fn(), identify: vi.fn(), reset: vi.fn() } }));

import { ATTRIBUTED_EVENTS, track, withCampaign } from "../analytics";
import { campaignParams, captureUtm } from "../utm";

const land = (qs: string, path = "/pricing") => {
  window.history.replaceState({}, "", `${path}${qs}`);
  localStorage.clear();
  captureUtm();
};

beforeEach(() => {
  localStorage.clear();
  delete (window as { gtag?: unknown }).gtag;
});

describe("campaign tags on conversions", () => {
  it("keeps the five campaign tags and the landing page, nothing else", () => {
    land("?utm_source=linkedin&utm_medium=social&utm_campaign=oct26&utm_content=tarun&utm_term=ca+software&email=a@b.in&fbclid=zzz");
    expect(campaignParams()).toEqual({
      utm_source: "linkedin", utm_medium: "social", utm_campaign: "oct26", utm_content: "tarun", utm_term: "ca software", landing_page: "/pricing",
    });
  });
  it("is empty for a visitor with no campaign, so plain traffic is not mislabelled", () => {
    land("");
    expect(campaignParams()).toEqual({});
    expect(withCampaign("sign_up", { method: "email" })).toEqual({ method: "email" });
  });
  it("adds the tags to sign-ups, demo requests and the other conversions, and lets the caller override", () => {
    land("?utm_source=meta&utm_medium=paid_social&utm_campaign=oct26&utm_content=nidhi_reel_1");
    for (const e of ATTRIBUTED_EVENTS) expect(withCampaign(e, {}).utm_content).toBe("nidhi_reel_1");
    expect(withCampaign("sign_up", { method: "email" })).toMatchObject({ method: "email", utm_source: "meta", utm_content: "nidhi_reel_1" });
    expect(withCampaign("sign_up", { utm_content: "override" }).utm_content).toBe("override");
  });
  it("does not add them to ordinary product events", () => {
    land("?utm_content=tarun");
    expect(withCampaign("dashboard_viewed", { a: 1 })).toEqual({ a: 1 });
  });
  it("sends GA4 a sign_up event carrying utm_content", () => {
    land("?utm_source=linkedin&utm_medium=social&utm_campaign=oct26&utm_content=tarun");
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    track("sign_up", { method: "email" });
    // GA_ID comes from the constant in consent.ts, so GA is on.
    expect(gtag).toHaveBeenCalledWith("event", "sign_up", expect.objectContaining({ method: "email", utm_content: "tarun", utm_source: "linkedin" }));
  });
  it("keeps the first landing's tags when the visitor browses on without any", () => {
    land("?utm_content=tarun");
    window.history.replaceState({}, "", "/about");
    captureUtm();
    expect(campaignParams().utm_content).toBe("tarun");
  });
});
