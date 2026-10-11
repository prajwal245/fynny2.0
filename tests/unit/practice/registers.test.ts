import { describe, expect, it } from "vitest";
import { detectRegister, summariseRegister } from "@/lib/practice/extract/registers";
import { parseDelimited, rowsFromTable } from "@/lib/practice/extract/table";

const t = (csv: string) => parseDelimited(csv);

describe("registers are recognised and kept out of bank/books (QA P0-3, P0-4)", () => {
  it("GST purchase register", () => {
    const rows = t(`Invoice No,Invoice Date,Supplier,Supplier GSTIN,Taxable Value,CGST,SGST,IGST,Invoice Value
P-101,02-09-2026,Ravi Enterprises,27AAACR1234A1Z5,10000,900,900,0,11800
P-102,05-09-2026,Kaveri Fashions,29AAACK5678B1Z2,20000,0,0,3600,23600
Total,,,,30000,900,900,3600,35400`);
    expect(detectRegister(rows, "purchase_register_sep.csv")).toBe("gst_purchase_register");
    const s = summariseRegister("gst_purchase_register", rows);
    expect(s.entries).toBe(2);
    expect(s.totals.find((x) => x.label === "Taxable value")?.amount).toBe(30000);
    expect(s.totals.find((x) => x.label === "IGST")?.amount).toBe(3600);
  });

  it("GST sales register, GSTR-2B, TDS register, payroll", () => {
    expect(detectRegister(t("Invoice No,Date,Customer,GSTIN,Taxable Value,IGST\nS-1,01-09-2026,Acme,29X,1000,180"), "sales.csv")).toBe("gst_sales_register");
    expect(detectRegister(t("Supplier GSTIN,Trade Name,Invoice No,Taxable Value,IGST,ITC Availability\n29X,Acme,1,100,18,Yes"), "gstr2b_sep.csv")).toBe("gstr2b");
    const tds = t("Deductee,PAN,Section,Amount Paid,TDS Amount\nRavi,ABCDE1234F,194C,100000,1000\nMeera,PQRSX9876K,194J,50000,5000");
    expect(detectRegister(tds, "tds.csv")).toBe("tds_register");
    expect(summariseRegister("tds_register", tds).groups?.map((g) => g.key).sort()).toEqual(["194C", "194J"]);
    const pay = t("Emp Code,Employee Name,Basic,HRA,Gross,PF,ESI,Net Pay\nE1,Asha,20000,8000,30000,1800,0,28200");
    expect(detectRegister(pay, "salary_sep.csv")).toBe("payroll");
    expect(summariseRegister("payroll", pay).totals.find((x) => x.label === "Net pay")?.amount).toBe(28200);
  });

  it("Razorpay settlement report: gross, fees, GST on fees and net per settlement", () => {
    const rows = t(`entity_id,type,amount,fee,tax,settlement_id,settled_at
pay_1,payment,10000,200,36,setl_A,2026-09-03
pay_2,payment,5000,100,18,setl_A,2026-09-03
pay_3,payment,8000,160,28.8,setl_B,2026-09-05`);
    expect(detectRegister(rows, "razorpay_settlements_sep.csv")).toBe("gateway_settlement");
    const s = summariseRegister("gateway_settlement", rows);
    expect(s.totals.find((x) => x.label === "Gross collected")?.amount).toBe(23000);
    expect(s.totals.find((x) => x.label === "Gateway fees")?.amount).toBe(460);
    expect(s.groups?.find((g) => g.key === "setl_A")?.amount).toBe(14646);
  });

  it("never mistakes a bank statement or a ledger export for a register", () => {
    expect(detectRegister(t("Date,Narration,Ref,Withdrawal,Deposit,Balance\n01-09-2026,NEFT,1,,100,100"), "hdfc.csv")).toBeNull();
    expect(detectRegister(t("Date,Particulars,Vch Type,Vch No,Debit,Credit\n01-09-2026,Ravi,Payment,1,100,"), "daybook.csv")).toBeNull();
  });
});

describe("Tally day book exported to Excel/CSV (QA P1-2)", () => {
  it("reads a Receipt as money in even when the amount sits in the Debit column", () => {
    const rows = rowsFromTable(
      t(`Date,Particulars,Vch Type,Vch No,Debit,Credit
01-09-2026,Sundara Textiles Pvt Ltd,Receipt,R-12,125000,
04-09-2026,Ramesh Kumar,Payment,P-3,,15000
15-09-2026,Amazon India,Purchase,PV-88,,2499`),
      "books",
    )!;
    expect(rows.map((r) => r.direction)).toEqual(["in", "out", "out"]);
  });
});
