// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const credits = vi.fn();
vi.mock("@/lib/practice/practice.functions", () => ({
  startPracticeCreditTopUp: vi.fn(),
  confirmPracticeCreditTopUp: vi.fn(),
  savePracticeCreditSettings: vi.fn(),
  getPracticeCredits: vi.fn(),
}));
vi.mock("../../lib/credits", () => ({ useCredits: () => credits(), setCredits: vi.fn(), refreshCredits: vi.fn() }));
vi.mock("../../lib/billing", () => ({ loadRazorpay: vi.fn() }));
vi.mock("../../store", () => ({ useV2: () => ({ session: { email: "a@b.c", name: "A" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CreditsAlert, CreditsChip, CreditsPanel, TopUpModal } from "../CreditsPanel";

const packs = [
  { key: "c500", credits: 500, price: 499, label: "500 credits", totalWithGst: 588.82 },
  { key: "c2000", credits: 2000, price: 1799, label: "2,000 credits", tag: "Most popular", totalWithGst: 2122.82 },
  { key: "c5000", credits: 5000, price: 3999, label: "5,000 credits", tag: "Best value", totalWithGst: 4718.82 },
];
const view = (o: Record<string, unknown> = {}) => ({
  unmetered: false,
  balance: 320,
  monthly: 500,
  level: "ok",
  nextExpiry: { credits: 320, expiresAt: "2027-09-01T00:00:00Z" },
  packs,
  gstPercent: 18,
  paymentsReady: true,
  settings: { autoTopup: false, autoPack: "c500", autoMaxPerMonth: 2 },
  autoAvailable: true,
  recent: [{ delta: -1, reason: "spend", note: "WhatsApp reminder", at: "2026-10-20T08:00:00Z" }],
  ...o,
});
afterEach(cleanup);

describe("credits on screen", () => {
  it("the Chaser chip says how many reminders are left and opens the top-up", () => {
    credits.mockReturnValue(view());
    const add = vi.fn();
    render(<CreditsChip onAdd={add} />);
    expect(screen.getByTestId("credits-chip").textContent).toContain("~320 reminders left");
    fireEvent.click(screen.getByRole("button", { name: "Add credits" }));
    expect(add).toHaveBeenCalled();
  });

  it("warns when low, stops when out, and says nothing when fine or on a test account", () => {
    credits.mockReturnValue(view({ balance: 40, level: "low" }));
    const { rerender } = render(<CreditsAlert onAdd={() => undefined} />);
    expect(screen.getByTestId("credits-alert").textContent).toContain("Only 40 reminders left");
    credits.mockReturnValue(view({ balance: 0, level: "out" }));
    rerender(<CreditsAlert onAdd={() => undefined} />);
    expect(screen.getByTestId("credits-alert").textContent).toContain("have run out");
    expect(screen.getByTestId("credits-alert").textContent).toContain("email reminders keep going");
    credits.mockReturnValue(view());
    rerender(<CreditsAlert onAdd={() => undefined} />);
    expect(screen.queryByTestId("credits-alert")).toBeNull();
    credits.mockReturnValue(view({ unmetered: true, balance: 0, level: "out" }));
    rerender(<CreditsAlert onAdd={() => undefined} />);
    expect(screen.queryByTestId("credits-alert")).toBeNull();
    expect(screen.queryByTestId("credits-chip")).toBeNull();
  });

  it("the top-up window lists the three packs with the price per reminder and GST", () => {
    credits.mockReturnValue(view());
    render(<TopUpModal open onClose={() => undefined} />);
    const packsEl = screen.getByTestId("credit-packs");
    expect(packsEl.textContent).toContain("₹1 per reminder");
    expect(packsEl.textContent).toContain("₹0.9 per reminder");
    expect(packsEl.textContent).toContain("₹0.8 per reminder");
    expect(packsEl.textContent).toContain("₹499");
    expect(packsEl.textContent).toContain("Most popular");
  });

  it("automatic top-up is switched off with a reason on a yearly plan", () => {
    credits.mockReturnValue(view({ autoAvailable: false }));
    render(<CreditsPanel />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByTestId("auto-topup").textContent).toContain("monthly plan");
  });

  it("the settings panel shows the balance, expiry and history", () => {
    credits.mockReturnValue(view());
    render(<CreditsPanel />);
    expect(screen.getByTestId("credits-balance").textContent).toBe("320");
    expect(screen.getByTestId("credits-panel").textContent).toContain("roll over for 12 months");
    expect(screen.getByTestId("credits-history").textContent).toContain("Reminder sent");
  });

  it("a test account is shown as not charged", () => {
    credits.mockReturnValue(view({ unmetered: true, balance: 0 }));
    render(<CreditsPanel />);
    expect(screen.getByText("Test account: not charged")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add credits" })).toBeNull();
  });
});
