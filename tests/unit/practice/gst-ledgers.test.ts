import { describe, expect, it } from "vitest";
import {
  readItcReport, proveItcReport, readItcUtil, readChallans, readFilingStatus, challanFlags, readCreditLiability,
  creditLedgerLoop, inputCreditLedgers, cashLedgerLoop, matchChallansToBooks, guessTaxPaymentLedgers, fyMonthKey,
} from "@/lib/practice/gst/ledgers";

const pad = (r: (string | number)[], n: number) => [...r.map(String), ...Array(Math.max(0, n - r.length)).fill("")];

const itcRows = [
  pad(["ACME PVT LTD"], 21), pad(["GSTR-3B Vs. GSTR-2B ITC Report"], 21), pad(["2025 - 2026"], 21),
  pad(["Tax Period", "claimed"], 21), pad(["", "IGST", "CGST", "SGST", "Cess"], 21),
  pad(["April", 100, 50, 50, 0, 100, 50, 50, 0, 0, 0, 0, 0, 90, 40, 40, 0, -10, -10, -10, 0], 21),
  pad(["May", 20, 60, 60, 0, 10, 62, 62, 0, 10, -2, -2, 0, 20, 60, 60, 0, 10, -2, -2, 0], 21),
  pad(["Total", 120, 110, 110, 0, 110, 112, 112, 0, 10, -2, -2, 0, 110, 100, 100, 0, 0, -12, -12, 0], 21),
];

describe("ITC report (3B vs 2B)", () => {
  it("reads months in the financial year and proves the report's own arithmetic", () => {
    const rep = readItcReport(itcRows);
    expect(rep.months.map((m) => m.month)).toEqual(["2025-04", "2025-05"]);
    expect(rep.total?.diff.igst).toBe(10);
    const p = proveItcReport(rep);
    expect(p.checks.every((c) => c.ok)).toBe(true);
    expect(p.excess).toEqual({ igst: 10, cgst: -2, sgst: -2, cess: 0 });
  });
  it("flags a month whose difference is not claimed − 2B, and a total row that is not the sum", () => {
    const bad = itcRows.map((r) => [...r]);
    bad[5]![9] = "5"; // April IGST difference should be 0
    bad[7]![1] = "999"; // total claimed IGST
    const p = proveItcReport(readItcReport(bad));
    expect(p.checks.find((c) => c.id === "itc-diff")?.ok).toBe(false);
    expect(p.checks.find((c) => c.id === "itc-total")?.ok).toBe(false);
  });
  it("refuses a file that is not this report", () => {
    expect(readItcReport([["x"]]).notes[0]).toMatch(/not a GSTR-3B vs GSTR-2B/);
  });
  it("maps month names to the right calendar year", () => {
    expect(fyMonthKey("April", 2025)).toBe("2025-04");
    expect(fyMonthKey("Jan", 2025)).toBe("2026-01");
    expect(fyMonthKey("Mar", 2025)).toBe("2026-03");
    expect(fyMonthKey("Total", 2025)).toBeNull();
  });
});

const utilRows = [
  pad(["ACME PVT LTD"], 11), pad(["Input Tax Credit Claimed & Utilized"], 11), pad(["2025 - 2026"], 11), pad(["Month", "ITC Claimed"], 11), pad(["", "IGST", "CGST"], 11),
  pad(["April", 100, 50, 50, 0, 200, "100.00", "30", "30", "0", "160"], 11),
  pad(["May", 20, 60, 60, 0, 140, "20", "50", "50", "0", "120"], 11),
  pad(["Total", 120, 110, 110, 0, 340, 120, 80, 80, 0, 280], 11),
];

describe("ITC claimed and utilised, and the credit ledger loop", () => {
  const u = readItcUtil(utilRows);
  it("sums claimed (4C) and utilised (6.1) over the months, not from the printed total", () => {
    expect(u.claimed).toEqual({ igst: 120, cgst: 110, sgst: 110, cess: 0 });
    expect(u.utilised).toEqual({ igst: 120, cgst: 80, sgst: 80, cess: 0 });
  });
  it("closes: opening + claimed − utilised equals the Tally input ledgers' closing", () => {
    const loop = creditLedgerLoop(u, [
      { name: "Input IGST", head: "igst", opening: 5, closing: 5 },
      { name: "Input CGST", head: "cgst", opening: 0, closing: 30 },
      { name: "Input SGST", head: "sgst", opening: 0, closing: 30 },
    ]);
    expect(loop.derivedClosing).toEqual({ igst: 5, cgst: 30, sgst: 30, cess: 0 });
    expect(loop.ok).toBe(true);
  });
  it("shows the gap when Tally holds more credit than the loop gives, and calls out a negative credit", () => {
    const loop = creditLedgerLoop(u, [{ name: "Input CGST", head: "cgst", opening: 0, closing: 100 }, { name: "Input IGST", head: "igst", opening: -50, closing: -50 }]);
    expect(loop.ok).toBe(false);
    expect(loop.difference.cgst).toBe(70);
    expect(loop.notes.join(" ")).toMatch(/negative/);
  });
  it("finds the input-credit ledgers by name and leaves output, payable and expense ledgers alone", () => {
    const l = inputCreditLedgers([
      { name: "Input CGST" }, { name: "INPUT IGST @ 18% C F" }, { name: "Input Sgst CF 26-27" }, { name: "RCM CGST INPUT" },
      { name: "Output CGST" }, { name: "RCM IGST PAYABLE" }, { name: "Gst Bank Charges" }, { name: "GST PURCHASE" }, { name: "Sales" },
    ]);
    expect(l.map((x) => `${x.name}:${x.head}`)).toEqual(["Input CGST:cgst", "INPUT IGST @ 18% C F:igst", "Input Sgst CF 26-27:sgst", "RCM CGST INPUT:cgst"]);
  });
});

