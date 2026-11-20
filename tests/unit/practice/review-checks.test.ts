import { describe, expect, it } from "vitest";
import { readDayBookVouchers } from "@/lib/practice/review/dayBook";
import { reviewCash } from "@/lib/practice/review/cash";
import { adjustmentRegister } from "@/lib/practice/review/adjustments";
import { nearDuplicates, suggestLedgerMap } from "@/lib/practice/review/ledgerMap";

const HEAD = ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit", "Credit"];
const rows = (...r: string[][]) => [["Day Book"], HEAD, ["", "", "", "", "", "", "Amount", "Amount"], ...r];

describe("Day Book as vouchers", () => {
  it("reads legs, amounts with Dr/Cr, and narration rows", () => {
    const v = readDayBookVouchers(rows(["02-Apr-25", "Rent", "", "", "Payment", "7", "9,000.00 Dr", ""], ["", "Cash", "", "", "", "", "", "9,000.00 Cr"], ["", "BEING RENT FOR APRIL", "", "", "", "", "", ""]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ date: "2025-04-02", type: "Payment", no: "7", narration: "BEING RENT FOR APRIL" });
    expect(v[0]!.legs).toEqual([{ ledger: "Rent", debit: 9000, credit: 0 }, { ledger: "Cash", debit: 0, credit: 9000 }]);
  });
});

describe("day-wise cash", () => {
  const vs = readDayBookVouchers(rows(
    ["01-Apr-25", "Cash", "", "", "Receipt", "1", "50,000.00", ""], ["", "Customer A", "", "", "", "", "", "50,000.00"],
    ["02-Apr-25", "Supplier B", "", "", "Payment", "2", "60,000.00", ""], ["", "Cash", "", "", "", "", "", "60,000.00"],
    ["03-Apr-25", "Cash", "", "", "Receipt", "3", "250,000.00", ""], ["", "Customer C", "", "", "", "", "", "250,000.00"],
    ["03-Apr-25", "Bank", "", "", "Contra", "4", "100,000.00", ""], ["", "Cash", "", "", "", "", "", "100,000.00"],
  ));
  it("runs the balance day by day and flags a negative day", () => {
    const r = reviewCash(vs);
    expect(r.days.map((d) => [d.date, d.closing, d.flag])).toEqual([["2025-04-01", 50000, ""], ["2025-04-02", -10000, "negative"], ["2025-04-03", 140000, ""]]);
    expect(r.negativeDays).toBe(1);
    expect(r.openingAssumed).toBe(true);
    expect(reviewCash(vs, { opening: 20000 }).negativeDays).toBe(0);
  });
  it("lists a cash payment over 40A(3) and a cash receipt at 269ST, and not a contra", () => {
    const r = reviewCash(vs);
    expect(r.paymentsOverLimit.map((b) => [b.party, b.amount])).toEqual([["Supplier B", 60000]]);
    expect(r.receiptsOverLimit.map((b) => [b.party, b.amount])).toEqual([["Customer C", 250000]]);
  });
  it("adds a party's payments on one day before comparing with the limit", () => {
    const two = readDayBookVouchers(rows(["02-Apr-25", "P", "", "", "Payment", "1", "6,000.00", ""], ["", "Cash", "", "", "", "", "", "6,000.00"], ["02-Apr-25", "P", "", "", "Payment", "2", "5,000.00", ""], ["", "Cash", "", "", "", "", "", "5,000.00"]));
    expect(reviewCash(two).paymentsOverLimit[0]).toMatchObject({ party: "P", amount: 11000 });
  });
});

describe("adjustment register", () => {
  it("flags period-end, round-sum, narration and owner or suspense, and tags routine entries", () => {
    const vs = readDayBookVouchers(rows(
      ["31-Mar-26", "Director loan", "", "", "Journal", "9", "500,000.00", ""], ["", "Profit & Loss A/c", "", "", "", "", "", "500,000.00"], ["", "BEING ADJUSTMENT AS PER AUDITOR", "", "", "", "", "", ""],
      ["15-Jul-25", "Expense", "", "", "Journal", "3", "1,234.00", ""], ["", "Party", "", "", "", "", "", "1,234.00"],
      ["31-Dec-25", "Output CGST", "", "", "Journal", "1286", "1,853,064.00", ""], ["", "Input CGST", "", "", "", "", "", "1,853,064.00"],
    ));
    const r = adjustmentRegister(vs);
    expect(r.find((x) => x.no === "9")!.flags).toEqual(expect.arrayContaining(["year_end", "round_sum", "narration", "owner_or_suspense"]));
    expect(r.find((x) => x.no === "3")).toBeUndefined();
    expect(r.find((x) => x.no === "1286")!.routine).toBe("GST set-off or payment");
  });
  it("does not list a routine month-end entry on a weak flag alone", () => {
    const vs = readDayBookVouchers(rows(["30-Jun-25", "Expense", "", "", "Journal", "11", "4,321.00", ""], ["", "Party", "", "", "", "", "", "4,321.00"], ["15-Jun-25", "Expense", "", "", "Journal", "12", "20,000.00", ""], ["", "Party", "", "", "", "", "", "20,000.00"]));
    expect(adjustmentRegister(vs)).toEqual([]);
  });
  it("notices an entry reversed in the first days of the next month", () => {
    const vs = readDayBookVouchers(rows(["30-Sep-25", "Prepaid", "", "", "Journal", "5", "7,500.00", ""], ["", "Expense", "", "", "", "", "", "7,500.00"], ["02-Oct-25", "Expense", "", "", "Journal", "6", "7,500.00", ""], ["", "Prepaid", "", "", "", "", "", "7,500.00"]));
    expect(adjustmentRegister(vs).find((x) => x.no === "5")!.flags).toContain("reversed_next_period");
  });
});

