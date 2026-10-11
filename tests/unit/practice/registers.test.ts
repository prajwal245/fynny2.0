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

describe("Razorpay fees in the MIS (QA P0-4/P0-5)", () => {
  it("grosses up each payout that matches a settlement and books the fees", async () => {
    const { gatewayGrossUp } = await import("@/lib/practice/narrate/flows");
    const out = gatewayGrossUp(
      [
        { id: "b1", amount: 14646, txn_date: "2026-09-04" },
        { id: "b2", amount: 7811.2, txn_date: "2026-09-06" },
        { id: "b3", amount: 50000, txn_date: "2026-09-10" },
      ],
      [
        { key: "setl_A", amount: 14646, fee: 300, tax: 54, date: "2026-09-03" },
        { key: "setl_B", amount: 7811.2, fee: 160, tax: 28.8, date: "2026-09-05" },
      ],
    );
    expect(out.matches.map((m) => m.txn_id)).toEqual(["b1", "b2"]);
    expect(out.fees).toBe(460);
    expect(out.tax).toBe(82.8);
  });
});

describe("retest round 2: Tally ledgers and TDS totals", () => {
  it("TDS total reads TDS Deducted, never TDS Rate % (N2)", () => {
    const rows = t(`Deductee,PAN,Section,Amount Paid,TDS Rate %,TDS Deducted
Prime Estates,AAAPE1234F,194I,85000,10,8500
Swift Logistics,AABCS5678K,194C,20000,2,400
Rao & Co,AAAFR4321L,194J,96000,10,9600`);
    expect(detectRegister(rows, "R07_tds_register.csv")).toBe("tds_register");
    const s = summariseRegister("tds_register", rows);
    expect(s.totals.find((x) => x.label === "TDS")?.amount).toBe(18500);
    expect(s.totals.find((x) => x.label === "Amount paid / credited")?.amount).toBe(201000);
    expect(Object.fromEntries((s.groups ?? []).map((g) => [g.key, g.amount]))).toEqual({ "194I": 8500, "194C": 400, "194J": 9600 });
  });

  it("a Tally bank ledger named 'bank' is read as books with Debit = money in (N1)", async () => {
    const { runExtract } = await import("@/lib/practice/extract/pipeline");
    const csv = `Date,Particulars,Vch Type,Vch No.,Debit,Credit
01-07-2026,Kaveri Fashions,Receipt,R-1,118000,
03-07-2026,Office Mart,Payment,P-1,,4450
05-07-2026,Bank interest,Journal,J-1,1245,`;
    const out = await runExtract(
      { bytes: new TextEncoder().encode(csv), filename: "R02_bank_ledger_jul2026.csv", mime: "text/csv", side: "bank", businessId: "b" },
      { llm: null },
    );
    expect(out.side).toBe("books");
    expect(out.register ?? null).toBeNull();
    expect(out.rows.map((r) => [r.direction, r.amount])).toEqual([["in", 118000], ["out", 4450], ["in", 1245]]);
  });

  it("a real bank statement stays on the bank side", async () => {
    const { runExtract } = await import("@/lib/practice/extract/pipeline");
    const csv = `Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
01-07-2026,NEFT KAVERI,UTR1,,118000,218000`;
    const out = await runExtract(
      { bytes: new TextEncoder().encode(csv), filename: "R01_bank.csv", mime: "text/csv", side: "bank", businessId: "b" },
      { llm: null },
    );
    expect(out.side).toBe("bank");
    expect(out.rows[0].direction).toBe("in");
  });
});

describe("Razorpay at gross from a settlement report without settlement ids (P0-5)", () => {
  it("uses the file totals as one payout", async () => {
    const { settlementsFromRegister, gatewayGrossUp } = await import("@/lib/practice/narrate/flows");
    const rows = t(`Payment ID,Created At,Amount,Fee,GST,Settled Amount
pay_1,2026-07-10,30000,600,108,29292
pay_2,2026-07-10,20000,400,72,19528`);
    expect(detectRegister(rows, "R09_razorpay_jul2026.csv")).toBe("gateway_settlement");
    const reg = summariseRegister("gateway_settlement", rows);
    expect(reg.totals.find((x) => x.label === "Gross collected")?.amount).toBe(50000);
    const s = settlementsFromRegister(reg, "R09");
    expect(s).toEqual([{ key: "R09", amount: 48820, fee: 1000, tax: 180, date: null }]);
    const out = gatewayGrossUp([{ id: "b9", amount: 48820, txn_date: "2026-07-11" }], s);
    expect(out.fees + out.tax).toBe(1180);
  });
});

describe("MIS buckets (round 3)", () => {
  it("bank charges with GST on them are an expense; GST and TDS challans are taxes", async () => {
    const { misBucket } = await import("@/lib/practice/narrate/flows");
    const out = (description: string, category: string | null = null) => misBucket({ direction: "out", category, description, counterparty: null });
    expect(out("BANK CHARGES GST ON CHG", "tax")).toBe("expense");
    expect(out("SMS CHG INCL GST")).toBe("expense");
    expect(out("GST PMT CPIN 26070012345")).toBe("tax_payment");
    expect(out("TDS 194 CHALLAN ITNS281")).toBe("tax_payment");
    expect(out("EPF CHALLAN JUL 2026")).toBe("expense");
  });
});
