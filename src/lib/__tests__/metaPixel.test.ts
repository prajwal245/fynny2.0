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
    expect(q).toContainEqual(["init", m.META_PIXEL_ID]);
    expect(q).toContainEqual(["track", "PageView"]);
    expect(m.META_PIXEL_ID).toBe("1117288487577710");
  });

  it("does not record a page view on a private screen, and turns off Meta's automatic tracking", async () => {
    window.history.replaceState({}, "", "/app/clients/abc");
    const m = await load();
    m.saveConsent(true, true);
    m.syncMetaPixel();
    expect(queue()).not.toContainEqual(["track", "PageView"]);
    expect(window.fbq?.disablePushState).toBe(true);
    expect(queue()).toContainEqual(["set", "autoConfig", false, m.META_PIXEL_ID]);
  });

  it("treats older consent choices as advertising off", async () => {
    localStorage.setItem("fynhelp.consent", JSON.stringify({ v: 1, analytics: true, at: new Date().toISOString() }));
    const m = await load();
    expect(m.marketingAllowed()).toBe(false);
  });
});
