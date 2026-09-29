import { describe, expect, it } from "vitest";
import {
  check44AD,
  check80G,
  check80IAC,
  check80JJAA,
  checkBlockedItc,
  checkDepreciation,
  gstFilingPeriod,
  periodRange,
  priorPeriod,
  runAllChecks,
  type BankTxn,
  type ClientRow,
  type ItcRow,
} from "@/lib/caDeductions.server";

const txn = (o: Partial<BankTxn> & { id: string; amount: number }): BankTxn => ({
  date: "2026-01-10",
  description: null,
  category: null,
  type: "debit",
  ...o,
});

const salaries = (count: number, each: number, prefix: string): BankTxn[] =>
  Array.from({ length: count }, (_, i) => txn({ id: `${prefix}${i}`, amount: each, description: "Salary payout" }));

const client = (o: Partial<ClientRow> = {}): ClientRow => ({
  client_name: "Acme",
  entity_type: null,
  dpiit_number: null,
  incorporation_date: null,
  ...o,
});

describe("period helpers", () => {
  it("expands a period into a full month range", () => {
    expect(periodRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("2024-02").to).toBe("2024-02-29");
  });

  it("steps back a month across a year boundary", () => {
    expect(priorPeriod("2026-01")).toBe("2025-12");
    expect(priorPeriod("2026-05")).toBe("2026-04");
  });

  it("formats the GST filing period as MMYYYY", () => {
    expect(gstFilingPeriod("2026-03")).toBe("032026");
  });
});

describe("80JJAA — additional employee cost", () => {
  it("fires when headcount and wages both rise", () => {
    const c = check80JJAA(salaries(8, 50000, "c"), salaries(4, 50000, "p"));
    expect(c).not.toBeNull();
    expect(c!.provision).toBe("80JJAA");
    // (8*50k - 4*50k) * 30%
    expect(c!.estimated_benefit).toBe(60000);
  });

  it("does not fire for a marginal headcount change", () => {
    expect(check80JJAA(salaries(6, 50000, "c"), salaries(4, 50000, "p"))).toBeNull();
  });

  it("does not fire when total wages fell despite more rows", () => {
    expect(check80JJAA(salaries(8, 10000, "c"), salaries(4, 50000, "p"))).toBeNull();
  });

  it("ignores credits and non-payroll debits", () => {
    const current = [
      ...salaries(8, 50000, "c"),
      txn({ id: "x", amount: 900000, type: "credit", description: "Salary refund" }),
    ];
    const c = check80JJAA(current, salaries(4, 50000, "p"));
    expect(c!.estimated_benefit).toBe(60000);
  });
});

describe("44AD — presumptive taxation", () => {
  const revenue = (amount: number) => [txn({ id: "r", amount, type: "credit" })];

  it("fires for an eligible entity whose real profit exceeds 8%", () => {
    const c = check44AD(client({ entity_type: "Sole Proprietorship" }), [
      ...revenue(1000000),
      txn({ id: "d", amount: 200000 }),
    ]);
    // profit 800000 vs presumptive 80000 -> (800000-80000)*30%
    expect(c!.estimated_benefit).toBe(216000);
    expect(c!.confidence).toBe("high");
  });

  it("skips companies and LLPs", () => {
    expect(check44AD(client({ entity_type: "Private Limited Company" }), revenue(1000000))).toBeNull();
    expect(check44AD(client({ entity_type: null }), revenue(1000000))).toBeNull();
  });

  it("skips turnover at or above the Rs 2 crore ceiling", () => {
    expect(check44AD(client({ entity_type: "Partnership" }), revenue(20000000))).toBeNull();
    expect(check44AD(client({ entity_type: "Partnership" }), revenue(19999999))).not.toBeNull();
  });

  it("skips when the presumptive base is not lower than actual profit", () => {
    const c = check44AD(client({ entity_type: "HUF" }), [...revenue(1000000), txn({ id: "d", amount: 950000 })]);
    expect(c).toBeNull();
  });
});

