// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mentionsClient, selectSheet } from "@/lib/practice/extract/sheets";
import { loadSheetReader, loadSheetsReader } from "@/lib/practice/files.server";
import { runExtract } from "@/lib/practice/extract/pipeline";

const H = ["Date", "Particulars", "", "Vch Type", "Vch No.", "Debit", "Credit"];
const sheetOf = (company: string, party: string) => [[company], ["HDFC Bank"], ["1-Nov-2026 to 30-Nov-2026"], H, ["2-Nov-2026", "To", party, "Receipt", "1", "50,000.00", ""], ["5-Nov-2026", "By", "Rao Steels", "Payment", "2", "", "20,000.00"]];
const book = (...sheets: [string, string[][]][]) => {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
};

describe("choosing the sheet of a multi-sheet Excel file", () => {
  it("matches the client's name ignoring legal words, and needs every word", () => {
    expect(mentionsClient(sheetOf("KAVERI TRADERS PVT LTD", "x"), "Kaveri Traders")).toBe(true);
    expect(mentionsClient(sheetOf("Tarangini Traders", "x"), "Kaveri Traders")).toBe(false);
    expect(mentionsClient(sheetOf("Kaveri", "x"), "Kaveri Traders")).toBe(false);
    expect(mentionsClient(sheetOf("Kaveri Traders", "x"), null)).toBe(false);
  });
  it("one sheet is read as it is, with nothing to say", () => {
    const c = selectSheet([{ name: "Sheet1", rows: sheetOf("Anyone", "x") }], "Kaveri Traders")!;
    expect(c.note).toBeNull();
  });
  it("the latest sheet for the client wins, and the note says what was and was not read", () => {
    const c = selectSheet([
      { name: "Sheet1", rows: sheetOf("Kaveri Traders", "Oct party") },
      { name: "Sheet3", rows: sheetOf("Tarangini Traders", "Other") },
      { name: "Sheet6", rows: sheetOf("Kaveri Traders", "Nov party") },
    ], "Kaveri Traders")!;
    expect(c.sheet.name).toBe("Sheet6");
    expect(c.note).toMatch(/3 sheets/);
    expect(c.note).toMatch(/other 2 sheets were not read/);
  });
  it("when no sheet names the client, the last sheet is read and the person is told to check", () => {
    const c = selectSheet([{ name: "A", rows: sheetOf("X", "1") }, { name: "B", rows: sheetOf("Y", "2") }], "Kaveri Traders")!;
    expect(c.sheet.name).toBe("B");
    expect(c.note).toMatch(/none of them names Kaveri Traders/);
  });
});

describe("a real multi-sheet workbook through the pipeline (Tarangini's sheet must not be read as Kaveri)", () => {
  const bytes = book(["Sheet1", sheetOf("Tarangini Traders", "Tarangini customer")], ["Sheet2", sheetOf("Kaveri Traders", "Kaveri customer")]);
  const input = { bytes, filename: "HDFC.xlsx", mime: null, side: "books" as const, businessId: "b1", clientName: "Kaveri Traders", clientGstin: null };
  it("reads the sheet that names the client", async () => {
    const out = await runExtract(input, { sheetRows: await loadSheetReader(), sheetsAll: await loadSheetsReader() });
    expect(out.error).toBeNull();
    expect(out.rows.map((r) => r.description)).toContain("Kaveri customer");
    expect(out.rows.map((r) => r.description)).not.toContain("Tarangini customer");
    expect(out.note).toMatch(/2 sheets/);
  });
  it("the old behaviour (first sheet only) would have read the wrong company", async () => {
    const out = await runExtract(input, { sheetRows: await loadSheetReader() });
    expect(out.rows.map((r) => r.description)).toContain("Tarangini customer");
  });
});
