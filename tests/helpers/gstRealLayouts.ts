import { gstinCheckChar } from "@/lib/practice/india";

/**
 * Masked copies of the real layouts a CA firm receives: Tally registers with one column per ledger, the GSTR-1 workbook with month-first
 * dates, the GSTR-3B annual report with a column block per month. Names, GSTINs and amounts are made up; the shapes, and the way the
 * books, GSTR-1 and GSTR-3B relate in the real December 2025 file, are kept: GSTR-1 and GSTR-3B agree with each other, and one large
 * invoice (SGAL/C/09) is missing from the Tally sales register. No client data is in this file.
 */
export const gstin = (state: string, pan: string, n = 1) => {
  const first14 = `${state}${pan}${n}Z`;
  return first14 + gstinCheckChar(first14);
};
export const OWN = gstin("37", "AAAAA0000A");
export const BUYER_A = gstin("37", "BBBBB1111B");
export const BUYER_B = gstin("37", "CCCCC2222C");
export const SUP_A = gstin("37", "DDDDD3333D");
export const SUP_B = gstin("36", "EEEEE4444E");

/* ── Tally sales register: no taxable column, taxable spread over ledger columns ── */
export const SALES_HEAD = ["Date", "Particulars", "Voucher Type", "Voucher No.", "GSTIN/UIN", "Narration", "Gross Total", "Gst Sales @ 18%", "Output CGST", "Output SGST", "Round Off A/c", "Interior Works", "Landscape Works"];
export const SALES: string[][] = [
  ["ACME BUILDERS PRIVATE LIMITED", ...Array(12).fill("")],
  ["Sales Register", ...Array(12).fill("")],
  ["1-Dec-2025 to 31-Dec-2025 (exported from Tally on 19-11-2026)", ...Array(12).fill("")],
  SALES_HEAD,
  ["08-12-2025", "BUYER ONE", "Sales", "SO/IT/008", BUYER_A, "", "1,180,000.00", "1,000,000.00", "90,000.00", "90,000.00", "", "", ""],
  ["08-12-2025", "BUYER ONE", "Sales", "SO/IT/009", BUYER_A, "", "236,000.20", "200,000.00", "18,000.00", "18,000.00", "0.20", "", ""],
  ["08-12-2025", "BUYER ONE", "Sales", "SO/IT/010", BUYER_A, "", "590,000.00", "500,000.00", "45,000.00", "45,000.00", "", "", ""],
  // the taxable value is split over two work ledgers and there is no "Gst Sales" amount at all
  ["13-12-2025", "BUYER ONE", "Sales", "SO/LS/01", BUYER_A, "", "4,130,000.00", "", "315,000.00", "315,000.00", "", "3,000,000.00", "500,000.00"],
  ["Total", "", "", "", "", "", "6,136,000.20", "1,700,000.00", "468,000.00", "468,000.00", "0.20", "3,000,000.00", "500,000.00"],
];