const chRows = [
  pad(["ACME PVT LTD"], 15), pad(["Challan Deposit Summary Report"], 15), pad(["2025 - 2026"], 15),
  pad(["Month", "CPIN", "Created Date", "Created Time", "Total IGST", "Total CGST", "Total SGST", "Total CESS", "Total Amount", "Mode", "Expiry", "Reason", "Deposit Date", "Deposit Status"], 15),
  pad(["April", "-", "-", "", "", "", "", "", "0.00", "-", "-", "-", "-", "-"], 15),
  pad(["May", "111", "21/05/2025", "10:00", 0, 500, 500, 0, 1000, "E-Payment", "05/06/2025", "AOP", "21/05/2025", "PAID"], 15),
  pad(["May", "112", "24/05/2025", "10:00", 70, 0, 0, 0, 70, "E-Payment", "08/06/2025", "AOP", "", "FAILED"], 15),
  pad(["May", "113", "24/05/2025", "10:05", 70, 0, 0, 0, 70, "E-Payment", "08/06/2025", "AOP", "24/05/2025", "PAID"], 15),
  pad(["June", "114", "02/06/2025", "10:00", 30, 0, 0, 0, 30, "E-Payment", "17/06/2025", "AOP", "", "AWAITING BANK CONFIRMATION"], 15),
  pad(["June", "115", "23/06/2025", "10:00", 0, 400, 400, 0, 800, "E-Payment", "08/07/2025", "AOP", "23/06/2025", "PAID"], 15),
  pad(["July", "116", "19/07/2025", "10:00", 10, 0, 0, 0, 10, "E-Payment", "03/08/2025", "AOP", "", "EXPIRED"], 15),
];
const stRows = [
  pad(["ACME PVT LTD"], 8), pad(["Return Filing Status Report"], 8), pad(["2025 - 2026"], 8),
  pad(["Month", "ARN", "Return Type", "Filing Status", "Filing Date"], 8),
  pad(["April", "A1", "GSTR1", "Filed", "20/05/2025"], 8), pad(["April", "A2", "GSTR3B", "Filed", "26/05/2025"], 8),
  pad(["May", "B2", "GSTR3B", "Filed", "23/06/2025"], 8),
  pad(["June", "C2", "GSTR3B", "Not Filed", ""], 8),
];

describe("challans, filing status and the cash ledger loop", () => {
  const { challans, notes } = readChallans(chRows);
  const filings = readFilingStatus(stRows);
  it("skips a month with no challan and reads status and dates", () => {
    expect(notes).toEqual([]);
    expect(challans.map((c) => `${c.cpin}:${c.status}`)).toEqual(["111:PAID", "112:FAILED", "113:PAID", "114:AWAITING", "115:PAID", "116:EXPIRED"]);
    expect(challans[0]!.deposited).toBe("2025-05-21");
  });
  it("flags failed, expired and awaiting challans and an unfiled return, with the amounts", () => {
    const f = challanFlags(challans, filings).join(" | ");
    expect(f).toMatch(/1 challan failed \(₹70\)/);
    expect(f).toMatch(/1 challan expired \(₹10\)/);
    expect(f).toMatch(/waiting for bank confirmation \(₹30\)/);
    expect(f).toMatch(/GSTR3B for 2025-06 is "Not Filed"/);
  });
  it("runs the cash ledger as a balance: deposits less what each return used, and says what it could not test", () => {
    const pay = (month: string, cash: number, rcm: number) => ({ month, paidCash: { taxable: 0, igst: 0, cgst: cash / 2, sgst: cash / 2, cess: 0 }, rcmPaidCash: { taxable: 0, igst: rcm, cgst: 0, sgst: 0, cess: 0 } });
    const loop = cashLedgerLoop(challans, filings, [pay("2025-04", 0, 100), pay("2025-05", 700, 100), pay("2025-06", 0, 0)]);
    // April return (26 May): deposits 1000 + 70 = 1070, uses 100 → 970. May return (23 Jun): deposits 800, uses 800 → 970.
    expect(loop.steps.map((s) => s.balanceAfter)).toEqual([970, 970]);
    expect(loop.untested).toEqual([]);
    expect(loop.ok).toBe(true);
    expect(loop.unpaidTotal).toBe(110);
  });
  it("goes red when a return used more cash than was ever deposited", () => {
    const loop = cashLedgerLoop(challans, filings, [{ month: "2025-04", paidCash: { taxable: 0, igst: 0, cgst: 900, sgst: 900, cess: 0 }, rcmPaidCash: { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 } }]);
    expect(loop.lowestBalance).toBeLessThan(0);
    expect(loop.ok).toBe(false);
  });
  it("does not count returns filed after the last challan in the report as zero deposits", () => {
    const later = [...filings, { month: "2025-07", type: "GSTR3B", arn: "D2", status: "Filed", date: "2025-08-20" }];
    const loop = cashLedgerLoop(challans, later, [{ month: "2025-07", paidCash: { taxable: 0, igst: 0, cgst: 5000, sgst: 5000, cess: 0 }, rcmPaidCash: { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 } }]);
    expect(loop.untested).toEqual(["2025-07"]);
    expect(loop.notes.join(" ")).toMatch(/not tested/);
  });
});

