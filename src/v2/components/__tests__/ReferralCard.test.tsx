// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const overview = vi.fn();
vi.mock("@/lib/practice/practice.functions", () => ({ referralOverview: () => overview() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReferralCard } from "../ReferralCard";

const base = { code: "FHK7M2QX", monthsEarned: 0, monthsPending: 0, yearlyLimit: 12, referrals: [], referredBy: null };
afterEach(cleanup);

describe("Referral card", () => {
  it("shows the code, the link and how the reward works", async () => {
    overview.mockResolvedValue(base);
    render(<ReferralCard />);
    expect(await screen.findByLabelText("Your referral code")).toHaveProperty("textContent", "FHK7M2QX");
    expect(screen.getByText(/you both get one extra month/)).toBeTruthy();
    expect(screen.getByText(/\?ref=FHK7M2QX/)).toBeTruthy();
    expect(screen.getByText(/Share on WhatsApp/).closest("a")?.getAttribute("href")).toContain("https://wa.me/?text=");
  });
  it("lists each referred firm with where it stands, and the months earned", async () => {
    overview.mockResolvedValue({
      ...base, monthsEarned: 1, monthsPending: 1,
      referrals: [
        { id: "1", firmName: "Nair Associates", status: "qualified", joinedAt: "2026-10-20T00:00:00Z", qualifiedAt: "2026-10-22T00:00:00Z" },
        { id: "2", firmName: "Iyer & Co", status: "signed_up", joinedAt: "2026-10-24T00:00:00Z", qualifiedAt: null },
      ],
      referredBy: { firmName: "Rao & Co", status: "signed_up" },
    });
    render(<ReferralCard />);
    await waitFor(() => expect(screen.getByText("Nair Associates")).toBeTruthy());
    expect(screen.getByText("Free month earned")).toBeTruthy();
    expect(screen.getByText(/Waiting for their first client/)).toBeTruthy();
    expect(screen.getByText("1 free month earned")).toBeTruthy();
    expect(screen.getByText(/You joined with Rao & Co's code/)).toBeTruthy();
  });
  it("stays out of the way if it cannot load", async () => {
    overview.mockRejectedValue(new Error("offline"));
    const { container } = render(<ReferralCard />);
    await waitFor(() => expect(overview).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
