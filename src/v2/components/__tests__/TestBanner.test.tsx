import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { isQaMode } from "@/lib/qa";

let firm: { isTest?: boolean } | null = { isTest: true };
vi.mock("../../store", () => ({ useV2: () => ({ firm }) }));

import { TestBanner } from "../TestBanner";

beforeEach(() => {
  localStorage.clear();
  firm = { isTest: true };
});
afterEach(() => localStorage.clear());

describe("the test account banner", () => {
  it("shows on a test firm and keeps analytics off", () => {
    render(<TestBanner />);
    expect(screen.getByTestId("test-banner")).toBeTruthy();
    expect(isQaMode()).toBe(true);
  });

  it("is gone once the firm is marked real, and analytics come back", async () => {
    const { rerender } = render(<TestBanner />);
    expect(isQaMode()).toBe(true);
    firm = { isTest: false };
    rerender(<TestBanner />);
    await waitFor(() => expect(screen.queryByTestId("test-banner")).toBeNull());
    expect(isQaMode()).toBe(false);
  });

  it("does not show on a real firm, and leaves a founder's own QA mode alone", () => {
    firm = { isTest: false };
    localStorage.setItem("fynhelp.qa", "1");
    render(<TestBanner />);
    expect(screen.queryByTestId("test-banner")).toBeNull();
    expect(isQaMode()).toBe(true);
  });
});