/* ── Tally purchase register with the supplier's own invoice number ── */
export const PUR_HEAD = ["Date", "Particulars", "Voucher Type", "Voucher No.", "Supplier Invoice No.", "Supplier Invoice Date", "GSTIN/UIN", "Narration", "Gross Total", "18% Goods Purchase", "Input CGST", "Input SGST", "Round Off A/c", "Transport Charges", "Input IGST"];
export const PURCHASES: string[][] = [
  ["ACME BUILDERS PRIVATE LIMITED", ...Array(14).fill("")],
  ["Purchase Register", ...Array(14).fill("")],
  ["1-Dec-2025 to 31-Dec-2025 (exported from Tally on 19-11-2026)", ...Array(14).fill("")],
  PUR_HEAD,
  // an invoice dated in July but booked in December
  ["01-12-2025", "SUPPLIER ONE", "Purchase", "166", "6", "15-07-2025", SUP_A, "", "118,000.00", "100,000.00", "9,000.00", "9,000.00", "", "", ""],
  // GST charged, supplier GSTIN not recorded
  ["08-12-2025", "READY MIX CO", "Purchase", "179", "RK/2318", "08-12-2025", "", "", "17,700.00", "15,000.00", "1,350.00", "1,350.00", "", "", ""],
  // two vouchers: same supplier, same amount, same day, different invoice numbers
  ["23-12-2025", "STEEL TRADERS", "Purchase", "206", "RK0259", "23-12-2025", SUP_B, "", "20,650.00", "17,500.00", "", "", "", "", "3,150.00"],
  ["23-12-2025", "STEEL TRADERS", "Purchase", "207", "258", "", SUP_B, "", "20,650.00", "17,500.00", "", "", "", "", "3,150.00"],
  ["Total", "", "", "", "", "", "", "", "177,000.00", "150,000.00", "10,350.00", "10,350.00", "", "", "6,300.00"],
];
export const DEBIT_NOTES: string[][] = [
  ["Debit Note Register", ...Array(10).fill("")],
  ["Date", "Particulars", "Voucher Type", "Voucher No.", "Supplier Invoice No.", "Supplier Invoice Date", "GSTIN/UIN", "Narration", "Gross Total", "GST PURCHASE", "Input CGST", "Input SGST"],
  ["01-12-2025", "SUPPLIER ONE", "Debit Note", "13", "MW1", "29-11-2025", SUP_A, "", "11,800.00", "10,000.00", "900.00", "900.00"],
];
export const JOURNALS: string[][] = [
  ["Journals with GST"],
  ["Date", "Voucher Type", "Voucher No.", "Narration", "Ledger", "Debit", "Credit"],
  ["13-12-2025", "Journal", "1089", "", "18% Goods Purchase", "1,000.00", ""],
  ["", "", "", "", "Input CGST", "90.00", ""],
  ["", "", "", "", "Input SGST", "90.00", ""],
  ["", "", "", "", "Some Supplier", "", "1,180.00"],
  ["31-12-2025", "Journal", "1278", "RCM ON RENTAL", "RCM CGST INPUT", "1,634.00", ""],
  ["", "", "", "", "RCM CGST PAYABLE", "", "1,634.00"],
  ["31-12-2025", "Journal", "1286", "", "Output CGST", "1,098,000.00", ""],
  ["", "", "", "", "Input CGST", "", "1,098,000.00"],
  ["Total", "", "", "", "", "", ""],
];

/* ── GSTR-1 workbook: month-first dates, one list for the year ── */
export const G1_HEAD = ["S.No.", "Original Period", "Amendment Period", "GSTIN", "Document Type", "Party Name", "Invoice No.", "Invoice Date", "RCM", "Invoice Type", " Taxable Value ", " GST % ", " IGST ", " CGST ", " SGST ", " CESS ", " Total Invoice Value ", "Place of Supply"];
export const g1row = (n: number, period: string, g: string, type: string, party: string, no: string, date: string, taxable: number, rate = 18): string[] => {
  const tax = (taxable * rate) / 200;
  const f = (v: number) => ` ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `;
  return [String(n), period, "", g, type, party, no, date, "No", "Regular", f(taxable), ` ${rate.toFixed(2)} `, " - ", f(tax), f(tax), " - ", f(taxable + tax * 2), "Andhra Pradesh"];
};
export const G1: string[][] = [
  ["Summary"],
  ["Report Name", "", "Details of Transactions Available in GSTR-1 (Invoices of Selcted Period Reported in Any Period of GSTR-1)"],
  G1_HEAD,
  g1row(1, "Nov-25", BUYER_B, "B2B", "BUYER TWO", "SGAL/C/08", "11/22/2025", 800_000),
  g1row(2, "Nov-25", BUYER_B, "Credit Note", "BUYER TWO", "SGAL/CR/01", "11/25/2025", -40_000),
  g1row(3, "Dec-25", BUYER_A, "B2B", "BUYER ONE", "SO/IT/008", "12/8/2025", 1_000_000),
  g1row(4, "Dec-25", BUYER_A, "B2B", "BUYER ONE", "SO/IT/009", "12/8/2025", 200_000),
  g1row(5, "Dec-25", BUYER_A, "B2B", "BUYER ONE", "SO/IT/010", "12/8/2025", 500_000),
  g1row(6, "Dec-25", BUYER_A, "B2B", "BUYER ONE", "SO/LS/01", "12/13/2025", 3_500_000),
  g1row(7, "Dec-25", BUYER_B, "B2B", "BUYER TWO", "SGAL/C/09", "12/17/2025", 7_000_000),
  ["8", "", "", "Total", "", "", "", "", "", "", " 12,960,000.00 "],
];

