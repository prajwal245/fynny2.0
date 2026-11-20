/**
 * Real-file gate for the FY 2025-26 data a CA firm shares: the GST ledger reports, the Tally Trial Balance with masters and the Day Book.
 * Runs only when REAL_FY2526 points at the folder (never committed). Holds no client figures: it asserts structure, counts and the relations the
 * product must reproduce (reports add up, the trial balance difference is the one Tally quotes, every paid challan is in the books).
 *
 *   REAL_FY2526=/tmp/s2 npx vitest run tests/unit/practice/real-fy2526.test.ts
 *
 * Files: itc3b2b.xlsx itcutil.xlsx challans.xlsx credliab.xlsx tb.xlsx daybook.xlsx g3b.xlsx
 */
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  detectLedgerFile, readItcReport, proveItcReport, readItcUtil, readChallans, readFilingStatus, readCreditLiability, creditLedgerLoop, inputCreditLedgers,
  cashLedgerLoop, matchChallansToBooks, challanFlags, readGstr3bPayment,
} from "@/lib/practice/gst/ledgers";
import { readTrialBalance, readLedgerMasters, trialBalanceIntegrity, tbAgainstMasters } from "@/lib/practice/review/trialBalance";
import { readDayBookVouchers } from "@/lib/practice/review/dayBook";
import { ageingReport } from "@/lib/practice/review/ageingReport";
import { buildPartyMaster } from "@/lib/practice/review/partyMaster";
import { read26as, prove26as, booksTds, compareTds, matchDeductors } from "@/lib/practice/tax/tds";
import { pdfText } from "@/lib/practice/files.server";

const DIR = process.env["REAL_FY2526"];
const has = (f: string) => Boolean(DIR && existsSync(`${DIR}/${f}`));
const sheets = (f: string) => { const wb = XLSX.read(readFileSync(`${DIR}/${f}`), { type: "buffer", raw: false }); return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }) })); };
const pick = (f: string, kind: string) => { const sh = sheets(f); const d = detectLedgerFile(sh).find((x) => x.kind === kind); expect(d, `${f} has no ${kind} sheet`).toBeTruthy(); return sh.find((s) => s.name === d!.sheet)!.rows; };

