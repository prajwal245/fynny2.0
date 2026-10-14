import { describe, expect, it } from "vitest";
import { ledgerCsv, ledgerLine, trustedAccountsServer } from "@/lib/practice/zoho.server";
import { rowsFromTable } from "@/lib/practice/extract/table";

describe("Zoho Books ledger", () => {
  it("reads a bank-account debit as money in and a credit as money out", () => {
    expect(ledgerLine({ transaction_date: "2026-07-02", payee: "Kaveri Fashions", debit_amount: 118000, credit_amount: 0 })).toMatchObject({ moneyIn: 118000, moneyOut: 0 });
    expect(ledgerLine({ transaction_date: "2026-07-05", payee: "Office Mart", debit_amount: "0", credit_amount: "4,450.00" })).toMatchObject({ moneyIn: 0, moneyOut: 4450 });
  });

  it("falls back to debit_or_credit when amounts come as one figure", () => {
    expect(ledgerLine({ date: "2026-07-06", amount: 590, debit_or_credit: "credit" })).toMatchObject({ moneyOut: 590 });
    expect(ledgerLine({ date: "2026-07-06", amount: 0 })).toBeNull();
    expect(ledgerLine({ date: "6 Jul", debit_amount: 5 })).toBeNull();
  });

  it("writes a Tally-style ledger the extractor reads back with the same signs", () => {
    const csv = ledgerCsv([
      { date: "2026-07-02", particulars: 'Kaveri, "Fashions"', type: "Receipt", number: "RC-1", moneyIn: 118000, moneyOut: 0 },
      { date: "2026-07-05", particulars: "Office Mart", type: "Payment", number: "PY-1", moneyIn: 0, moneyOut: 4450 },
    ]);
    const table = csv.trim().split("\n").map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.slice(0, 6).map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
    const rows = rowsFromTable(table, "books")!;
    expect(rows.map((r) => [r.date, r.direction, r.amount])).toEqual([
      ["2026-07-02", "in", 118000],
      ["2026-07-05", "out", 4450],
    ]);
  });

  it("only trusts Zoho's own sign-in servers", () => {
    expect(trustedAccountsServer("https://accounts.zoho.in")).toBe("https://accounts.zoho.in");
    expect(trustedAccountsServer("https://accounts.zoho.eu/")).toBe("https://accounts.zoho.eu");
    expect(trustedAccountsServer("https://accounts.zoho.in.evil.com")).toBeNull();
    expect(trustedAccountsServer("http://169.254.169.254")).toBeNull();
  });
});
