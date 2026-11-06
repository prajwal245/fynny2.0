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
