import { describe, expect, it } from "vitest";
import { chooseSheet } from "@/lib/practice/extract/sheets";
import { rowsFromTable } from "@/lib/practice/extract/table";

const HEAD = [
  "Txn Date",
  "Value Date",
  "Description",
  "Ref No./Cheque No.",
  "Debit",
  "Credit",
  "Balance",
];
const preamble = [
  ["State Bank of India"],
  ["Account Name : THE MOON"],
  ["Account Statement from 1 Apr 2025 to 30 Apr 2025"],
  [""],
];
const line = (d: string, desc: string, dr: string, cr: string, bal: string) => [
  d,
  d,
  desc,
  "",
  dr,
  cr,
  bal,
];

describe("Excel workbooks with several sheets", () => {
  const s1 = {
    name: "Sheet1",
    rows: [
      ...preamble,
      HEAD,
      line(
        "01 Apr 2025",
        "UPI/CR/412345678901/ASHA",
        "",
        "1,500.00",
        "1,01,500.00",
      ),
      line(
        "02 Apr 2025",
        "UPI/DR/412345678902/RENT",
        "25,000.00",
        "",
        "76,500.00",
      ),
    ],
  };
  // later pieces of the same table: no header row, amounts as text with Indian commas
  const s2 = {
    name: "Sheet2",
    rows: [
      line(
        "03 Apr 2025",
        "NEFT-SBIN525123456789-ACME",
        "",
        "1,20,000.00",
        "1,96,500.00",
      ),
      line("04 Apr 2025", "ATM WDL", "10,000.00", "", "1,86,500.00"),
    ],
  };
  const s3 = {
    name: "Sheet3",
    rows: [
      HEAD,
      line("05 Apr 2025", "CHQ 004512 CLG", "5,000.00", "", "1,81,500.00"),
    ],
  };

  it("joins a bank statement cut over several sheets, with or without repeated headers", () => {
    const c = chooseSheet([s1, s2, s3], "The Moon", "bank")!;
    const rows = rowsFromTable(c.sheet.rows, "bank")!;
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.description.includes("ACME"))?.amount).toBe(
      120000,
    );
    expect(c.note).toContain("joined");
  });

  it("reads the Bank Book sheet, not the TDS challans, of a books workbook", () => {
    const tds = {
      name: "TDS Challans",
      rows: [
        ["Deductee", "PAN", "Section", "Date", "TDS Amount", "TDS Deducted"],
        ["A", "AAAAA1111A", "194C", "07-04-2025", "1000", "1000"],
      ],
    };
    const book = {
      name: "Bank Book",
      rows: [
        ["The Moon"],
        ["Bank Book 1-Apr-2025 to 30-Apr-2025"],
        ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
        ["01-04-2025", "Asha", "Receipt", "1", "1500.00", ""],
        ["02-04-2025", "Rent", "Payment", "2", "", "25000.00"],
      ],
    };
    const c = chooseSheet([book, tds], "The Moon", "books")!;
    expect(c.sheet.name).toBe("Bank Book");
    const c2 = chooseSheet([tds, book], "The Moon", "books")!;
    expect(c2.sheet.name).toBe("Bank Book");
  });

  it("obeys a sheet the person chose", () => {
    expect(
      chooseSheet([s1, s2, s3], "The Moon", "bank", "Sheet2")!.sheet.name,
    ).toBe("Sheet2");
  });
});