describe("80-IAC — startup holiday", () => {
  const recent = client({ dpiit_number: "DIPP12345", incorporation_date: "2024-04-01" });

  it("requires DPIIT recognition", () => {
    expect(check80IAC(client({ incorporation_date: "2024-04-01" }), [txn({ id: "r", amount: 100, type: "credit" })], [])).toBeNull();
  });

  it("requires a valid incorporation date inside 10 years", () => {
    expect(check80IAC(client({ dpiit_number: "D1" }), [], [])).toBeNull();
    expect(
      check80IAC(client({ dpiit_number: "D1", incorporation_date: "2005-01-01" }), [txn({ id: "r", amount: 1000000, type: "credit" })], []),
    ).toBeNull();
    expect(check80IAC(client({ dpiit_number: "D1", incorporation_date: "not-a-date" }), [], [])).toBeNull();
  });

  it("estimates profit at 20% of credits without working papers", () => {
    const c = check80IAC(recent, [txn({ id: "r", amount: 1000000, type: "credit" })], []);
    expect(c!.estimated_benefit).toBe(60000); // 200000 * 30%
  });

  it("prefers gross profit from working papers", () => {
    const c = check80IAC(recent, [txn({ id: "r", amount: 1000000, type: "credit" })], [{ content: { gross_profit: 500000 } }]);
    expect(c!.estimated_benefit).toBe(150000);
  });

  it("reads gross profit from a labelled working-paper line", () => {
    const c = check80IAC(recent, [txn({ id: "r", amount: 1000000, type: "credit" })], [
      { content: { lines: [{ label: "Gross Profit", value: "Rs 4,00,000" }] } },
    ]);
    expect(c!.estimated_benefit).toBe(120000);
  });
});

describe("Section 17(5) — blocked ITC review", () => {
  const row = (o: Partial<ItcRow> & { id: string }): ItcRow => ({
    supplier_name: "Speedy Logistics",
    invoice_number: "INV-1",
    total_itc: 5000,
    itc_blocked: true,
    block_reason: "Motor vehicle",
    ...o,
  });

  it("flags business-use suppliers blocked for vehicle/personal reasons", () => {
    const c = checkBlockedItc([row({ id: "1" }), row({ id: "2", total_itc: 2500 })]);
    expect(c!.estimated_benefit).toBe(7500);
    expect(c!.confidence).toBe("low");
    expect(c!.evidence).toHaveLength(2);
  });

  it("ignores unblocked rows and unrelated block reasons", () => {
    expect(checkBlockedItc([row({ id: "1", itc_blocked: false })])).toBeNull();
    expect(checkBlockedItc([row({ id: "1", block_reason: "Supplier not filed" })])).toBeNull();
  });

  it("ignores suppliers with no business-use signal", () => {
    expect(checkBlockedItc([row({ id: "1", supplier_name: "Sunrise Spa" })])).toBeNull();
  });

  it("caps evidence at 25 rows", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ id: String(i) }));
    expect(checkBlockedItc(rows)!.evidence).toHaveLength(25);
  });
});

describe("80G — donations", () => {
  it("estimates 50% of detected donations", () => {
    const c = check80G([
      txn({ id: "1", amount: 20000, description: "Donation to relief fund" }),
      txn({ id: "2", amount: 10000, category: "Charitable" }),
    ]);
    expect(c!.estimated_benefit).toBe(15000);
  });

  it("ignores credits and unrelated debits", () => {
    expect(check80G([txn({ id: "1", amount: 20000, type: "credit", description: "Donation received" })])).toBeNull();
    expect(check80G([txn({ id: "2", amount: 20000, description: "Office supplies" })])).toBeNull();
  });
});

describe("Depreciation", () => {
  it("estimates 15% on qualifying capex above Rs 10,000", () => {
    const c = checkDepreciation([txn({ id: "1", amount: 200000, description: "Laptop purchase" })]);
    expect(c!.estimated_benefit).toBe(30000);
  });

  it("ignores small-ticket purchases at or below the threshold", () => {
    expect(checkDepreciation([txn({ id: "1", amount: 10000, description: "Laptop stand" })])).toBeNull();
  });

  it("ignores non-capital spend", () => {
    expect(checkDepreciation([txn({ id: "1", amount: 200000, description: "Advertising campaign" })])).toBeNull();
  });
});

describe("runAllChecks", () => {
  it("returns only positive-benefit findings", () => {
    const out = runAllChecks({
      client: client({ entity_type: "Sole Proprietorship" }),
      current: [
        txn({ id: "r", amount: 1000000, type: "credit" }),
        txn({ id: "d1", amount: 50000, description: "Donation to NGO" }),
        txn({ id: "d2", amount: 300000, description: "Machinery purchase" }),
      ],
      prior: [],
      itc: [],
      papers: [],
    });
    const provisions = out.map((c) => c.provision).sort();
    expect(provisions).toEqual(["44AD", "80G", "Depreciation"]);
    expect(out.every((c) => c.estimated_benefit > 0)).toBe(true);
  });

  it("returns nothing for an empty client", () => {
    expect(runAllChecks({ client: client(), current: [], prior: [], itc: [], papers: [] })).toEqual([]);
  });
});
