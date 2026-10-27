// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import LaunchPage from "../LaunchPage";
import { CALENDLY_URL } from "@/components/site/cta";
import { LAUNCH_CODE, captureLaunchCode, clearLaunchCode, getLaunchCode } from "@/lib/launchCode";

beforeAll(() => {
  (globalThis as Record<string, unknown>).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("launch page", () => {
  it("keeps the launch code for the sign-up, so nobody types it", () => {
    expect(getLaunchCode()).toBeNull();
    render(<LaunchPage />);
    expect(getLaunchCode()).toBe(LAUNCH_CODE);
    clearLaunchCode();
    expect(getLaunchCode()).toBeNull();
  });

  it("has two ways in only: start the trial (with the code) or book a demo", () => {
    const { container } = render(<LaunchPage />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    const actions = hrefs.filter((h) => h.startsWith("/app/") || h === CALENDLY_URL);
    expect(actions.length).toBeGreaterThan(5);
    for (const h of actions) expect(h === CALENDLY_URL || h.includes(`code=${LAUNCH_CODE}`)).toBe(true);
    expect(container.textContent).not.toMatch(/log in|sign in/i);
  });

  it("ships no placeholder text", () => {
    const { container } = render(<LaunchPage />);
    container.querySelectorAll("style").forEach((n) => n.remove());
    expect(container.textContent).not.toMatch(/\[[^\]]*\]/);
    // The offer rides on the link: the code is never shown or typed.
    expect(container.textContent).not.toContain(LAUNCH_CODE);
    expect(container.querySelectorAll("input[readonly]").length).toBe(0);
  });

  it("takes the code from a shared link", () => {
    window.history.pushState({}, "", `/launch?code=${LAUNCH_CODE.toLowerCase()}`);
    expect(captureLaunchCode()).toBe(LAUNCH_CODE);
    window.history.pushState({}, "", "/");
  });
});

describe("launch page: understanding the product at a glance", () => {
  it("shows the four agents, the pains they remove, what it works with, and a month's story", () => {
    const { container } = render(<LaunchPage />);
    const text = container.textContent ?? "";
    for (const a of ["Chaser", "Extract", "Recon", "Narrate", "Partner"]) expect(text).toContain(a);
    for (const pain of ["Chasing clients for statements", "Matching bank lines by hand", "Rework after review", "Signing off on faith"]) expect(text).toContain(pain);
    for (const tool of ["TallyPrime", "Zoho Books", "WhatsApp", "Gmail"]) expect(text).toContain(tool);
    expect(text).toContain("Without FynHelp");
    expect(text).toContain("With FynHelp");
    // The example is labelled as one.
    expect(text).toMatch(/illustrative/i);
  });

  it("keeps a readable log of what the agents did, with no repeated lines", () => {
    const { container } = render(<LaunchPage />);
    const log = container.querySelector('[role="log"]');
    expect(log?.textContent).toContain("Sharma Traders");
    const lines = [...(log?.children ?? [])].map((c) => c.textContent);
    expect(new Set(lines).size).toBe(lines.length);
  });
});
