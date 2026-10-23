import { describe, expect, it } from "vitest";
import {
  buildAging,
  buildBalanceSheet,
  buildBankRec,
  buildCashBank,
  buildPnl,
  summariseCash,
  type BalanceSnapshot,
  type BankTxn,
  type PnlDoc,
} from "../../src/lib/caMisBuilders.server";
import {
  financialYearOf,
  MIS_CATALOG,
  resolvePeriod,
  toIsoDate,
  TYPED_MIS_KINDS,
} from "../../src/lib/caMisReports";

const NOW = new Date("2026-10-23T00:00:00Z");
const period = resolvePeriod("2026-07", "none");

const doc = (id: string, classification: string, date: string, amount: number, extra: Record<string, unknown> = {}): PnlDoc => ({
  id, original_filename: `${id}.pdf`, classification, confidence: 0.95,
  extracted: { invoice_date: date, taxable_value: amount, ...extra }, corrected: null,
});

const cell = (r: ReturnType<typeof buildPnl>, section: string, label: string, key: string) =>
  r.sections.find((s) => s.id === section)!.rows.find((x) => x.label === label)!.cells[key];

describe("period helpers", () => {
  it("derives the Indian financial year", () => {
    expect(financialYearOf("2026-03").label).toBe("2025-26");
    expect(financialYearOf("2026-04").label).toBe("2026-27");
  });
  it("resolves comparison periods", () => {
    expect(resolvePeriod("2026-01", "prev_month").comparison?.month).toBe("2025-12");
    expect(resolvePeriod("2026-07", "prev_year").comparison?.month).toBe("2025-07");
    expect(resolvePeriod("2026-07", "none").comparison).toBeNull();
  });
  it("parses document date formats", () => {
    expect(toIsoDate("2026-07-15T00:00:00Z")).toBe("2026-07-15");
    expect(toIsoDate("15/07/2026")).toBe("2026-07-15");
    expect(toIsoDate("Jul 2026")).toBe("2026-07-01");
    expect(toIsoDate("garbage")).toBeNull();
  });
});

describe("catalogue", () => {
  it("only enables the supported reports and locks the rest", () => {
    expect(TYPED_MIS_KINDS.sort()).toEqual(
      ["balance_sheet", "bank_rec", "cash_bank", "payables_aging", "pnl", "receivables_aging"].sort(),
    );
    for (const k of ["expense_analysis", "gst_summary", "tds_summary"]) {
      expect(MIS_CATALOG.find((c) => c.kind === k)?.status).toBe("locked");
    }
    expect(MIS_CATALOG[0].kind).toBe("general_mis");
  });
});

describe("buildPnl", () => {
  it("computes revenue, expenses and net profit for the month", () => {
    const r = buildPnl({
      docs: [
        doc("a", "sales_invoice", "2026-07-05", 1000),
        doc("b", "sales_invoice", "2026-07-20", 500),
        doc("c", "purchase_invoice", "2026-07-10", 400),
        doc("d", "sales_invoice", "2026-06-10", 9999), // other month
      ],
      pendingReviewCount: 0, truncated: false,
    }, period, NOW);
    expect(cell(r, "pnl", "Revenue (excl. GST)", "cur")).toBe(1500);
    expect(cell(r, "pnl", "Total expenses (excl. GST)", "cur")).toBe(400);
    expect(cell(r, "pnl", "Net profit before tax", "cur")).toBe(1100);
    expect(r.issues.some((i) => i.code === "pnl_no_gross")).toBe(true);
  });

  it("reports gross profit only when direct costs are classified", () => {
    const r = buildPnl({
      docs: [
        doc("a", "sales_invoice", "2026-07-05", 1000),
        doc("b", "purchase_invoice", "2026-07-06", 300, { category: "Raw material" }),
        doc("c", "purchase_invoice", "2026-07-07", 100, { category: "Rent" }),
      ],
      pendingReviewCount: 0, truncated: false,
    }, period, NOW);
    expect(cell(r, "pnl", "Gross profit", "cur")).toBe(700);
    expect(cell(r, "pnl", "Net profit before tax", "cur")).toBe(600);
  });

  it("errors instead of showing zeros when the month has no documents", () => {
    const r = buildPnl({ docs: [doc("d", "sales_invoice", "2026-06-10", 5)], pendingReviewCount: 0, truncated: false }, period, NOW);
    expect(r.issues.some((i) => i.level === "error")).toBe(true);
    expect(cell(r, "pnl", "Revenue (excl. GST)", "cur")).toBeNull();
  });

  it("compares with the previous month and leaves a missing comparison blank", () => {
    const p = resolvePeriod("2026-07", "prev_month");
    const withCmp = buildPnl({
      docs: [doc("a", "sales_invoice", "2026-07-05", 1200), doc("b", "sales_invoice", "2026-06-05", 1000)],
      pendingReviewCount: 0, truncated: false,
    }, p, NOW);
    expect(cell(withCmp, "pnl", "Revenue (excl. GST)", "chg")).toBe(200);
    expect(cell(withCmp, "pnl", "Revenue (excl. GST)", "pct")).toBe(20);

    const missing = buildPnl({ docs: [doc("a", "sales_invoice", "2026-07-05", 1200)], pendingReviewCount: 0, truncated: false }, p, NOW);
    expect(cell(missing, "pnl", "Revenue (excl. GST)", "prev")).toBeNull();
    expect(missing.issues.some((i) => i.code === "pnl_no_comparison")).toBe(true);
  });

  it("flags undated, low-confidence, pending and in-progress data", () => {
    const low = doc("a", "sales_invoice", "2026-07-05", 100);
    low.confidence = 0.4;
    const undated: PnlDoc = { ...doc("u", "sales_invoice", "", 50), extracted: { taxable_value: 50 } };
    const r = buildPnl({ docs: [low, undated], pendingReviewCount: 3, truncated: false }, period, new Date("2026-07-10T00:00:00Z"));
    const codes = r.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["pnl_undated", "pnl_low_confidence", "pnl_pending_review", "period_incomplete"]));
  });

  it("builds a monthly trend for the financial year with blanks for empty months", () => {
    const r = buildPnl({
      docs: [doc("a", "sales_invoice", "2026-04-05", 100), doc("b", "sales_invoice", "2026-07-05", 300)],
      pendingReviewCount: 0, truncated: false,
    }, period, NOW);
    const trend = r.sections.find((s) => s.id === "pnl_trend")!;
    expect(trend.rows).toHaveLength(4); // Apr..Jul
    expect(trend.rows[1].cells.revenue).toBeNull();
    expect(trend.rows[3].cells.revenue).toBe(300);
  });
});

