// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DueText, KindBadge, OwnerChip, WorkBadge } from "@/v2/components/ExceptionHandling";
import { CloseSummary } from "@/v2/components/CloseChecklist";
import { StatementCheckCard } from "@/v2/components/StatementCheckCard";

describe("exception handling pieces", () => {
  it("shows who has it, or plainly says nobody does", () => {
    const { rerender } = render(<OwnerChip name={null} />);
    expect(screen.getByText("Unassigned")).toBeTruthy();
    rerender(<OwnerChip name="Asha Rao" you />);
    expect(screen.getByText("You")).toBeTruthy();
    rerender(<OwnerChip name="Ravi Menon" />);
    expect(screen.getByText("Ravi Menon")).toBeTruthy();
  });
  it("names the kind, status and a late due date", () => {
    render(<><KindBadge e={{ kind: "gst_mismatch", kindWhy: "x" }} /><WorkBadge e={{ workStatus: "query_sent", reviewState: "returned" }} /><DueText date="2020-01-01" /></>);
    expect(screen.getByText("GST mismatch")).toBeTruthy();
    expect(screen.getByText("Query sent")).toBeTruthy();
    expect(screen.getByText("Returned")).toBeTruthy();
    expect(screen.getByText(/late/)).toBeTruthy();
  });
});

describe("close summary", () => {
  it("shows progress and keeps the two closure states apart", () => {
    render(<CloseSummary state="bank_books_closed" done={4} total={10} bankBooks />);
    // The state badge and the two-state line both name it: one says where the month is, the other what is done.
    expect(screen.getAllByText("Bank and Books Closed")).toHaveLength(2);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("Fully Closed")).toBeTruthy();
  });
});

describe("statement verification on the statement card", () => {
  const base = { lines: 161, withBalance: 161, first: "2026-10-01", last: "2026-10-31", opening: 0, closing: 0, totals: { in: 0, out: 0 }, order: "oldest_first" as const, breaks: [], gaps: [], emptyMonths: [], overlap: null };
  it("says Passed, and that the summary is unavailable when the bank prints none", () => {
    render(<StatementCheckCard report={{ ...base, status: "pass", headline: "Balance follows.", checks: [] }} lineCount={161} />);
    expect(screen.getByTestId("verification-result").textContent).toBe("Verification: Passed");
  });
  it("holds a failed statement, shows why, and offers acceptance only with a reason", async () => {
    const calls: string[] = [];
    render(<StatementCheckCard report={{ ...base, status: "fail", headline: "Count differs.", checks: [{ ok: false, label: "The bank's own count", detail: "Read 160, the bank prints 161." }], bankTie: { tied: false, source: "HDFC" } }} lineCount={160} onAccept={async (n) => { calls.push(n); return null; }} />);
    expect(screen.getByTestId("verification-result").textContent).toBe("Verification: Failed");
    expect(screen.getByTestId("verification-held").textContent).toMatch(/nothing was changed or removed/);
    expect((screen.getByText("Accept with this reason") as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows an accepted failure as accepted, not as passed", () => {
    render(<StatementCheckCard report={{ ...base, status: "fail", headline: "x", checks: [], accepted: { by: "Ravi", at: "2026-11-02", note: "Page 3 blank" } }} lineCount={160} />);
    expect(screen.getByTestId("verification-result").textContent).toBe("Verification: Failed, accepted");
    expect(screen.getByTestId("verification-accepted").textContent).toMatch(/Ravi/);
    expect(screen.queryByTestId("verification-held")).toBeNull();
  });
});
