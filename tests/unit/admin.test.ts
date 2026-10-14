import { describe, expect, it } from "vitest";
import { ipInList } from "@/lib/admin/network";
import { gstInside, ledgerRows } from "@/lib/admin/ledger";
import { can, PERMISSIONS } from "@/lib/admin/rbac";

describe("admin IP allowlist", () => {
  it("matches IPv4 addresses and CIDR ranges", () => {
    expect(ipInList("203.0.113.7", "203.0.113.0/24")).toBe(true);
    expect(ipInList("203.0.114.7", "203.0.113.0/24")).toBe(false);
    expect(ipInList("10.1.2.3", "192.168.1.1, 10.0.0.0/8")).toBe(true);
    expect(ipInList("192.168.1.2", "192.168.1.1")).toBe(false);
  });
  it("matches IPv6 and refuses junk", () => {
    expect(ipInList("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipInList("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(ipInList("not-an-ip", "0.0.0.0/0")).toBe(false);
    expect(ipInList("1.2.3.4", "1.2.3.4/99")).toBe(false);
  });
});

describe("admin roles", () => {
  it("keeps each role inside its brief", () => {
    expect(can(["support_agent"], "team.manage")).toBe(false);
    expect(can(["support_agent"], "billing.refund")).toBe(true);
    expect(can(["support_agent"], "billing.refund.unlimited")).toBe(false);
    expect(can(["finance_manager"], "firms.update")).toBe(false);
    expect(can(["finance_manager"], "coupons.manage")).toBe(true);
    expect(can(["ops_admin"], "billing.view")).toBe(false);
    expect(can(["ops_admin"], "kyc.review")).toBe(true);
    expect(PERMISSIONS.super_admin.length).toBeGreaterThan(10);
    expect(can(["user"], "dashboard.view")).toBe(false);
  });
});

describe("billing ledger", () => {
  it("splits GST out of GST-inclusive amounts", () => {
    expect(gstInside(2999)).toEqual({ gst: 457.47, net: 2541.53 });
  });
  it("lists charges and refunds, skips everything else", () => {
    const rows = ledgerRows(
      [
        { id: "1", event: "subscription.charged", ca_firm_id: "f", received_at: "2026-10-01", payload: { payload: { payment: { entity: { id: "pay_1", amount: 299900, method: "upi" } } } } },
        { id: "2", event: "admin.refund", ca_firm_id: null, received_at: "2026-10-02", payload: { refund_id: "rfnd_1", payment_id: "pay_1", amount: 25000 } },
        { id: "3", event: "subscription.halted", ca_firm_id: "f", received_at: "2026-10-03", payload: {} },
        { id: "4", event: "refund.processed", ca_firm_id: "f", received_at: "2026-10-04", payload: { payload: { refund: { entity: { id: "rfnd_2", amount: 100000, payment_id: "pay_9" } } } } },
      ],
      new Map([["f", "Firm A"]]),
    );
    expect(rows.map((r) => [r.event, r.amount, r.paymentId])).toEqual([
      ["subscription.charged", 2999, "pay_1"],
      ["admin.refund", -250, "pay_1"],
      ["refund.processed", -1000, "pay_9"],
    ]);
    expect(rows[0].firm).toBe("Firm A");
  });
});
