// @vitest-environment node
import * as XLSX from "xlsx";
import { expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

vi.mock("@/lib/practice/orchestrator.server", () => ({ startRun: async () => "r", finishRun: async () => undefined, afterExtraction: async () => ({ pipeline: [] }), afterRecon: async () => false, loadMemories: async () => [], markMemoriesApplied: async () => undefined, teachFromReview: async () => undefined }));

const bytes = (rows: (string | number)[][], name = "Sheet1") => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
};
type L = [string, number, number];
const dayBook = (vs: [string, string, string, L[]][]) => {
  const rows: (string | number)[][] = [["Day Book"], ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit Amount", "Credit Amount"]];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const tally = (d: string) => `${Number(d.slice(8))}-${MON[Number(d.slice(5, 7)) - 1]}-${d.slice(2, 4)}`;
  for (const [date, type, no, legs] of vs) legs.forEach(([n, dr, cr], i) => rows.push([i ? "" : tally(date), n, "", "", i ? "" : type, i ? "" : no, dr || "", cr || ""]));
  return rows;
};
const tbRows = (ls: [string, string, number, number, number][]) => [
  ["Trial Balance"], ["Ledger", "Group", "Primary", "Opening Dr", "Opening Cr", "Movement Dr", "Movement Cr", "Closing Dr", "Closing Cr"],
  ...ls.map(([n, g, op, mdr, mcr]) => { const cl = op + mdr - mcr; return [n, g, g, op > 0 ? op : "", op < 0 ? -op : "", mdr || "", mcr || "", cl > 0 ? cl : "", cl < 0 ? -cl : ""]; }),
];
const gstr1Rows = (docs: [string, string, number, number][]) => [
  ["GSTR-1 Report"],
  ["Original Period", "Amendment Period", "GSTIN", "Document Type", "Party Name", "Invoice No.", "Invoice Date", "RCM", "Taxable Value", "IGST", "CGST", "SGST", "CESS", "Total Invoice Value"],
  ...docs.map(([per, no, tv, igst]) => [per, "", "27ABCDE1234F1Z5", "Invoice", "Buyer", no, "10/04/2025", "N", tv, igst, 0, 0, 0, tv + igst]),
];

it("the year-end checks run from stored files and find what was planted", async () => {
  const vs: [string, string, string, L[]][] = [
    ["2025-04-10", "Sales", "1", [["Debtor A", 1180, 0], ["18% Sales", 0, 1000], ["Output IGST 18%", 0, 180]]],
    ["2025-05-10", "Sales", "2", [["Debtor A", 590, 0], ["18% Sales", 0, 500], ["Output IGST 18%", 0, 90]]],
    ["2025-06-05", "Journal", "3", [["Freight", 1000, 0], ["RCM IGST PAYABLE", 0, 50], ["Creditors", 0, 950]]],
    ["2025-06-20", "Receipt", "4", [["Bank", 800, 0], ["Old Debtor", 0, 800]]],
    ["2026-03-31", "Journal", "5", [["Cleared by JV", 0, 400], ["Misc Exp", 400, 0]]],
    ["2025-07-01", "Sales", "6", [["New Debtor", 590, 0], ["18% Sales", 0, 500], ["Output IGST 18%", 0, 90]]],
  ];
  const tb = tbRows([
    ["Debtor A", "Sundry Debtors", 0, 1770, 0], ["Old Debtor", "Sundry Debtors", 800, 0, 800], ["Dormant Advance", "Loans & Advances (Asset)", 300, 0, 0],
    ["Cleared by JV", "Sundry Debtors", 400, 0, 400], ["New Debtor", "Sundry Debtors", 0, 590, 0], ["Share Capital", "Capital Account", -100000, 0, 0],
  ]);
  // May GSTR-1 reports 400 where books show 500: a planted difference.
  const g1 = gstr1Rows([["Apr-2025", "INV1", 1000, 180], ["May-2025", "INV2", 400, 72], ["Jul-2025", "INV6", 500, 90]]);
  const files: Record<string, Uint8Array> = {
    "Satkaarika Day Book.xlsx": bytes(dayBook(vs)), "Trial Balance FY25-26.xlsx": bytes(tb), "GSTR-1 Report FY 2025-26.xlsx": bytes(g1),
  };
  const ais = "Annual Information Statement\nFinancial Year 2025-26\nGST turnover\nSale of goods   1,500.00\nSFT Information\nCash deposit Indian Bank   200,000.00\n";
  const docs: Record<string, unknown>[] = Object.keys(files).map((n, i) => ({ id: `d${i}`, ca_firm_id: "f1", business_id: "b1", original_filename: n, storage_path: `f1/b1/${n}`, side: n.startsWith("Satkaarika") ? "books" : null, extract_status: "done", extracted: { source: "Tally" }, created_at: "2026-11-20T10:00:00Z" }));
  docs.push({ id: "ais", ca_firm_id: "f1", business_id: "b1", original_filename: "AIS FY 2025-26.pdf", storage_path: null, side: null, extract_status: "done", extracted: { reference: true, reference_kind: "ais", text_preview: ais }, created_at: "2026-11-20T10:00:00Z" });
  const blobs = Object.fromEntries(Object.entries(files).map(([n, b]) => [`f1/b1/${n}`, b]));
  const { db } = memoryDb({ ca_document_extractions: docs, ca_clients: [{ id: "c1", business_id: "b1", ca_firm_id: "f1", client_name: "Test Pvt Ltd", entity_type: "company" }] }, blobs);
  const ctx = { firmId: "f1", firmName: "F", firmEmail: null, userId: "u1", role: "owner" as const };
  const { clientYearChecks } = await import("@/lib/practice/yearChecks.server");
  const r = await clientYearChecks(db, ctx, "b1");
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  for (const c of r.checks) console.log("YC", c.id, c.status, c.rows.length, "|", c.summary.slice(0, 110));

  expect(r.checks.some((c) => c.status === "blocked")).toBe(false); // every file was on the client
  expect(by["sales_vs_gstr1"]!.rows.map((x) => x.ref)).toEqual(["2025-05"]);
  expect(by["rcm"]!.rows.length).toBeGreaterThan(0);
  expect(by["opened_closed"]!.rows.map((x) => x.ref).sort()).toEqual(["Cleared by JV", "Debtor A", "New Debtor", "Old Debtor"]);
  expect(by["unchanged_balances"]!.rows.map((x) => x.ref)).toEqual(expect.arrayContaining(["Dormant Advance", "Share Capital"]));
  expect(by["closed_by_journal"]!.rows.map((x) => x.ref)).toEqual(["Cleared by JV"]);
  expect(by["ais_vs_books"]!.rows.map((x) => x.ref)).toEqual(expect.arrayContaining(["Turnover", "SFT"]));
  expect(r.from["Trial Balance"]).toBeTruthy();
});
