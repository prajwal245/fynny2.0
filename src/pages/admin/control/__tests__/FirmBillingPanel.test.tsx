import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const view = {
  isTest: false, isDemo: false, plan: "starter", cycle: "monthly", status: "active", periodEnd: "2026-12-01", cancelAtPeriodEnd: false, scheduled: null, onTrial: false, route: "razorpay",
  usage: { month: "2026-11", activeClients: 12, documents: 300 },
  charges: [{ month: "2026-10", activeClients: 30, documents: 900, extraClients: 5, overageBlocks: 0, subtotal: 745, total: 879, method: "addon", status: "failed", payUrl: null }],
  credits: { balance: 120, monthly: 100, recent: [] },
};
const setPlan = vi.fn(async () => ({ route: "razorpay", timing: "now", endsAt: null }));
const adjust = vi.fn(async () => ({ balance: 620 }));
vi.mock("@/lib/admin/admin.functions", () => ({
  adminFirmBilling: vi.fn(async () => view),
  adminSetFirmPlan: (a: unknown) => setPlan(a as never),
  adminAdjustCredits: (a: unknown) => adjust(a as never),
  adminWaiveCharge: vi.fn(async () => ({ month: "2026-10" })),
}));
vi.mock("@/components/admin/adminClient", () => ({ adminCall: (f: () => Promise<unknown>) => f(), adminError: (e: unknown) => String(e) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FirmBillingPanel } from "../FirmBillingPanel";

const mount = (canAdjust = true) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FirmBillingPanel firmId="f1" canAdjust={canAdjust} /></QueryClientProvider>);

describe("the admin plan, credits and usage panel", () => {
  it("shows the plan, usage against the limits and the credit balance", async () => {
    mount();
    expect(await screen.findByTestId("firm-plan-summary")).toHaveProperty("textContent", expect.stringContaining("Essential"));
    expect(screen.getByTestId("firm-usage-clients").textContent).toContain("12 / 25");
    expect(screen.getByTestId("firm-credits").textContent).toContain("120");
  });

  it("hides the change buttons without the billing.adjust permission", async () => {
    mount(false);
    await screen.findByTestId("firm-billing");
    expect(screen.queryByTestId("open-change-plan")).toBeNull();
    expect(screen.queryByTestId("waive-2026-10")).toBeNull();
  });

  it("needs a reason, then a second click, before a plan change is sent", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("open-change-plan"));
    fireEvent.change(screen.getByTestId("plan-select"), { target: { value: "professional" } });
    expect((screen.getByTestId("plan-review") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("plan-preview").textContent).toMatch(/pro-rated/);
    fireEvent.change(screen.getByTestId("plan-reason"), { target: { value: "Asked for an upgrade by phone" } });
    fireEvent.click(screen.getByTestId("plan-review"));
    expect(setPlan).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId("plan-confirm"));
    await waitFor(() => expect(setPlan).toHaveBeenCalledTimes(1));
    expect(setPlan.mock.calls[0]?.[0]).toMatchObject({ data: { firmId: "f1", plan: "professional", cycle: "monthly", endsOn: null } });
  });

  it("previews the new balance, refuses taking back more than the balance, and sends a signed amount", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("open-adjust-credits"));
    fireEvent.change(screen.getByTestId("credits-amount"), { target: { value: "500" } });
    fireEvent.change(screen.getByTestId("credits-reason"), { target: { value: "Goodwill after outage" } });
    expect(screen.getByTestId("credits-preview").textContent).toContain("120 → 620");
    fireEvent.click(screen.getByTestId("credits-take"));
    expect(screen.getByTestId("credits-preview").textContent).toMatch(/only 120/);
    expect((screen.getByTestId("credits-review") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("credits-add"));
    fireEvent.click(screen.getByTestId("credits-review"));
    fireEvent.click(await screen.findByTestId("credits-confirm"));
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(1));
    expect(adjust.mock.calls[0]?.[0]).toMatchObject({ data: { firmId: "f1", delta: 500, reason: "Goodwill after outage" } });
  });

  it("offers manual assignment for a paying firm only after an explicit Razorpay confirmation", async () => {
    setPlan.mockClear();
    mount();
    fireEvent.click(await screen.findByTestId("open-change-plan"));
    fireEvent.click(screen.getByTestId("plan-mode-manual"));
    fireEvent.change(screen.getByTestId("plan-select"), { target: { value: "scale" } });
    fireEvent.change(screen.getByTestId("plan-reason"), { target: { value: "Pilot partner, invoiced offline" } });
    expect(screen.getByTestId("plan-ends")).toBeTruthy();
    expect((screen.getByTestId("plan-review") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("plan-end-razorpay"));
    fireEvent.click(screen.getByTestId("plan-review"));
    fireEvent.click(await screen.findByTestId("plan-confirm"));
    await waitFor(() => expect(setPlan).toHaveBeenCalledTimes(1));
    expect(setPlan.mock.calls[0]?.[0]).toMatchObject({ data: { plan: "scale", mode: "manual", endRazorpay: true } });
  });
});
