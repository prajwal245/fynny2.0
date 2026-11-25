// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/practice/practice.functions", () => ({
  getPracticeYearChecks: async () => ({
    vouchers: 10, from: {},
    checks: [
      { id: "sales_vs_gstr1", label: "Sales books against GSTR-1", status: "blocked", needs: ["the GSTR-1 report"], summary: "Not checked. Needs the GSTR-1 report.", rows: [] },
      { id: "rcm", label: "Reverse charge entries", status: "findings", needs: [], summary: "1 to look at.", rows: [{ ref: "Journal 3", detail: "Liability with no credit." }] },
      { id: "closed_by_journal", label: "Accounts closed by journal", status: "clear", needs: [], summary: "No ledger was cleared by a journal.", rows: [] },
    ],
  }),
}));

import YearChecks from "@/v2/components/YearChecks";

describe("year-end checks card", () => {
  it("shows Blocked for a missing file, never Passed, and lists the rows behind a count", async () => {
    render(<YearChecks clientId="c1" clientName="Test" />);
    await waitFor(() => expect(screen.getByTestId("year-check-rcm")).toBeTruthy());
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText(/Needs the GSTR-1 report/)).toBeTruthy();
    expect(screen.queryByText("Passed")).toBeNull();
    expect(screen.getByText(/Liability with no credit/)).toBeTruthy();
    expect(screen.getByText("2 of 3 could run")).toBeTruthy();
  });
});
