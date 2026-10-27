#!/usr/bin/env node
/**
 * Made-up books for testing reconciliation: 5 customers in India with valid-format GSTINs, 10 sales invoices (4 unpaid, 6
 * part-paid), 3 vendors with 5 bills, and a bank statement of 10 deposits and withdrawals that reconciles to the books with
 * two deliberate exceptions. Writes CSVs to public/samples/zoho-test/. Nothing here touches a real Zoho Books organisation.
 *
 *   node scripts/zoho-test-data.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** The GSTN check-character algorithm, same as src/lib/practice/india.ts. */
function checkChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}
const fullGstin = (state, pan) => { const f14 = `${state}${pan}1Z`; return f14 + checkChar(f14); };

const r2 = (n) => Math.round(n * 100) / 100;
const gst = (taxable) => r2(taxable * 0.18);

export function buildDataset() {
  const customers = [
    { id: "CUST-01", name: "Kaveri Textiles Pvt Ltd", state: "29", place: "Karnataka", gstin: fullGstin("29", "AABCK4821M"), email: "accounts@kaveritextiles.example" },
    { id: "CUST-02", name: "Mehta Foods LLP", state: "24", place: "Gujarat", gstin: fullGstin("24", "AAFFM7310Q"), email: "finance@mehtafoods.example" },
    { id: "CUST-03", name: "Sundar Auto Components", state: "33", place: "Tamil Nadu", gstin: fullGstin("33", "AAHFS5562K"), email: "accounts@sundarauto.example" },
    { id: "CUST-04", name: "Orion IT Services Pvt Ltd", state: "27", place: "Maharashtra", gstin: fullGstin("27", "AACCO9084D"), email: "ap@orionit.example" },
    { id: "CUST-05", name: "Bharat Stationers", state: "07", place: "Delhi", gstin: fullGstin("07", "AAEPB3376R"), email: "bharatstationers@example.com" },
  ];
  const vendors = [
    { id: "VEND-01", name: "Raman Logistics", state: "29", gstin: fullGstin("29", "AAGFR2210P") },
    { id: "VEND-02", name: "Cloudnest Hosting Pvt Ltd", state: "29", gstin: fullGstin("29", "AAICC6643L") },
    { id: "VEND-03", name: "Prime Estates", state: "29", gstin: fullGstin("29", "AAJFP1198N") },
  ];

  // [invoice no, customer index, date, taxable, amount received so far (0 = unpaid), receipt date]
  const sales = [
    ["INV-2601", 0, "2026-09-02", 100000, 100000, "2026-09-12"],
    ["INV-2602", 1, "2026-09-03", 60000, 30000, "2026-09-15"],
    ["INV-2603", 2, "2026-09-04", 85000, 50000, "2026-09-18"],
    ["INV-2604", 3, "2026-09-06", 150000, 100000, "2026-09-20"],
    ["INV-2605", 4, "2026-09-08", 24000, 0, null],
    ["INV-2606", 0, "2026-09-10", 72000, 0, null],
    ["INV-2607", 1, "2026-09-12", 45000, 25000, "2026-09-24"],
    ["INV-2608", 2, "2026-09-15", 33000, 0, null],
    ["INV-2609", 3, "2026-09-18", 90000, 0, null],
    ["INV-2610", 4, "2026-09-22", 18000, 0, null],
  ];
  const invoices = sales.map(([no, c, date, taxable, paid, paidOn]) => {
    const tax = gst(taxable);
    const total = r2(taxable + tax);
    const status = paid === 0 ? "Unpaid" : paid >= total ? "Paid" : "Partially paid";
    return { no, customer: customers[c], date, taxable, tax, total, paid, paidOn, balance: r2(total - paid), status };
  });

  // [bill no, vendor index, date, taxable, paid amount (0 = unpaid), paid on]
  const purchases = [
    ["BILL-401", 0, "2026-09-05", 20000, 23600, "2026-09-14"],
    ["BILL-402", 1, "2026-09-07", 12000, 14160, "2026-09-17"],
    ["BILL-403", 2, "2026-09-01", 65000, 76700, "2026-09-25"],
    ["BILL-404", 0, "2026-09-19", 15000, 0, null],
    ["BILL-405", 1, "2026-09-26", 9000, 0, null],
  ];
  const bills = purchases.map(([no, v, date, taxable, paid, paidOn]) => {
    const tax = gst(taxable);
    const total = r2(taxable + tax);
    return { no, vendor: vendors[v], date, taxable, tax, total, paid, paidOn, status: paid === 0 ? "Open" : paid >= total ? "Paid" : "Partially paid" };
  });

  // The bank: five receipts and three bill payments the books know about, plus one receipt and one charge they do not.
  const bankEvents = [
    ...invoices.filter((i) => i.paid > 0).map((i) => ({ date: i.paidOn, dir: "in", amount: i.paid, party: i.customer.name, ref: i.no, books: true, mode: i.paid > 100000 ? "RTGS" : "NEFT" })),
    ...bills.filter((b) => b.paid > 0).map((b) => ({ date: b.paidOn, dir: "out", amount: b.paid, party: b.vendor.name, ref: b.no, books: true, mode: "NEFT" })),
    { date: "2026-09-21", dir: "in", amount: 12500, party: "Walk-in customer UPI", ref: "UPI", books: false, mode: "UPI" },
    { date: "2026-09-30", dir: "out", amount: 590, party: "Bank charges", ref: "CHG", books: false, mode: "CHG" },
  ].sort((a, b) => a.date.localeCompare(b.date));

  let bal = 500000;
  const bank = bankEvents.map((e, i) => {
    bal = r2(bal + (e.dir === "in" ? e.amount : -e.amount));
    return { ...e, n: i + 1, closing: bal };
  });
  return { customers, vendors, invoices, bills, bank, opening: 500000, closing: bal };
}

