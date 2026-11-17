// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AgentTrace, AgentWorking } from "@/v2/components/AgentTrace";

// jsdom has no IntersectionObserver; the shimmer only needs it to exist.
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };

describe("agent trace", () => {
  it("shows the first step while working and the rest as it goes, then completes them all", () => {
    vi.useFakeTimers();
    const steps = ["Reading", "Checking", "Counting"];
    const { rerender } = render(<AgentTrace agent="recon" title="Reading the month" steps={steps} everyMs={500} />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Reading the month");
    expect(screen.getByText("Reading")).toBeTruthy();
    expect(screen.queryByText("Counting")).toBeNull();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByText("Counting")).toBeTruthy();
    rerender(<AgentTrace agent="recon" title="Reading the month" steps={steps} active={false} />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Reading the month, finished");
    for (const s of steps) expect(screen.getByText(s)).toBeTruthy();
    vi.useRealTimers();
  });
  it("a saving line announces itself", () => {
    render(<AgentWorking agent="chaser" text="Saving" />);
    expect(screen.getByRole("status").textContent).toContain("Saving");
  });
});
