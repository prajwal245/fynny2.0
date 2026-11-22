import { describe, expect, it } from "vitest";
import {
  rowsFromSplitCellText,
  rowsFromStatementText,
} from "@/lib/practice/extract/textStatement";

/**
 * Indian Bank prints an overdraft or cash-credit account with every cell on its own line: dates in two pieces, the last digit of an
 * amount or balance wrapped onto the next line, a Dr beside a debit and nothing beside a credit. All figures below are invented.
 */
const HEADER = [
  "Value",
  "Date",
  "Post",
  "Date",
  "Remitter",
  "Branch",
  "Description  Cheque No  DR  CR  Balance",
];
const day = (d: string) => [`${d}/04`, "/2026", `${d}/04`, "/2026"];
const STATEMENT = [
  "Page No:1",
  "STATEMENT OF ACCOUNT from 01/04/2026 to 30/04/2026 for Account Number 1234567890.",
  "INDIAN BANK",
  ...HEADER,
  "BALANCE B/F",
  "1000000.0",
  "0DR",
  ...day("01"),
  "CITYBR",
  "WITHDRAWAL",
  "TRANSFER",
  "NEFT/XXXX/REF1",
  "Amt.",
  "5,000.00",
  "Charges.  2.50",
  "TRANSFER TO",
  "111",
  "5002.50 Dr  1005002.5",
  "0DR",
  ...day("02"),
  "CITYBR",
  "BY TRANSFER",
  "RTGS/YYYY/REF2",
  "TRANSFER FROM",
  "222",
  "200000.0",
  "0",
  "805002.5",
  "0DR",
  "Page No:2",
  "STATEMENT OF ACCOUNT from 01/04/2026 to 30/04/2026 for Account Number 1234567890.",
  ...HEADER,
  ...day("03"),
  "CITYBR",
  "DEBIT INTEREST",
  "7000.00 Dr  812002.5",
  "0DR",
  ...day("04"),
  "CITYBR",
  "BY TRANSFER",
  "RTGS/ZZZ/REF4",
  "TRANSFER FROM",
  "333",
  "100000.",
  "00",
  "712002.50",
  "DR",
].join("\n");

describe("split-cell overdraft statement", () => {
  const r = rowsFromSplitCellText(STATEMENT);

  it("reads every line across a page break, with its date, amount and direction", () => {
    expect(r.rows.map((x) => [x.date, x.amount, x.direction])).toEqual([
      ["2026-04-01", 5002.5, "out"],
      ["2026-04-02", 200000, "in"],
      ["2026-04-03", 7000, "out"],
      ["2026-04-04", 100000, "in"],
    ]);
  });

  it("proves each direction from the running balance, an overdrawn balance being negative", () => {
    expect(r.verifiedShare).toBe(1);
    expect(
      r.rows.every(
        (x) => x.parse_confidence >= 0.9 && x.parse_issues.length === 0,
      ),
    ).toBe(true);
    expect(r.rows.map((x) => x.balance)).toEqual([
      -1005002.5, -805002.5, -812002.5, -712002.5,
    ]);
  });

  it("keeps the narration and leaves the page header out of it", () => {
    expect(r.rows[0]!.description).toContain("NEFT/XXXX/REF1");
    expect(r.rows[2]!.description).toBe("CITYBR DEBIT INTEREST");
    expect(
      r.rows.some((x) =>
        /STATEMENT OF ACCOUNT|Page No|Remitter/.test(x.description ?? ""),
      ),
    ).toBe(false);
  });

  it("takes the amount from beside the balance, not from a figure in the narration", () => {
    expect(r.rows[0]!.amount).toBe(5002.5); // the narration also prints 5,000.00 and 2.50
  });

  it("flags a line whose balance does not follow instead of guessing", () => {
    const broken = STATEMENT.replace("805002.5\n0DR", "905002.5\n0DR");
    const b = rowsFromSplitCellText(broken);
    expect(b.verifiedShare).toBeLessThan(1);
    const bad = b.rows.find((x) => x.date === "2026-04-02")!;
    expect(bad.parse_confidence).toBeLessThan(0.9);
    expect(bad.parse_issues.join(" ")).toMatch(/does not move/);
  });

  it("finds nothing in a statement of any other layout, so it can never change how those are read", () => {
    const ordinary = [
      "Date Narration Debit Credit Balance",
      "01-04-2026 NEFT CR ACME 0.00 5,000.00 55,000.00",
      "02-04-2026 UPI DR SHOP 1,200.00 0.00 53,800.00",
    ].join("\n");
    expect(rowsFromSplitCellText(ordinary).rows).toHaveLength(0);
    expect(rowsFromStatementText(ordinary).rows.length).toBeGreaterThan(0);
  });
});
