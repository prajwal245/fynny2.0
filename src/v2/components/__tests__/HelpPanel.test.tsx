import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CATEGORY_LABEL, LIMITS, checkReport, overDailyLimit } from "@/lib/practice/reportRules";

const send = vi.fn(async (_a: unknown) => ({ id: "r1", stored: true }));
vi.mock("@/lib/practice/practice.functions", () => ({
  submitPracticeProblemReport: (a: unknown) => send(a),
  getPracticeProblemReports: vi.fn(async () => [{ id: "r0", category: "statement", summary: "ICICI missing lines", status: "looking", statusLabel: "We are looking at it", note: "Reproduced on our side.", at: "2026-11-13T10:00:00Z" }]),
}));
vi.mock("../../store", () => ({
  useV2: () => ({
    docs: [{ id: "11111111-1111-4111-8111-111111111111", name: "icici-q1.pdf", clientId: "c1", status: "Parsed" }],
    clients: [{ id: "c1", name: "Sri Logistics" }],
    period: "September 2026",
    firm: { name: "Mehta & Co" },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { HelpPanel } from "../HelpPanel";

describe("report rules", () => {
  it("asks for the one thing to fix", () => {
    expect(checkReport({ category: "", summary: "A long enough summary here" })).toMatchObject({ ok: false });
    expect(checkReport({ category: "statement", summary: "hi" })).toMatchObject({ ok: false });
    expect(checkReport({ category: "statement", summary: "ICICI shows 1,440 lines, the bank says 1,461" })).toMatchObject({ ok: true });
    expect(checkReport({ category: "statement", summary: "Short but ok" })).toMatchObject({ ok: false });
    expect(checkReport({ category: "statement", summary: "Short but ok", whatHappened: "I uploaded the PDF and the count was off." })).toMatchObject({ ok: true });
  });
  it("trims long text and limits a firm to ten a day", () => {
    const r = checkReport({ category: "other", summary: "x".repeat(500), whatHappened: "y".repeat(9000) });
    expect(r.ok && r.report.summary.length).toBe(LIMITS.summary.max);
    expect(r.ok && r.report.whatHappened.length).toBe(LIMITS.text);
    expect(overDailyLimit(9)).toBe(false);
    expect(overDailyLimit(10)).toBe(true);
    expect(Object.keys(CATEGORY_LABEL)).toContain("tally");
  });
});

describe("Settings → Help", () => {
  it("opens a guide, and shows what became of an earlier report", async () => {
    render(<HelpPanel />);
    fireEvent.click(screen.getByTestId("guide-check"));
    expect((await screen.findByText(/running balance by exactly its amount/)).textContent).toMatch(/Green/);
    expect((await screen.findByTestId("my-reports")).textContent).toContain("Reproduced on our side.");
  });

  it("sends a report with the page, the file and the importance, and confirms it", async () => {
    render(<HelpPanel />);
    const btn = screen.getByTestId("report-send") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("report-category"), { target: { value: "statement" } });
    fireEvent.change(screen.getByTestId("report-summary"), { target: { value: "ICICI shows 1,440 lines, the bank says 1,461" } });
    fireEvent.change(screen.getByTestId("report-doc"), { target: { value: "11111111-1111-4111-8111-111111111111" } });
    fireEvent.change(screen.getByTestId("report-importance"), { target: { value: "high" } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const arg = send.mock.calls[0]![0] as { data: { category: string; documentName: string; context: Record<string, unknown> } };
    expect(arg.data.category).toBe("statement");
    expect(arg.data.documentName).toBe("icici-q1.pdf (Sri Logistics)");
    expect(arg.data.context).toMatchObject({ importance: "high", period: "September 2026", firm: "Mehta & Co", documentStatus: "Parsed" });
    expect(await screen.findByTestId("report-thanks")).toBeTruthy();
  });
});
