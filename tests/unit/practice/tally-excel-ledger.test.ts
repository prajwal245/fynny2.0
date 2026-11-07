import { describe, expect, it } from "vitest";
import { rowsFromTable } from "@/lib/practice/extract/table";

const head = ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"];
const ledger = (rows: string[][]) => [["Kaveri Traders"], ["HDFC Bank"], ["1-Nov-2026 to 30-Nov-2026"], head, ...rows];

describe("Tally ledger export (Excel)", () => {
  it("reads dated entries and leaves out undated breakdown and total lines", () => {
    const r = rowsFromTable(
      ledger([
        ["2-Nov-2026", "Sundara Textiles", "Receipt", "11", "50,000.00", ""],
        ["", "Bill 14 (part)", "", "", "30,000.00", ""],      // breakdown of the receipt above
        ["", "Output CGST", "", "", "", "4,500.00"],           // detail line
        ["5-Nov-2026", "Rao Steels", "Payment", "12", "", "20,000.00"],
        ["", "", "", "", "1,42,34,776.00", "1,42,34,776.00"],  // column totals, no label
      ]),
      "books",
    )!;
    expect(r.map((x) => x.description)).toEqual(["Sundara Textiles", "Rao Steels"]);
    expect(r.every((x) => x.date)).toBe(true);
    expect(r.some((x) => x.amount === 14234776)).toBe(false);
  });

  it("never turns opening or closing balance lines into entries", () => {
    const r = rowsFromTable(
      ledger([
        ["1-Nov-2026", "Opening Balance", "", "", "2,00,000.00", ""],
        ["2-Nov-2026", "Sundara Textiles", "Receipt", "11", "50,000.00", ""],
        ["", "By Closing Balance", "", "", "", "2,50,000.00"],
        ["", "Total", "", "", "2,50,000.00", "2,50,000.00"],
      ]),
      "books",
    )!;
    expect(r).toHaveLength(1);
    expect(r[0].description).toBe("Sundara Textiles");
  });

  it("a bank statement keeps an undated amount line for a person to look at", () => {
    const r = rowsFromTable(
      [["Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"], ["", "UPI 9988", "500.00", "", "10,000.00"]],
      "bank",
    )!;
    expect(r).toHaveLength(1);
    expect(r[0].date).toBeNull();
    expect(r[0].parse_confidence).toBeLessThan(0.5);
  });
});

describe("Tally Excel ledger with By/To and the party in the next column (retest, 6 Nov)", () => {
  // Particulars sits over two columns: "By"/"To", then the party's name under a blank heading.
  const H = ["Date", "Particulars", "", "Vch Type", "Vch No.", "Debit", "Credit"];
  const L = (rows: string[][]) => [["Kaveri Traders"], ["HDFC Bank"], ["1-Nov-2026 to 30-Nov-2026"], H, ...rows];

  it("reads the party's name, not 'By' or 'To'", () => {
    const r = rowsFromTable(L([
      ["2-Nov-2026", "To", "Sundara Textiles", "Receipt", "11", "50,000.00", ""],
      ["5-Nov-2026", "By", "Rao Steels", "Payment", "12", "", "20,000.00"],
    ]), "books")!;
    expect(r.map((x) => x.description)).toEqual(["Sundara Textiles", "Rao Steels"]);
    expect(r.map((x) => x.counterparty)).toEqual(["Sundara Textiles", "Rao Steels"]);
    expect(r.map((x) => x.direction)).toEqual(["in", "out"]);
  });

  it("the opening balance is not a transaction, even with a date and a 'By' in front of it", () => {
    const r = rowsFromTable(L([
      ["1-Nov-2026", "By", "Opening Balance", "", "", "", "3,00,000.00"],
      ["2-Nov-2026", "To", "Sundara Textiles", "Receipt", "11", "50,000.00", ""],
      ["", "By", "Closing Balance", "", "", "", "3,50,000.00"],
      ["", "", "", "", "", "3,50,000.00", "3,50,000.00"],
    ]), "books")!;
    expect(r).toHaveLength(1);
    expect(r[0].description).toBe("Sundara Textiles");
  });

  it("46 entries stay 46 (one opening line is not counted)", () => {
    const entries = Array.from({ length: 46 }, (_, i) => [`${(i % 28) + 1}-Nov-2026`, "To", `Party ${i + 1}`, "Receipt", String(i + 1), "1,000.00", ""]);
    const r = rowsFromTable(L([["1-Nov-2026", "By", "Opening Balance", "", "", "", "9,999.00"], ...entries, ["", "By", "Closing Balance", "", "", "", "9,999.00"]]), "books")!;
    expect(r).toHaveLength(46);
  });

  it("a line with no party name shows its voucher type and number", () => {
    const r = rowsFromTable(L([["3-Nov-2026", "To", "", "Receipt", "14", "1,000.00", ""]]), "books")!;
    expect(r[0].description).toBe("Receipt 14");
  });
});

describe("Tally Day Book (Excel) in bank reconciliation", () => {
  const H = ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"];
  const body = [
    ["2-Nov-2026", "Sundara Textiles", "Receipt", "1", "50,000.00", ""],
    ["3-Nov-2026", "Sundara Textiles", "Sales", "2", "1,18,000.00", ""],
    ["4-Nov-2026", "Salary", "Journal", "3", "40,000.00", "40,000.00"],
    ["5-Nov-2026", "Rao Steels", "Payment", "4", "", "20,000.00"],
    ["6-Nov-2026", "Rao Steels", "Purchase", "5", "", "40,000.00"],
  ];
  it("keeps only the receipts and payments when the file is a Day Book", () => {
    const r = rowsFromTable([["Kaveri Traders"], ["Day Book"], ["1-Nov-2026 to 30-Nov-2026"], H, ...body], "books")!;
    expect(r.map((x) => x.reference)).toEqual(["1", "4"]);
  });
  it("a bank ledger keeps every line it lists, even a Sales voucher paid straight into the bank", () => {
    const r = rowsFromTable([["Kaveri Traders"], ["HDFC Bank"], ["Ledger Account"], H, ...body], "books")!;
    expect(r).toHaveLength(5);
  });
});

describe("amounts that are really day numbers", () => {
  it("a statement whose 'amount' column repeats the day of the month is refused, not offered for Confirm all", () => {
    const rows = [["Date", "Narration", "Amount", "Dr / Cr"]];
    for (let d = 1; d <= 20; d++) rows.push([`${String(d).padStart(2, "0")}-12-2025`, `UPI ${d}`, String(d), "Dr"]);
    expect(rowsFromTable(rows, "bank")).toBeNull();
  });
  it("a real statement with ordinary amounts is read", () => {
    const rows = [["Date", "Narration", "Amount", "Dr / Cr"]];
    for (let d = 1; d <= 20; d++) rows.push([`${String(d).padStart(2, "0")}-12-2025`, `UPI ${d}`, String(d * 1000 + 250), d % 2 ? "Dr" : "Cr"]);
    expect(rowsFromTable(rows, "bank")).toHaveLength(20);
  });
});
