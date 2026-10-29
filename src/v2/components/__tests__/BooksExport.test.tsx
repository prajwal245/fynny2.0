// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fn = { zoho: vi.fn(), tally: vi.fn() };
vi.mock("@/lib/practice/practice.functions", () => ({ zohoBooksStatus: () => fn.zoho(), tallyConnectors: () => fn.tally() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const v2 = {
  period: "Sep 2026",
  clients: [{ id: "c1", name: "Sun International" }],
  clientName: () => "Sun International",
  docs: [] as { clientId: string; source?: string; side?: string }[],
  exceptions: [
    { id: "a", clientId: "c1", date: "2026-09-05", amount: -590, narration: "BANK CHARGES GST ON CHG", side: "bank", status: "open" },
    { id: "b", clientId: "c1", date: "2026-09-08", amount: 12500, narration: "UPI/CR/4455667788/Sundar Auto/INV-2603", side: "bank", status: "open" },
  ],
};
vi.mock("../../store", () => ({ useV2: () => v2, monthOf: () => "Sep 2026" }));
vi.mock("../../ui", async () => {
  const React = await import("react");
  return {
    V: { muted: "#666", gray: "#eee" },
    Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Drawer: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
    formatINR: (n: number) => `₹${n}`,
  };
});

import { BooksExportButton, resetBooksCache } from "../BooksExport";

beforeEach(() => {
  resetBooksCache();
  fn.zoho.mockReset().mockResolvedValue({ links: [] });
  fn.tally.mockReset().mockResolvedValue([]);
  v2.docs = [];
});
afterEach(cleanup);

describe("Export buttons follow what is connected", () => {
  it("offers only Zoho Books when the client is linked to Zoho", async () => {
    fn.zoho.mockResolvedValue({ links: [{ business_id: "c1" }] });
    render(<BooksExportButton clientId="c1" allPeriods />);
    expect(await screen.findByLabelText("Export to Zoho Books")).toBeTruthy();
    expect(screen.queryByLabelText("Export to Tally")).toBeNull();
  });

  it("offers only Tally when a Tally company is mapped to the client", async () => {
    fn.tally.mockResolvedValue([{ companies: [{ business_id: "c1" }] }]);
    render(<BooksExportButton clientId="c1" allPeriods />);
    expect(await screen.findByLabelText("Export to Tally")).toBeTruthy();
    expect(screen.queryByLabelText("Export to Zoho Books")).toBeNull();
  });

  it("offers both, and says how to connect, when nothing is connected", async () => {
    render(<BooksExportButton clientId="c1" allPeriods />);
    expect(await screen.findByLabelText("Export to Zoho Books")).toBeTruthy();
    expect(screen.getByLabelText("Export to Tally")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Export to Tally"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText(/no Zoho Books or Tally connection yet/)).toBeTruthy();
    expect(screen.getByLabelText("Bank ledger name in Tally")).toBeTruthy();
  });

  it("opens the Zoho files with counts when the Zoho button is used", async () => {
    render(<BooksExportButton clientId="c1" allPeriods />);
    fireEvent.click(await screen.findByLabelText("Export to Zoho Books"));
    expect(await screen.findByText(/Missing expenses · 1/)).toBeTruthy();
    expect(screen.getByText(/Missing receipts · 1/)).toBeTruthy();
  });
});