const snap = (over: Partial<BalanceSnapshot> = {}): BalanceSnapshot => ({
  id: "s1", snapshot_date: "2026-07-31", cash: 100, accounts_receivable: 200, inventory: 50, fixed_assets: 600, other_assets: 50,
  total_assets: 1000, accounts_payable: 150, accrued: 50, short_term_debt: 100, long_term_debt: 200, total_liabilities: 500,
  total_equity: 500, ...over,
});

describe("buildBalanceSheet", () => {
  it("errors when no snapshot exists", () => {
    const r = buildBalanceSheet(null, null, period, NOW);
    expect(r.issues[0].level).toBe("error");
    expect(r.sections).toHaveLength(0);
  });
  it("is clean when the sheet balances", () => {
    const r = buildBalanceSheet(snap(), null, period, NOW);
    expect(r.issues.filter((i) => i.level !== "info")).toHaveLength(0);
    const check = r.sections.find((s) => s.id === "bs_capital")!.rows[1];
    expect(check.cells.cur).toBe(0);
  });
  it("flags imbalance, component mismatches and stale snapshots", () => {
    const r = buildBalanceSheet(snap({ total_equity: 450, total_assets: 900, snapshot_date: "2026-05-01" }), null, period, NOW);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["bs_assets_mismatch", "bs_stale"]));
    expect(codes).toContain("bs_unbalanced");
  });
  it("shows change against the comparison snapshot", () => {
    const p = resolvePeriod("2026-07", "prev_month");
    const r = buildBalanceSheet(snap(), snap({ id: "s0", snapshot_date: "2026-06-30", cash: 60 }), p, NOW);
    expect(r.sections[0].rows[0].cells.chg).toBe(40);
  });
});

const tx = (id: string, date: string, type: "credit" | "debit", amount: number, balance: number, extra: Partial<BankTxn> = {}): BankTxn => ({
  id, date, description: id, category: null, amount, balance, type, ...extra,
});

describe("cash & bank", () => {
  it("rolls opening, movements and closing forward", () => {
    const s = summariseCash(
      [tx("1", "2026-07-02", "credit", 500, 1500), tx("2", "2026-07-03", "debit", 200, 1300)],
      tx("0", "2026-06-30", "credit", 1, 1000),
    );
    expect(s).toMatchObject({ opening: 1000, receipts: 500, payments: 200, net: 300, closing: 1300 });
  });
  it("derives opening from the first row when there is no prior transaction", () => {
    const s = summariseCash([tx("1", "2026-07-02", "credit", 500, 1500)], null);
    expect(s.opening).toBe(1000);
  });
  it("flags a broken roll-forward and a snapshot mismatch", () => {
    const r = buildCashBank({
      txns: [tx("1", "2026-07-02", "credit", 500, 1700)],
      prior: tx("0", "2026-06-30", "credit", 1, 1000), cmpTxns: null, cmpPrior: null, accounts: [],
      snapshotCash: { value: 900, date: "2026-07-31" }, truncated: false,
    }, period, NOW);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["cash_roll_forward", "cash_vs_bs"]));
  });
  it("does not invent balances when the feed has none", () => {
    const r = buildCashBank({
      txns: [tx("1", "2026-07-02", "credit", 500, 0)], prior: null, cmpTxns: null, cmpPrior: null,
      accounts: [], snapshotCash: null, truncated: false,
    }, period, NOW);
    expect(r.sections[0].rows[0].cells.cur).toBeNull();
    expect(r.issues.some((i) => i.code === "cash_no_balances")).toBe(true);
  });
  it("errors with no transactions", () => {
    const r = buildCashBank({ txns: [], prior: null, cmpTxns: null, cmpPrior: null, accounts: [], snapshotCash: null, truncated: false }, period, NOW);
    expect(r.issues[0].level).toBe("error");
  });
});

