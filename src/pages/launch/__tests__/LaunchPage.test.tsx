// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LaunchPage from "../LaunchPage";
import { CALENDLY_URL } from "@/components/site/cta";
import { LAUNCH_CODE, captureLaunchCode, clearLaunchCode, getLaunchCode } from "@/lib/launchCode";

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
