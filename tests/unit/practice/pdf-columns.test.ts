// @vitest-environment node
import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { columnMarks, findColumns, type PdfTextItem } from "@/lib/practice/extract/pdfColumns";
import { rowsFromStatementText } from "@/lib/practice/extract/textStatement";
import { pdfText } from "@/lib/practice/files.server";

const item = (str: string, x: number, y: number, width = 50): PdfTextItem => ({ str, x, y, width });

describe("Debit and Credit columns", () => {
  const header = [item("Particulars", 70, 700, 60), item("Debit", 360, 700, 30), item("Credit", 440, 700, 34)];

  it("finds the two headers on one row, and nothing without both", () => {
    expect(findColumns(header)).not.toBeNull();
    expect(findColumns([item("Debit", 360, 700)])).toBeNull();
    expect(findColumns([item("Debit", 360, 700), item("Credit", 440, 650)])).toBeNull();
    // Bank wording: "Withdrawal Amt." and "Deposit Amt." arrive as one item each.
    expect(findColumns([item("Withdrawal Amt.", 360, 700, 70), item("Deposit Amt.", 450, 700, 60)])).not.toBeNull();
  });

  it("tags an amount by the column it sits under, right-aligned or left-aligned", () => {
    const cols = findColumns(header);
    const debitAmt = item("14,59,343.25", 330, 680, 60);
    const creditAmt = item("5,44,528.20", 416, 660, 58);
    const marks = columnMarks([...header, debitAmt, creditAmt], cols);
    expect(marks.get(debitAmt)).toBe("Dr");
    expect(marks.get(creditAmt)).toBe("Cr");
  });

  it("leaves alone figures that are under neither column, such as a balance, and text", () => {
    const cols = findColumns(header);
    const balance = item("24,35,000.00", 520, 680, 62);
    const narration = item("RTGS-MANDI 500.00 STEEL", 70, 680, 120);
    const marks = columnMarks([...header, balance, narration], cols);
    expect(marks.size).toBe(0);
  });

  it("keeps the columns for a later page that does not repeat the header", () => {
    const cols = findColumns(header);
    const onPage2 = item("2,00,000.00", 330, 760, 60);
    expect(columnMarks([onPage2], cols, false).get(onPage2)).toBe("Dr");
    expect(columnMarks([onPage2], null, false).size).toBe(0);
  });
});

describe("a statement whose balance column is cut off", () => {
  // Opening 10,000.00; +5,000.00; -2,000.50; +1,250.00; -250.25 -> 14,000... computed below.
  const lines = [
    ["01-04-2025", "RTGS-ALPHA TRADERS-INV/1", "", "5,000.00"],
    ["03-04-2025", "RTGS-BETA SUPPLIES-PO/9", "2,000.50", ""],
    ["07-04-2025", "CLG CHQ 123456 GAMMA AND CO", "", "1,250.00"],
    ["09-04-2025", "SHOP RENT BY STANDING ORDER", "250.25", ""],
    ["12-04-2025", "NEFT CR-DELTA ENTERPRISES", "", "300.00"],
  ];
  const closing = "14,299.25"; // 10,000 + 5,000 - 2,000.50 + 1,250 - 250.25 + 300
  function pdf(closingText: string): Promise<{ text: string; pages: number }> {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFontSize(9);
    doc.text("AXIS BANK LTD - STATEMENT OF ACCOUNT", 40, 40);
    doc.text("OPENING BALANCE 10,000.00", 40, 60);
    doc.text("Tran Date", 40, 90);
    doc.text("Particulars", 110, 90);
    doc.text("Debit", 330, 90);
    doc.text("Credit", 410, 90);
    doc.text("B", 560, 90); // the Balance header is cut by the page edge
    lines.forEach(([d, p, dr, cr], i) => {
      const y = 110 + i * 16;
      doc.text(d, 40, y);
      doc.text(p, 110, y);
      if (dr) doc.text(dr, 365, y, { align: "right" });
      if (cr) doc.text(cr, 445, y, { align: "right" });
      doc.text("12,34,", 560, y); // a balance cut off at the edge
    });
    doc.text(`CLOSING BALANCE ${closingText}`, 40, 110 + lines.length * 16 + 20);
    return pdfText(new Uint8Array(doc.output("arraybuffer")));
  }

  it("reads every line's direction from its column, including a narration that says CR or BY the wrong way", async () => {
    const { text } = await pdf(closing);
    const { rows, verifiedShare } = rowsFromStatementText(text);
    expect(rows.map((r) => [r.direction, r.amount])).toEqual([
      ["in", 5000],
      ["out", 2000.5],
      ["in", 1250],
      ["out", 250.25], // "BY STANDING ORDER" is in the narration; the column says debit
      ["in", 300],
    ]);
    expect(rows[0]!.description).toBe("RTGS-ALPHA TRADERS-INV/1");
    expect(rows.every((r) => r.parse_confidence >= 0.9)).toBe(true);
    expect(verifiedShare).toBe(1);
  });

  it("trusts the directions fully only when the statement adds up to its closing balance", async () => {
    const { text } = await pdf("99,999.99");
    const { rows, verifiedShare } = rowsFromStatementText(text);
    expect(rows.map((r) => r.direction)).toEqual(["in", "out", "in", "out", "in"]);
    expect(rows.every((r) => r.parse_confidence < 0.9)).toBe(true);
    expect(verifiedShare).toBe(0);
  });
});

describe("Dr and Cr printed against an amount", () => {
  it("decides the direction before any word in the narration does", () => {
    const { rows } = rowsFromStatementText(
      ["11-04-2025 RTGS-MANDI STEEL BY CHEQUE 14,59,343.25 Dr", "21-04-2025 CLG CHQ 645085 TO BANSAL 5,44,528.20 Cr"].join("\n"),
    );
    expect(rows.map((r) => r.direction)).toEqual(["out", "in"]);
  });
});