describe("aging", () => {
  const rows = [
    { id: "1", party: "Acme", ref: "INV-1", date: "2026-06-01", due: "2026-07-20", amount: 1000, settled: 0, outstanding: 1000 }, // 11d
    { id: "2", party: "Acme", ref: "INV-2", date: "2026-03-01", due: "2026-04-01", amount: 500, settled: 100, outstanding: 400 }, // >90
    { id: "3", party: "Beta", ref: "INV-3", date: "2026-07-10", due: "2026-08-15", amount: 300, settled: 0, outstanding: 300 }, // not due
    { id: "4", party: "Beta", ref: "INV-4", date: "2026-05-01", due: null, amount: 70, settled: 0, outstanding: 70 },
    { id: "5", party: "Gamma", ref: "INV-5", date: "2026-05-01", due: "2026-06-01", amount: 90, settled: 90, outstanding: 0 }, // settled
    { id: "6", party: "Delta", ref: "INV-6", date: "2026-09-01", due: "2026-09-30", amount: 999, settled: 0, outstanding: 999 }, // after as-of
  ];
  it("buckets by days past due as at period end and excludes settled or later items", () => {
    const r = buildAging("receivable", rows, period, NOW);
    const sum = r.sections.find((s) => s.id === "aging_summary")!;
    const get = (l: string) => sum.rows.find((x) => x.label === l)!.cells.amount;
    expect(get("Not yet due")).toBe(300);
    expect(get("1–30 days")).toBe(1000);
    expect(get("Over 90 days")).toBe(400);
    expect(get("No due date")).toBe(70);
    expect(get("Total outstanding")).toBe(1770);
    const parties = r.sections.find((s) => s.id === "aging_parties")!;
    expect(parties.rows[0].label).toBe("Acme");
    expect(parties.rows[0].cells.total).toBe(1400);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["aging_no_due", "aging_snapshot"]));
  });
  it("lists only overdue invoices for receivables, oldest first", () => {
    const r = buildAging("receivable", rows, period, NOW);
    const list = r.sections.find((s) => s.id === "aging_docs")!;
    expect(list.rows.map((x) => x.label)).toEqual(["INV-2", "INV-1"]);
  });
  it("lists every unpaid bill by due date for payables", () => {
    const r = buildAging("payable", rows, period, NOW);
    const list = r.sections.find((s) => s.id === "aging_docs")!;
    expect(list.rows[0].label).toBe("INV-2");
    expect(list.rows.length).toBe(4);
  });
  it("errors when the ledger is empty", () => {
    expect(buildAging("payable", [], period, NOW).issues[0].level).toBe("error");
  });
  it("falls back to amount − settled when outstanding is null", () => {
    const r = buildAging("receivable", [{ ...rows[0], outstanding: null, settled: 400 }], period, NOW);
    expect(r.sections[0].rows.at(-1)!.cells.amount).toBe(600);
  });
});

describe("bank reconciliation", () => {
  const txns = [
    tx("1", "2026-07-02", "credit", 500, 0, { reconciled: true }),
    tx("2", "2026-07-03", "debit", 200, 0, { reconciled: false }),
    tx("3", "2026-07-04", "debit", 300, 0, { reconciled: false }),
  ];
  it("counts matched and unmatched and flags discrepancies", () => {
    const r = buildBankRec({
      txns, runs: [],
      exceptions: [{ id: "e1", reason_code: "amount_mismatch", severity: "high", status: "open", amount: 250, description: null, created_at: "2026-07-05T00:00:00Z" }],
      truncated: false,
    }, period, NOW);
    const status = r.sections.find((s) => s.id === "rec_status")!;
    expect(status.rows[1].cells).toMatchObject({ count: 1, value: 500 });
    expect(status.rows[2].cells).toMatchObject({ count: 2, value: 500, rate: 66.67 });
    const unmatched = r.sections.find((s) => s.id === "rec_unmatched")!;
    expect(unmatched.rows.map((x) => x.cells.amount)).toEqual([300, 200]);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["rec_unmatched", "rec_no_run", "rec_open_exceptions"]));
  });
  it("errors with no transactions", () => {
    expect(buildBankRec({ txns: [], runs: [], exceptions: [], truncated: false }, period, NOW).issues[0].level).toBe("error");
  });
});