describe.skipIf(!DIR || !has("tb.xlsx"))("FY 2025-26 real files", () => {
  it("every file is recognised by its content", () => {
    expect(detectLedgerFile(sheets("itc3b2b.xlsx")).map((x) => x.kind)).toEqual(["itc_report"]);
    expect(detectLedgerFile(sheets("itcutil.xlsx")).map((x) => x.kind)).toEqual(["itc_util"]);
    expect(detectLedgerFile(sheets("challans.xlsx")).map((x) => x.kind)).toEqual(["challans", "filing_status"]);
    expect(detectLedgerFile(sheets("credliab.xlsx")).map((x) => x.kind)).toContain("credit_liability");
    expect(detectLedgerFile(sheets("tb.xlsx")).map((x) => x.kind)).toEqual(expect.arrayContaining(["trial_balance", "ledger_masters"]));
    expect(detectLedgerFile(sheets("daybook.xlsx")).map((x) => x.kind)).toEqual(["day_book"]);
  });

  it("the ITC report adds up and shows the excess/shortfall the CA quoted", () => {
    const rep = readItcReport(pick("itc3b2b.xlsx", "itc_report"));
    expect(rep.months).toHaveLength(12);
    const p = proveItcReport(rep);
    expect(p.checks.every((c) => c.ok)).toBe(true);
    expect(p.excess).toEqual({ igst: 186.05, cgst: -4484.49, sgst: -4484.49, cess: 0 });
  });

  it("claimed and utilised read for twelve months; the statement and filing status are complete", () => {
    const u = readItcUtil(pick("itcutil.xlsx", "itc_util"));
    expect(u.months).toHaveLength(12);
    expect(readCreditLiability(pick("credliab.xlsx", "credit_liability"))).toHaveLength(12);
    const f = readFilingStatus(pick("challans.xlsx", "filing_status"));
    expect(f.filter((x) => x.type === "GSTR3B")).toHaveLength(f.filter((x) => x.type === "GSTR1").length);
  });

  it("challans: unpaid ones are flagged, and every PAID one is a payment in the books", () => {
    const { challans, notes } = readChallans(pick("challans.xlsx", "challans"));
    expect(notes).toEqual([]);
    expect(challans.filter((c) => c.status !== "PAID").length).toBeGreaterThan(0);
    expect(challanFlags(challans, readFilingStatus(pick("challans.xlsx", "filing_status"))).length).toBeGreaterThan(0);
    const v = readDayBookVouchers(pick("daybook.xlsx", "day_book"));
    const m = matchChallansToBooks(challans, v);
    expect(m.ledgers).toHaveLength(1);
    expect(m.paidNotInBooks).toEqual([]);
    expect(m.matched).toHaveLength(challans.filter((c) => c.status === "PAID").length);
  });

  it("cash ledger loop runs on the returns the challan report covers and lists the rest as untested", () => {
    const u = readItcUtil(pick("itcutil.xlsx", "itc_util"));
    const g3 = pick("g3b.xlsx", "gstr3b_annual");
    const loop = cashLedgerLoop(readChallans(pick("challans.xlsx", "challans")).challans, readFilingStatus(pick("challans.xlsx", "filing_status")), u.months.map((m) => readGstr3bPayment(g3, m.month)));
    expect(loop.steps.length).toBeGreaterThan(0);
    // The filing status report on file lists the returns filed so far (April to September), the challan report April to July.
    expect(loop.steps.length + loop.untested.length).toBe(readFilingStatus(pick("challans.xlsx", "filing_status")).filter((f) => f.type === "GSTR3B").length);
    expect(loop.lowestBalance).toBeGreaterThanOrEqual(0);
  });

  it("credit ledger loop runs and reports a difference rather than forcing a tie", () => {
    const tb = readTrialBalance(pick("tb.xlsx", "trial_balance"));
    const u = readItcUtil(pick("itcutil.xlsx", "itc_util"));
    const inp = inputCreditLedgers(tb.ledgers);
    expect(inp.length).toBeGreaterThan(5);
    const loop = creditLedgerLoop(u, inp);
    expect(typeof loop.ok).toBe("boolean");
    expect(loop.ledgers).toHaveLength(inp.length);
  });

  it("trial balance: 439 ledgers, the difference is the one Tally quotes, masters agree ledger by ledger", () => {
    const tb = readTrialBalance(pick("tb.xlsx", "trial_balance"));
    const ms = readLedgerMasters(pick("tb.xlsx", "ledger_masters"));
    expect(tb.ledgers).toHaveLength(439);
    expect(ms.length).toBeGreaterThan(1000);
    const i = trialBalanceIntegrity(tb);
    expect(i.checks.find((c) => c.id === "tb-stated")?.ok).toBe(true);
    expect(Math.abs(i.movementDiff)).toBeLessThan(0.005);
    const a = tbAgainstMasters(tb, ms);
    expect(a.differs).toEqual([]);
    expect(a.missingInTb).toEqual([]);
  });

  it("the Day Book reads in full and every voucher balances", () => {
    const v = readDayBookVouchers(pick("daybook.xlsx", "day_book"));
    expect(v).toHaveLength(4362);
    for (const x of v) expect(Math.abs(x.legs.reduce((a, l) => a + l.debit - l.credit, 0))).toBeLessThan(0.01);
  });

  it("ageing: every debtor and creditor ties to the Trial Balance closing, to the paisa", () => {
    const tb = readTrialBalance(pick("tb.xlsx", "trial_balance")), ms = readLedgerMasters(pick("tb.xlsx", "ledger_masters"));
    const v = readDayBookVouchers(pick("daybook.xlsx", "day_book"));
    for (const side of ["debtor", "creditor"] as const) {
      const r = ageingReport(v, tb, ms, { side, asAt: "2026-03-31", fyStart: "2025-04-01", tbDate: "2026-03-31" });
      expect(r.rows.length).toBeGreaterThan(5);
      expect(r.untied).toEqual([]);
    }
  });

  it("party master: GSTIN and PAN from the masters, bill-wise parties counted", () => {
    const b = buildPartyMaster(readLedgerMasters(pick("tb.xlsx", "ledger_masters")));
    expect(b.parties.length).toBeGreaterThan(400);
    expect(b.withGstin).toBeGreaterThan(30);
    expect(b.billWise).toBeGreaterThan(0);
  });

  it.skipIf(!has("26as.pdf"))("26AS: eight deductors read, every deductor's lines add to its own total, and books are compared by section", async () => {
    const { text } = await pdfText(new Uint8Array(readFileSync(`${DIR}/26as.pdf`)));
    const a = read26as(text);
    expect(a.deductors).toHaveLength(8);
    expect(prove26as(a).every((c) => c.ok)).toBe(true);
    const tb = readTrialBalance(pick("tb.xlsx", "trial_balance"));
    const led = tb.ledgers.filter((l) => /tds receivable|tcs receivable/i.test(l.group)).map((l) => l.name);
    const books = booksTds(readDayBookVouchers(pick("daybook.xlsx", "day_book")), led, { start: "2025-04-01", end: "2026-03-31" });
    const cmp = compareTds(a, books);
    expect(cmp.rows.length).toBeGreaterThanOrEqual(3);
    expect(cmp.as26Total).toBe(a.deductors.reduce((n, d) => n + d.tax, 0));
    expect(matchDeductors(a, books).matches.filter((m) => m.parties.length).length).toBeGreaterThanOrEqual(6);
  });
});
