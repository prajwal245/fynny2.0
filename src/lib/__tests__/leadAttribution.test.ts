// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { calendlyUtm, captureLeadAttribution, getLeadAttribution, leadFields, readTags, tidyTag } from "../leadAttribution";

const visit = (qs: string, path = "/start", now = Date.now()) => {
  window.history.replaceState({}, "", `${path}${qs}`);
  return captureLeadAttribution(now);
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("tag tidying", () => {
  it("applies the naming rules: lower case, underscores, no special characters", () => {
    expect(tidyTag("FH_Trial_Meta_Nov26")).toBe("fh_trial_meta_nov26");
    expect(tidyTag("Reel 1 / 32s  Still Manual!")).toBe("reel_1_32s_still_manual");
    expect(tidyTag("reel2_8s_bw")).toBe("reel2_8s_bw");
  });
  it("keeps click ids exactly as received", () => {
    expect(readTags("?gclid=AbC123_xyz&fbclid=IwAR0Q&utm_source=FB")).toEqual({ gclid: "AbC123_xyz", fbclid: "IwAR0Q", utm_source: "fb" });
  });
});

describe("first click and last click", () => {
  it("keeps the first click for good and replaces the last", () => {
    visit("?utm_source=fb&utm_medium=paid_social&utm_campaign=fh_trial_meta_nov26&utm_content=reel1_32s_stillmanual&utm_term=ca_firms");
    const second = visit("?utm_source=google&utm_medium=cpc&utm_campaign=12345&gclid=G1", "/demo");
    expect(second.first.utm_source).toBe("fb");
    expect(second.first.utm_content).toBe("reel1_32s_stillmanual");
    expect(second.last.utm_source).toBe("google");
    expect(second.last.gclid).toBe("G1");
    expect(second.last.landing).toBe("/demo");
    expect(getLeadAttribution().first.landing).toBe("/start");
  });
  it("does nothing for an untagged visit, and a later untagged visit keeps what is stored", () => {
    expect(visit("")).toEqual({ first: {}, last: {} });
    visit("?utm_source=ig&utm_medium=paid_social");
    expect(visit("", "/pricing").first.utm_source).toBe("ig");
  });
  it("forgets a first click older than 90 days", () => {
    const old = Date.now() - 91 * 86_400_000;
    visit("?utm_source=fb", "/start", old);
    const fresh = visit("?utm_source=linkedin");
    expect(fresh.first.utm_source).toBe("linkedin");
  });
  it("is never recorded in QA mode", () => {
    expect(visit("?utm_source=qa&utm_campaign=x")).toEqual({ first: {}, last: {} });
    expect(localStorage.getItem("fh_first")).toBeNull();
  });
});

describe("what goes with a sign-up or demo", () => {
  it("fills every first_ and last_ field named in the playbook, empty when unknown", () => {
    visit("?utm_source=fb&utm_campaign=fh_demo_meta_nov26&fbclid=Q1");
    const f = leadFields();
    expect(f["first_utm_source"]).toBe("fb");
    expect(f["last_utm_campaign"]).toBe("fh_demo_meta_nov26");
    expect(f["last_fbclid"]).toBe("Q1");
    expect(f["first_gclid"]).toBe("");
    expect(Object.keys(f)).toContain("last_gclid");
  });
  it("hands the last click to Calendly", () => {
    visit("?utm_source=fb&utm_medium=paid_social&utm_campaign=fh_demo_meta_nov26&utm_content=reel2_8s_bw&utm_term=adset_a");
    expect(calendlyUtm()).toEqual({ utmSource: "fb", utmMedium: "paid_social", utmCampaign: "fh_demo_meta_nov26", utmContent: "reel2_8s_bw", utmTerm: "adset_a" });
  });
});
