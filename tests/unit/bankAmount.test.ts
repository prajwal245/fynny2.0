import { describe, expect, it } from "vitest";
import {
  detectAmountPattern,
  directionFromSigned,
  isAmountHeader,
  isCreditHeader,
  isDebitHeader,
  normaliseAmount,
  parseMoneyCell,
  signFromType,
} from "@/lib/bankAmount";

describe("header detection", () => {
  it("recognises HDFC-style withdrawal/deposit headers", () => {
    expect(isDebitHeader("Withdrawal Amt.")).toBe(true);
    expect(isCreditHeader("Deposit Amt.")).toBe(true);
  });

  it("does not treat a balance column as the amount column", () => {
    expect(isAmountHeader("Closing Balance")).toBe(false);
    expect(isAmountHeader("Amount")).toBe(true);
  });

  it("does not treat debit/credit columns as the generic amount column", () => {
    expect(isAmountHeader("Debit Amount")).toBe(false);
  });
});

describe("signFromType", () => {
  it("reads common debit and credit words", () => {
    expect(signFromType("DR")).toBe(-1);
    expect(signFromType("Withdrawal")).toBe(-1);
    expect(signFromType("CR")).toBe(1);
    expect(signFromType("Deposit")).toBe(1);
  });

  it("returns unknown for blanks and ambiguous headers", () => {
    expect(signFromType("")).toBe(0);
    expect(signFromType(null)).toBe(0);
    expect(signFromType("DR/CR")).toBe(0);
  });
});

describe("parseMoneyCell", () => {
  it("parses Indian lakh grouping and currency prefixes", () => {
    expect(parseMoneyCell("1,00,000.00")).toEqual({ value: 100000, sign: 1 });
    expect(parseMoneyCell("Rs. 5000")).toEqual({ value: 5000, sign: 1 });
    expect(parseMoneyCell("₹ 1,234.56")).toEqual({ value: 1234.56, sign: 1 });
  });

  it("reads direction from parentheses, trailing minus and DR/CR suffixes", () => {
    expect(parseMoneyCell("(5000)")).toEqual({ value: 5000, sign: -1 });
    expect(parseMoneyCell("1,234.56-")).toEqual({ value: 1234.56, sign: -1 });
    expect(parseMoneyCell("5000.00 DR")).toEqual({ value: 5000, sign: -1 });
    expect(parseMoneyCell("2500 Cr")).toEqual({ value: 2500, sign: 1 });
  });

  it("returns zero for blanks and junk", () => {
    expect(parseMoneyCell("")).toEqual({ value: 0, sign: 0 });
    expect(parseMoneyCell("-")).toEqual({ value: 0, sign: 0 });
    expect(parseMoneyCell(null)).toEqual({ value: 0, sign: 0 });
    expect(parseMoneyCell("n/a")).toEqual({ value: 0, sign: 0 });
    expect(parseMoneyCell(0)).toEqual({ value: 0, sign: 0 });
  });
});

describe("normaliseAmount", () => {
  it("prefers separate debit/credit columns", () => {
    expect(normaliseAmount(undefined, undefined, "5000", "")).toBe(-5000);
    expect(normaliseAmount(undefined, undefined, "", "5000")).toBe(5000);
  });

  it("lets the larger side win when both columns are populated", () => {
    expect(normaliseAmount(undefined, undefined, "100", "900")).toBe(900);
    expect(normaliseAmount(undefined, undefined, "900", "100")).toBe(-900);
  });

  it("uses the type column over an unsigned amount", () => {
    expect(normaliseAmount("5000", "Debit")).toBe(-5000);
    expect(normaliseAmount("5000", "Credit")).toBe(5000);
  });

  it("lets the type column override a sign inside the cell", () => {
    expect(normaliseAmount("(5000)", "Credit")).toBe(5000);
  });

  it("falls back to the sign inside the amount cell", () => {
    expect(normaliseAmount("-5000")).toBe(-5000);
    expect(normaliseAmount("5000.00 DR")).toBe(-5000);
    expect(normaliseAmount("5000")).toBe(5000);
  });

  it("returns zero when nothing is parseable", () => {
    expect(normaliseAmount("", "", "", "")).toBe(0);
  });

  it("labels direction from the signed value", () => {
    expect(directionFromSigned(-1)).toBe("out");
    expect(directionFromSigned(1)).toBe("in");
  });
});

describe("detectAmountPattern", () => {
  it("detects HDFC withdrawal/deposit as pattern 4", () => {
    const d = detectAmountPattern(["Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]);
    expect(d.pattern).toBe(4);
    expect(d.debitIdx).toBe(2);
    expect(d.creditIdx).toBe(3);
  });

  it("detects plain debit/credit columns as pattern 2", () => {
    expect(detectAmountPattern(["Date", "Debit", "Credit"]).pattern).toBe(2);
  });

  it("detects an amount column with a type column as pattern 1", () => {
    const d = detectAmountPattern(["Date", "Amount", "Type"], [["2026-01-01", "5000", "DR"]]);
    expect(d.pattern).toBe(1);
    expect(d.typeIdx).toBe(2);
  });

  it("detects a signed amount column as pattern 3", () => {
    expect(detectAmountPattern(["Date", "Amount"], [["2026-01-01", "-5000"]]).pattern).toBe(3);
  });

  it("detects a DR/CR suffix inside the amount cell as pattern 5", () => {
    expect(detectAmountPattern(["Date", "Amount"], [["2026-01-01", "5000.00 DR"]]).pattern).toBe(5);
  });

  it("reports no pattern when no money column exists", () => {
    expect(detectAmountPattern(["Date", "Narration"]).pattern).toBeNull();
  });
});