const inr = (n) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso, sep, yy = false) => { const [y, m, d] = iso.split("-"); return `${d}${sep}${m}${sep}${yy ? y.slice(2) : y}`; };
const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = (rows) => rows.map((r) => r.map((c) => q(String(c))).join(",")).join("\n") + "\n";

export function render(d) {
  const files = {};
  files["customers.csv"] = csv([
    ["Customer ID", "Display Name", "GST Treatment", "GST Identification Number (GSTIN)", "Place of Contact", "Email", "Currency Code"],
    ...d.customers.map((c) => [c.id, c.name, "business_gst", c.gstin, c.place, c.email, "INR"]),
  ]);
  files["vendors.csv"] = csv([
    ["Vendor ID", "Display Name", "GST Treatment", "GST Identification Number (GSTIN)", "Currency Code"],
    ...d.vendors.map((v) => [v.id, v.name, "business_gst", v.gstin, "INR"]),
  ]);
  files["invoices.csv"] = csv([
    ["Invoice Number", "Invoice Date", "Customer Name", "Customer GSTIN", "Taxable Value", "GST 18%", "Total", "Amount Received", "Balance", "Status"],
    ...d.invoices.map((i) => [i.no, dmy(i.date, "-"), i.customer.name, i.customer.gstin, i.taxable.toFixed(2), i.tax.toFixed(2), i.total.toFixed(2), i.paid.toFixed(2), i.balance.toFixed(2), i.status]),
  ]);
  files["bills.csv"] = csv([
    ["Bill Number", "Bill Date", "Vendor Name", "Vendor GSTIN", "Taxable Value", "GST 18%", "Total", "Amount Paid", "Status"],
    ...d.bills.map((b) => [b.no, dmy(b.date, "-"), b.vendor.name, b.vendor.gstin, b.taxable.toFixed(2), b.tax.toFixed(2), b.total.toFixed(2), b.paid.toFixed(2), b.status]),
  ]);
  // Bank statement in the HDFC layout FynHelp reads.
  let rows = "HDFC BANK Ltd.\nAccount No : 50100099887766\nStatement From : 01/09/2026 To : 30/09/2026\n\n";
  rows += "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n";
  for (const e of d.bank) {
    const narr = e.dir === "in" ? `${e.mode} CR-${e.party.toUpperCase()}-${e.ref}` : e.mode === "CHG" ? "BANK CHARGES SEP 2026 INCL GST" : `${e.mode} DR-${e.party.toUpperCase()}-${e.ref}`;
    rows += [dmy(e.date, "/", true), narr, `${e.mode}${String(e.n).padStart(6, "0")}`, dmy(e.date, "/", true), e.dir === "out" ? `"${inr(e.amount)}"` : "", e.dir === "in" ? `"${inr(e.amount)}"` : "", `"${inr(e.closing)}"`].join(",") + "\n";
  }
  files["bank_statement_sep2026.csv"] = rows;
  // The bank ledger as the books hold it: only what has been recorded.
  files["books_bank_ledger_sep2026.csv"] = csv([
    ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
    ...d.bank.filter((e) => e.books).map((e, i) => [dmy(e.date, "-"), e.party, e.dir === "in" ? "Receipt" : "Payment", `${e.dir === "in" ? "RC" : "PY"}-${100 + i}`, e.dir === "in" ? e.amount.toFixed(2) : "", e.dir === "out" ? e.amount.toFixed(2) : ""]),
  ]);
  const inB = d.bank.filter((e) => e.dir === "in").length;
  files["README.txt"] = `Made-up test data for reconciliation (no real people, companies or accounts)

customers.csv / vendors.csv   5 customers and 3 vendors in India with GSTINs that pass the GSTIN check-character test
invoices.csv                  10 sales invoices: ${d.invoices.filter((i) => i.status === "Unpaid").length} unpaid, ${d.invoices.filter((i) => i.status === "Partially paid").length} partially paid
bills.csv                     5 vendor bills (3 paid or part-paid, 2 open)
bank_statement_sep2026.csv    ${d.bank.length} bank lines (${inB} deposits, ${d.bank.length - inB} withdrawals), HDFC layout. Opening ${inr(d.opening)}, closing ${inr(d.closing)}
books_bank_ledger_sep2026.csv The bank ledger as the books hold it (8 entries)

Upload in FynHelp: the statement as a bank document and the ledger as books. Expected: 8 matched, 2 exceptions
- 21 Sep deposit of 12,500.00 (UPI, walk-in customer): received in the bank, never recorded in the books
- 30 Sep withdrawal of 590.00 (bank charges): charged by the bank, never recorded in the books

To use the same data in Zoho Books, import customers, vendors, invoices and bills from the CSVs (Zoho's import screen lets you map columns), then record the customer receipts and vendor payments listed in the bank ledger. Zoho's import templates change, so map by column name rather than position.
`;
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "samples", "zoho-test");
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(render(buildDataset()))) writeFileSync(join(out, name), text);
  console.log(`Wrote ${Object.keys(render(buildDataset())).length} files to ${out}`);
}
