// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({ default: { __loaded: false, capture: vi.fn(), init: vi.fn(), identify: vi.fn(), reset: vi.fn() } }));

const load = async () => {
  vi.resetModules();
  const consent = await import("../consent");
  const analytics = await import("../analytics");
  return { ...consent, ...analytics };
};
const queue = () => ((window.fbq?.queue ?? []) as unknown[][]).map((q) => Array.from(q as ArrayLike<unknown>));

beforeEach(() => {
  localStorage.clear();
  delete (window as { fbq?: unknown }).fbq;
  delete (window as { _fbq?: unknown })._fbq;
  document.head.innerHTML = "";
  window.history.replaceState({}, "", "/pricing");
});

describe("Meta Pixel", () => {
  it("does not load without the visitor's advertising consent", async () => {
    const m = await load();
    m.syncMetaPixel();
    expect(window.fbq).toBeUndefined();
    m.saveConsent(true, false); // analytics yes, advertising no
    m.syncMetaPixel();
    expect(window.fbq).toBeUndefined();
    expect(document.head.querySelector('script[src*="fbevents"]')).toBeNull();
  });

  it("loads with consent, with the right pixel, and counts the first public page", async () => {
    const m = await load();
    m.saveConsent(true, true);
    m.syncMetaPixel();
    expect(document.head.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]')).not.toBeNull();
    const q = queue();
    expect(q).toContainEqual(["init", "1117288487577710"]);
    expect(q).toContainEqual(["init", "2251839838719101"]);
    expect(q).toContainEqual(["init", "1746808626400829"]);
    // A public page is counted by both site pixels, and not by the app pixel.
    expect(q).toContainEqual(["trackSingle", "1117288487577710", "PageView"]);
    expect(q).toContainEqual(["trackSingle", "2251839838719101", "PageView"]);
    expect(q).not.toContainEqual(["trackSingle", "1746808626400829", "PageView"]);
  });

  it("counts web app screens with the app pixel, but not screens that name a client or record", async () => {
    const m = await load();
    expect(m.pixelFor("/")).toBe("site");
    expect(m.pixelFor("/pricing")).toBe("site");
    expect(m.pixelFor("/app")).toBe("app");
    expect(m.pixelFor("/app/onboarding")).toBe("app");
    expect(m.pixelFor("/app/clients/3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b")).toBeNull();
    for (const p of ["/admin/firms", "/ca/portal", "/dashboard", "/u/abc", "/shared/mis/xyz"]) expect(m.pixelFor(p), p).toBeNull();
    window.history.replaceState({}, "", "/app/onboarding");
    m.saveConsent(true, true);
    m.syncMetaPixel();
    expect(queue()).toContainEqual(["trackSingle", "1746808626400829", "PageView"]);
  });

  it("does not record a page view on a private screen, and turns off Meta's automatic tracking", async () => {
    window.history.replaceState({}, "", "/app/clients/3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b");
    const m = await load();
    m.saveConsent(true, true);
    m.syncMetaPixel();
    expect(queue().filter((q) => q.includes("PageView"))).toEqual([]);
    expect(window.fbq?.disablePushState).toBe(true);
    expect(queue()).toContainEqual(["set", "autoConfig", false, "1117288487577710"]);
    expect(queue()).toContainEqual(["set", "autoConfig", false, "2251839838719101"]);
    expect(queue()).toContainEqual(["set", "autoConfig", false, "1746808626400829"]);
  });

  it("treats older consent choices as advertising off", async () => {
    localStorage.setItem("fynhelp.consent", JSON.stringify({ v: 1, analytics: true, at: new Date().toISOString() }));
    const m = await load();
    expect(m.marketingAllowed()).toBe(false);
  });
});