describe("challans against the books", () => {
  const { challans } = readChallans(chRows);
  const pay = (date: string, no: string, amount: number, ledger = "GST (CGST+SGST+IGST)") => ({ date, type: "Payment", no, legs: [{ ledger, debit: amount, credit: 0 }, { ledger: "Bank", debit: 0, credit: amount }] });
  it("finds the tax-payment ledger from the data and matches each PAID challan by date and amount", () => {
    const books = [pay("2025-05-21", "1", 1000), pay("2025-05-24", "2", 70), pay("2025-06-23", "3", 800), pay("2025-09-01", "9", 123)];
    expect(guessTaxPaymentLedgers(books, challans)).toEqual(["GST (CGST+SGST+IGST)"]);
    const m = matchChallansToBooks(challans, books);
    expect(m.matched).toHaveLength(3);
    expect(m.paidNotInBooks).toEqual([]);
    expect(m.booksNotPaid).toEqual([]);
    expect(m.afterReport).toBe(1);
  });
  it("reports a PAID challan with no payment, and a payment with no PAID challan", () => {
    const books = [pay("2025-05-21", "1", 1000), pay("2025-05-24", "2", 70), pay("2025-06-02", "4", 30)];
    const m = matchChallansToBooks(challans, books, ["GST (CGST+SGST+IGST)"]);
    expect(m.paidNotInBooks.map((c) => c.cpin)).toEqual(["115"]);
    expect(m.booksNotPaid).toEqual([{ date: "2025-06-02", no: "4", amount: 30 }]);
  });
});

describe("credit and liability statement", () => {
  it("reads the monthly liability and ITC figures with Indian digit grouping", () => {
    const rows = [pad(["Credit & Liability Statement"], 7), pad(["2025 - 2026"], 7), pad(["April", "14,72,836.86", "14,72,836.86", "0.00", "30,76,203.75", "30,76,203.75", "0.00"], 7), pad(["Total", "1", "1", "0", "1", "1", "0"], 7)];
    const r = readCreditLiability(rows);
    expect(r).toEqual([{ month: "2025-04", liabilityGstr1: 1472836.86, liabilityGstr3b: 1472836.86, itcClaimed: 3076203.75, itc2a: 3076203.75 }]);
  });
});

import { detectLedgerFile, missingReturns } from "@/lib/practice/gst/ledgers";
describe("which report is this file", () => {
  it("names each sheet by what it holds", () => {
    const got = detectLedgerFile([
      { name: "Sheet1", rows: chRows }, { name: "Sheet2", rows: stRows }, { name: "Sheet3", rows: [] },
    ]);
    expect(got).toEqual([{ kind: "challans", sheet: "Sheet1" }, { kind: "filing_status", sheet: "Sheet2" }]);
    expect(detectLedgerFile([{ name: "a", rows: itcRows }, { name: "b", rows: utilRows }]).map((x) => x.kind)).toEqual(["itc_report", "itc_util"]);
    expect(detectLedgerFile([{ name: "Day Book", rows: [["Date", "Particulars", "Vch Type", "Vch No.", "Debit Amount", "Credit Amount"]] }]).map((x) => x.kind)).toEqual(["day_book"]);
  });
});

describe("missing returns", () => {
  it("groups consecutive months into one line per return type", () => {
    const filed = [{ month: "2025-04", type: "GSTR1", arn: "a", status: "Filed", date: null }, { month: "2025-04", type: "GSTR3B", arn: "b", status: "Filed", date: null }];
    const out = missingReturns(filed, ["2025-04", "2025-05", "2025-06", "2025-07", "2026-01"]);
    expect(out).toEqual([
      "GSTR-1 for 2025-05 to 2025-07 are not in the filing status report.", "GSTR-1 for 2026-01 is not in the filing status report.",
      "GSTR-3B for 2025-05 to 2025-07 are not in the filing status report.", "GSTR-3B for 2026-01 is not in the filing status report.",
    ]);
  });
});
