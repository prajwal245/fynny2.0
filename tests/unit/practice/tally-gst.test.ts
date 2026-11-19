import { describe, expect, it } from "vitest";
import { readTallyGst } from "@/lib/practice/gst/tallyVouchers";

const leg = (name: string, amt: number) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${name}</LEDGERNAME><AMOUNT>${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
const v = (type: string, no: string, date: string, party: string, gstin: string, legs: string) =>
  `<VOUCHER VCHTYPE="${type}"><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><DATE>${date}</DATE><VOUCHERNUMBER>${no}</VOUCHERNUMBER><PARTYLEDGERNAME>${party}</PARTYLEDGERNAME><PARTYGSTIN>${gstin}</PARTYGSTIN>${legs}</VOUCHER>`;
const xml = (...vs: string[]) => `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${vs.join("")}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;

describe("sales and purchases from a Tally Day Book", () => {
  it("builds a sales invoice: party GSTIN, number, taxable and the tax split", () => {
    const r = readTallyGst(xml(v("Sales", "S-1", "20260905", "Kaveri", "37BBBBB1111B1Z5", leg("Kaveri", -11800) + leg("Sales", 10000) + leg("Output CGST", 900) + leg("Output SGST", 900))));
    expect(r.sales.invoices[0]).toMatchObject({ gstin: "37BBBBB1111B1Z5", no: "S-1", date: "2026-09-05", taxable: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800 });
    expect(r.sales.period).toBe("2026-09");
  });
  it("does not count round-off as taxable value", () => {
    const r = readTallyGst(xml(v("Sales", "S-2", "20260906", "A", "", leg("A", -11800) + leg("Sales", 9999.6) + leg("Output IGST", 1800) + leg("Round Off", 0.4) )));
    // 11800 = 9999.6 + 1800 + 0.4; the taxable value is the sales leg.
    expect(r.sales.invoices[0]!.taxable).toBe(10000 - 0.4);
  });
  it("makes credit notes negative and keeps only the chosen month", () => {
    const r = readTallyGst(xml(v("Credit Note", "CN-1", "20260910", "A", "", leg("A", 1180) + leg("Sales Return", -1000) + leg("Output CGST", -90) + leg("Output SGST", -90)), v("Sales", "S-9", "20261002", "A", "", leg("A", -118) + leg("Sales", 100) + leg("Output IGST", 18))), { month: "2026-09" });
    expect(r.sales.invoices).toHaveLength(1);
    expect(r.sales.invoices[0]).toMatchObject({ no: "CN-1", docType: "credit_note", taxable: -1000, cgst: -90 });
  });
  it("marks reverse charge purchases from the tax ledger name and skips vouchers it cannot read", () => {
    const r = readTallyGst(xml(v("Purchase", "P-1", "20260908", "Transporter", "", leg("Transporter", 1000) + leg("Freight", -1000) + leg("CGST RCM", -90) + leg("SGST RCM", -90) + leg("RCM Payable", 180)), v("Sales", "S-x", "20260908", "", "", leg("Cash", -10))));
    expect(r.purchases.invoices[0]).toMatchObject({ reverseCharge: true, taxable: 1000, cgst: 90, sgst: 90 });
    expect(r.skipped).toBe(1);
  });
});

import { readTallyGstSheet } from "@/lib/practice/gst/tallyVouchers";
describe("sales and purchases from the Day Book Excel export", () => {
  const head = ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit", "Credit"];
  const rows = [
    ["Day Book", "", "", "", "", "", "", ""], head, ["", "", "", "", "", "", "Amount", "Amount"],
    ["18-Jul-25", "Malkhed Real Estate", "", "", "Sales", "1/25-26/SO", "9242326", ""],
    ["", "Gst Sales @ 18%", "", "", "", "", "", "7832479.37"],
    ["", "Output CGST", "", "", "", "", "", "704923.13"],
    ["", "Output SGST", "", "", "", "", "", "704923.13"],
    ["", "Round Off A/c", "", "", "", "", "", "0.37"],
    ["19-Jul-25", "Bank", "", "", "Contra", "10", "", "5000"],
    ["", "Bank 2", "", "", "", "", "5000", ""],
    ["30-Apr-25", "V S S", "", "", "Sales", "SSSL/01", "4638816.00", ""],
    ["", "18% Sale", "", "", "", "", "", "3931200.00 Cr"],
    ["", "9% Cgst Output", "", "", "", "", "", "353808.00 Cr"],
    ["", "9% Sgst Output", "", "", "", "", "", "353808.00 Cr"],
    ["30-Apr-25", "SRINIVASA TYRES", "", "", "Purchase", "7", "", "95000.04"],
    ["", "28% Purchase", "", "", "", "", "74218.78 Dr", ""],
    ["", "14% Cgst Input", "", "", "", "", "10390.63 Dr", ""],
    ["", "14% Sgst Input", "", "", "", "", "10390.63 Dr", ""],
  ];
  it("reads sales with the tax split and treats round-off as not taxable", () => {
    const r = readTallyGstSheet(rows);
    expect(r.sales.invoices).toHaveLength(2);
    const a = r.sales.invoices.find((i) => i.no === "1/25-26/SO")!;
    expect(a).toMatchObject({ date: "2025-07-18", cgst: 704923.13, sgst: 704923.13, total: 9242326 });
    expect(a.taxable).toBeCloseTo(9242326 - 704923.13 * 2 - 0.37, 2);
    expect(r.sales.invoices.find((i) => i.no === "SSSL/01")).toMatchObject({ taxable: 3931200, cgst: 353808 });
    expect(r.purchases.invoices[0]).toMatchObject({ no: "7", cgst: 10390.63 });
    expect(r.sales.notes.join(" ")).toMatch(/matched on their number/);
  });
  it("keeps only the chosen month", () => {
    expect(readTallyGstSheet(rows, { month: "2025-04" }).sales.invoices.map((i) => i.no)).toEqual(["SSSL/01"]);
  });
});