describe("ledger map suggestions", () => {
  const names = ["18% Goods Purchase", "18% SUB CONTRACTOR SERVICES", "Gst Sales @ 18%", "Input CGST", "Input Cgst CF 26-27", "Output SGST", "RCM CGST PAYABLE", "RCM CGST INPUT", "GST (CGST+SGST+IGST)", "GST LATE FEE & INTREST", "BOCW CESS", "94-C Tds Receivable Fy 2021-22", "194-J TDS Payable", "Cash", "Indian Bank CA 7856871247", "GECL LOAN - 2 A/C NO 7185563880", "Round Off A/c", "Sri Mangalagiri Enterprises"];
  const m = Object.fromEntries(suggestLedgerMap(names.map((name) => ({ name }))).map((s) => [s.ledger, s]));
  it("recognises the families the blueprint lists", () => {
    expect(m["18% Goods Purchase"]).toMatchObject({ family: "purchase", rate: 18 });
    expect(m["18% SUB CONTRACTOR SERVICES"]!.family).toBe("expense");
    expect(m["Gst Sales @ 18%"]).toMatchObject({ family: "sales", rate: 18 });
    expect(m["Input CGST"]).toMatchObject({ family: "input_tax", gstHead: "cgst" });
    expect(m["Input Cgst CF 26-27"]).toMatchObject({ family: "input_tax_carry_forward", gstHead: "cgst", year: "26-27" });
    expect(m["Output SGST"]).toMatchObject({ family: "output_tax", gstHead: "sgst" });
    expect(m["RCM CGST PAYABLE"]!.family).toBe("rcm_liability");
    expect(m["RCM CGST INPUT"]!.family).toBe("rcm_input");
    expect(m["GST (CGST+SGST+IGST)"]!.family).toBe("gst_payment");
    expect(m["GST LATE FEE & INTREST"]!.family).toBe("gst_late_fee_interest");
    expect(m["BOCW CESS"]!.family).toBe("cess");
    expect(m["94-C Tds Receivable Fy 2021-22"]).toMatchObject({ family: "tds_receivable", year: "2021-22" });
    expect(m["194-J TDS Payable"]!.family).toBe("tds_payable");
    expect(m["Cash"]!.family).toBe("cash");
    expect(m["Indian Bank CA 7856871247"]!.family).toBe("bank");
    expect(m["GECL LOAN - 2 A/C NO 7185563880"]!.family).toBe("loan");
    expect(m["Sri Mangalagiri Enterprises"]!.family).toBe("party_or_other");
  });
  it("uses the group when the name says nothing, and never guesses a tax ledger from a group", () => {
    expect(suggestLedgerMap([{ name: "Furniture", group: "Fixed Assets" }])[0]!.family).toBe("party_or_other");
    expect(suggestLedgerMap([{ name: "Site Spend", group: "Direct Expenses" }])[0]).toMatchObject({ family: "expense", basis: "group" });
  });
  it("does not call CGST and SGST ledgers, or numbered loan ledgers, duplicates", () => {
    expect(nearDuplicates(["INPUT CGST CF 2025-26", "INPUT SGST CF 2025-26", "Icici Bank Loan-87015", "Icici Bank Loan-87016"])).toEqual([]);
  });
  it("reports near-duplicate ledgers but not ledgers that differ by rate", () => {
    expect(nearDuplicates(["18% SUB CONTRACTOR SERVICES", "18% SUBCONTRACTOR SERVICESS", "12% Goods Purchase", "18% Goods Purchase"])).toEqual([["18% SUB CONTRACTOR SERVICES", "18% SUBCONTRACTOR SERVICESS"]]);
  });
});
