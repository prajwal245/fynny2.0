// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import LaunchPage from "../LaunchPage";
import { CALENDLY_URL } from "@/components/site/cta";
import { LAUNCH_CODE, captureLaunchCode, clearLaunchCode, getLaunchCode } from "@/lib/launchCode";
import { PLAN_ORDER, PLANS } from "@/lib/practice/billing/plans";

beforeAll(() => {
  (globalThis as Record<string, unknown>).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  track.mockClear();
});
afterEach(cleanup);

const text = (c: HTMLElement) => c.textContent ?? "";

describe("launch page: positioning and copy", () => {
  it("leads with the new promise and the two ways in", () => {
    const { container } = render(<LaunchPage />);
    expect(container.querySelector("h1")?.textContent).toBe("Your month-end close, run by agents. Signed by you.");
    const t = text(container);
    expect(t).toContain("Start your free 30 days");
    expect(t).toContain("Book a 15-minute walkthrough");
    expect(t).toContain("No migration. Nothing changes in your Tally. Your clients don’t install anything.");
  });

  it("shows the sections in the agreed order", () => {
    const t = text(render(<LaunchPage />).container);
    const order = [
      "Launch offer: the first 100 CA firms get 30 days free",
      "Your month-end close, run by agents",
      "Works with the tools your firm and your clients already use.",
      "Four agents run the month",
      "Ten WhatsApp messages to get one bank statement.",
      "Your name is on the report. So you stay in control.",
      "A month at a CA firm",
      "Priced per active client",
      "Before FynHelp, I ran Dark Capital",
      "Straight answers.",
      "Close this month faster.",
    ].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("uses the Tally and Zoho line, the role lines, the four pains and the control list", () => {
    const t = text(render(<LaunchPage />).container);
    expect(t).toContain("Connects to Tally and Zoho Books");
    for (const l of ["Follows up with clients, so your juniors don’t have to.", "Reads statements and bills, and flags anything it isn’t sure about.", "Matches bank to books, and hands you only the exceptions.", "Drafts the MIS. Every number links back to its source.", "Review, approve, sign."]) expect(t).toContain(l);
    for (const p of ["Three days matching in Excel.", "Rework because documents came late or wrong.", "Signing a report you didn’t build.", "Every figure opens to its source."]) expect(t).toContain(p);
    expect(t).toContain("Export all your firm’s data whenever you want.");
    expect(t).toContain("Illustrative");
  });

  it("takes plans, prices and included clients from the pricing source, and says GST is extra", () => {
    const t = text(render(<LaunchPage />).container);
    for (const k of PLAN_ORDER) {
      const p = PLANS[k];
      expect(t).toContain(p.name);
      expect(t).toContain(`₹${p.monthly.toLocaleString("en-IN")}`);
      expect(t).toContain(`${p.clientsIncluded} active clients included`);
    }
    expect(t).toContain(`Prices exclude 18% GST. First 100 firms: 30 days free with code ${LAUNCH_CODE}.`);
    expect(t).toContain("If FynHelp saves your team about 9 hours a month, the Firm plan pays for itself.");
  });

  it("answers the new questions, without claiming GST reconciliation is live", () => {
    const t = text(render(<LaunchPage />).container);
    for (const q of ["Does FynHelp file returns?", "Does it change anything in Tally?", "Do my clients need to install an app?", "What’s coming next?"]) expect(t).toContain(q);
    expect(t).toContain("Matching is rule-based");
    expect(t).toContain("GST reconciliation against GSTR-2B is next on our roadmap.");
  });
});

describe("launch page: rules", () => {
  it("names Tarun as the only founder and shows no photo while none is set", () => {
    const { container } = render(<LaunchPage />);
    const t = text(container);
    expect(t).toContain("Tarun Adireddy");
    expect(t).toContain("Co-founder & CEO, FynHelp");
    expect(t).not.toMatch(/nidhi|founders\b/i);
    expect(container.querySelector('img[alt="Tarun Adireddy"]')).toBeNull();
  });

  it("makes none of the claims the product can’t back", () => {
    const t = text(render(<LaunchPage />).container);
    expect(t).not.toMatch(/\b\d+x\b/i);
    expect(t).not.toMatch(/AI CFO|financial intelligence|capacity dashboard|deadline|compliance track/i);
    expect(t).not.toMatch(/AI (matching|flag)/i);
  });

  it("ships no placeholder text and no straight quotes or apostrophes in what is shown", () => {
    const { container } = render(<LaunchPage />);
    container.querySelectorAll("style").forEach((n) => n.remove());
    const t = text(container);
    expect(t).not.toMatch(/TODO|\[[^\]]*\]/);
    expect(t).not.toMatch(/['"]/);
  });

  it("uses only the marketing site’s colours in the page source", () => {
    const allowed = new Set(["#F2EEE7", "#EBE6DD", "#FFFDF9", "#171208", "#0E0B06", "#A93838", "#5C1216", "#E2673F", "#8B6914", "#1F5A46", "#F7F1E6", "#000"].map((x) => x.toLowerCase()));
    for (const f of ["src/pages/launch/LaunchPage.tsx", "src/pages/launch/LaunchStory.tsx"]) {
      const src = readFileSync(f, "utf8");
      const hex = (src.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((x) => x.toLowerCase());
      expect(hex.filter((h) => !allowed.has(h)), f).toEqual([]);
    }
  });
});

describe("launch page: the offer and the analytics", () => {
  it("keeps the launch code for the sign-up, and reads it from a shared link", () => {
    expect(getLaunchCode()).toBeNull();
    render(<LaunchPage />);
    expect(getLaunchCode()).toBe(LAUNCH_CODE);
    clearLaunchCode();
    window.history.pushState({}, "", `/launch?code=${LAUNCH_CODE.toLowerCase()}`);
    expect(captureLaunchCode()).toBe(LAUNCH_CODE);
    window.history.pushState({}, "", "/");
  });

  it("every way in carries the code or is the existing booking link", () => {
    const { container } = render(<LaunchPage />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/app/") || h === CALENDLY_URL);
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const h of hrefs) expect(h === CALENDLY_URL || h.includes(`code=${LAUNCH_CODE}`)).toBe(true);
  });

  it("sends the click events with where they happened", () => {
    const { container } = render(<LaunchPage />);
    container.addEventListener("click", (e) => e.preventDefault());
    const trial = [...container.querySelectorAll("a")].filter((a) => a.textContent?.includes("Start your free 30 days"));
    const demo = [...container.querySelectorAll("a")].filter((a) => a.textContent?.includes("Book a 15-minute walkthrough"));
    expect(trial).toHaveLength(2);
    expect(demo).toHaveLength(2);
    fireEvent.click(trial[0]!);
    fireEvent.click(trial[1]!);
    fireEvent.click(demo[0]!);
    fireEvent.click(demo[1]!);
    fireEvent.click([...container.querySelectorAll("a")].find((a) => a.textContent === "Start free" && a.closest('[role="region"]'))!);
    expect(track.mock.calls).toEqual([
      ["launch_cta_trial_click", { location: "hero" }],
      ["launch_cta_trial_click", { location: "final" }],
      ["launch_cta_demo_click", { location: "hero" }],
      ["launch_cta_demo_click", { location: "final" }],
      ["launch_cta_trial_click", { location: "bar" }],
    ]);
  });

  it("dismisses the announcement bar, tells analytics, and stays dismissed", () => {
    const first = render(<LaunchPage />);
    fireEvent.click(first.getByLabelText("Dismiss launch offer"));
    expect(first.container.querySelector('[role="region"]')).toBeNull();
    expect(track).toHaveBeenCalledWith("launch_announcement_dismissed");
    first.unmount();
    const again = render(<LaunchPage />);
    expect(again.container.querySelector('[role="region"]')).toBeNull();
  });

  it("keeps a readable log of what the agents did, with no repeated lines", () => {
    const { container } = render(<LaunchPage />);
    const log = container.querySelector('[role="log"]');
    expect(log?.textContent).toContain("Sharma Traders");
    const lines = [...(log?.children ?? [])].map((c) => c.textContent);
    expect(new Set(lines).size).toBe(lines.length);
  });
});
