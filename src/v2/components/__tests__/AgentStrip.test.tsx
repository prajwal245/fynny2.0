// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AgentStrip } from "../Today";

beforeAll(() => {
  (globalThis as Record<string, unknown>).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
});
afterEach(cleanup);

const idle = { extract: { count: 0 }, recon: { count: 0 }, narrate: { count: 0 }, chaser: { count: 0 } };

describe("agent strip", () => {
  it("is quiet when nothing runs and says when each agent last worked", () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    render(<AgentStrip live={idle} last={{ extract: at }} />);
    expect(screen.getByRole("status").textContent).toContain("Last run 5m ago");
    expect(screen.getByRole("status").textContent).toContain("Ready");
    expect(screen.getByRole("status").textContent).not.toContain("working");
  });

  it("shows which agent is working and on what", () => {
    render(<AgentStrip live={{ ...idle, recon: { count: 1, what: "Matching bank lines to the books" } }} last={{}} />);
    const box = screen.getByRole("status").textContent ?? "";
    expect(box).toContain("Recon working");
    expect(box).toContain("Matching bank lines to the books");
  });
});
