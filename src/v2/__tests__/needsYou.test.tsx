// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsYou, type NeedsYouRow } from "../components/NeedsYou";
import { deriveSteps, type CloseFacts } from "@/lib/practice/close/steps";

afterEach(cleanup);
const facts = (over: Partial<CloseFacts> = {}): CloseFacts => ({
  statements: {
    expected: 1,
    received: 1,
    verified: 1,
    held: 0,
    failed: 0,
    notAvailable: 0,
  },
  recon: { bank: 40, runDone: true },
  exceptions: { open: 3, explained: 0 },
  report: { exists: false, signedOff: false },
  confirmed: {},
  ...over,
});
const row = (id: string, name: string, f: CloseFacts): NeedsYouRow => ({
  businessId: id,
  name,
  period: "2026-10",
  steps: deriveSteps("2026-10", f),
  bankLines: f.recon.bank,
});
const NOW = new Date("2026-11-22T10:00:00Z");

describe("NeedsYou", () => {
  const rows = [
    row("a", "Alpha Traders", facts()),
    row(
      "b",
      "Beta Foods",
      facts({
        statements: {
          expected: 2,
          received: 0,
          verified: 0,
          held: 0,
          failed: 0,
          notAvailable: 0,
        },
        recon: { bank: 0, runDone: false },
      }),
    ),
  ];
  it("shows the team's work first and opens the client on click", () => {
    const open = vi.fn();
    render(<NeedsYou rows={rows} now={NOW} onOpen={open} />);
    expect(screen.getByText("Alpha Traders")).toBeTruthy();
    expect(screen.queryByText("Beta Foods")).toBeNull(); // waiting on the client, not the team
    fireEvent.click(screen.getByRole("button", { name: /Alpha Traders/ }));
    expect(open).toHaveBeenCalledWith("a");
  });
  it("lists clients that are waiting on their client under their own tab", () => {
    render(<NeedsYou rows={rows} now={NOW} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Waiting on client/ }));
    expect(screen.getByText("Beta Foods")).toBeTruthy();
  });
  it("renders nothing without clients and a calm message when nothing waits", () => {
    const { container } = render(
      <NeedsYou rows={[]} now={NOW} onOpen={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