/* ── GSTR-3B annual report ── */
export const MONTH_NAMES = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"];
const f2 = (v: number) => ` ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `.replace(/^ -/, "- ");
export function annual3b(by: Record<number, { taxable: number; cgst: number; rcm?: number; itc?: number }>): string[][] {
  const block = (vals: number[]) => vals.map(f2);
  const blank = (n: number) => Array(n).fill("");
  const rows: string[][] = [
    ["ACME BUILDERS PRIVATE LIMITED", ...blank(65)],
    ["GSTR-3B Annual Report", ...blank(65)],
    ["2025 - 2026", ...blank(65)],
    ["DETAILS OF OUTWARD SUPPLIES AND INWARD SUPPLIES LIABLE TO REVERSE CHARGE", "", "Total For the Year", "", "", "", "", ...MONTH_NAMES.flatMap((m) => [m, "", "", "", ""])],
    ["S.NO.", "NATURE OF SUPPLIES.", ...Array(13).fill(["TOTAL TAXABLE VALUE", "IGST", "CGST", "SGST", "CESS"]).flat()],
  ];
  const total = (k: "taxable" | "cgst" | "rcm" | "itc") => Object.values(by).reduce((t, v) => t + (v[k] ?? 0), 0);
  const per = (fn: (v: { taxable: number; cgst: number; rcm?: number; itc?: number }) => number[], tot: number[]) => [...block(tot), ...MONTH_NAMES.flatMap((_, i) => block(by[i] ? fn(by[i]!) : [0, 0, 0, 0, 0]))];
  rows.push(["1)", "(A)OUTWARD TAXABLE SUPPLIES (OTHER THAN ZERO RATED, NIL RATED AND EXEMPTED)", ...per((v) => [v.taxable, 0, v.cgst, v.cgst, 0], [total("taxable"), 0, total("cgst"), total("cgst"), 0])]);
  rows.push(["2)", "(B)OUTWARD TAXABLE SUPPLIES (ZERO RATED )", ...per(() => [0, 0, 0, 0, 0], [0, 0, 0, 0, 0])]);
  rows.push(["4)", "(D)INWARD SUPPLIES (LIABLE TO REVERSE CHARGE)", ...per((v) => (v.rcm ? [v.rcm * 10, v.rcm, v.rcm / 2, v.rcm / 2, 0] : [0, 0, 0, 0, 0]), [0, 0, 0, 0, 0])]);
  rows.push(["ELIGIBLE ITC", ...blank(65)]);
  rows.push(["S.No.", "DETAILS", ...Array(13).fill(["IGST", "CGST", "SGST", "Cess", "Total GST"]).flat()]);
  rows.push(["3)", "INWARD SUPPLIES LIABLE TO REVERSE CHARGE(OTHER THAN 1 & 2 ABOVE)", ...per((v) => (v.rcm ? [v.rcm, v.rcm / 2, v.rcm / 2, 0, v.rcm * 2] : [0, 0, 0, 0, 0]), [0, 0, 0, 0, 0])]);
  rows.push(["", "(A) ITC AVAILABLE (WHETHER IN FULL OR PART)", ...per((v) => [0, (v.itc ?? 0) / 2, (v.itc ?? 0) / 2, 0, v.itc ?? 0], [0, 0, 0, 0, total("itc")])]);
  rows.push(["", "(B) ITC REVERSED", ...per(() => [0, 0, 0, 0, 0], [0, 0, 0, 0, 0])]);
  rows.push(["", "(C) NET ITC AVAILABLE (A)-(B)", ...per((v) => [0, (v.itc ?? 0) / 2, (v.itc ?? 0) / 2, 0, v.itc ?? 0], [0, 0, 0, 0, total("itc")])]);
  return rows;
}
export const DEC = 8; // index of December in April..March
export const ANNUAL = annual3b({ [DEC]: { taxable: 12_200_000, cgst: 1_098_000, itc: 400_000, rcm: 600 }, 7: { taxable: 760_000, cgst: 68_400, itc: 30_000 } });

