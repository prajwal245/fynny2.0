/**
 * The same ten events as each bank prints them: column names, date formats, and narration
 * styles (UPI/, IMPS/, NEFT, ACH, ATM, INT.PD). Each must read to the same lines, the right
 * direction and amount, and land in the same MIS bucket.
 */
import { describe, expect, it } from "vitest";
import { runExtract } from "@/lib/practice/extract/pipeline";
import { misBucket, type MisBucket } from "@/lib/practice/narrate/flows";

type Ev = { n: number; day: string; text: string; dir: "dr" | "cr"; amt: number; bucket: MisBucket };
const EV: Ev[] = [
  { n: 1, day: "01", text: "NEFT-KAVERI TEXTILES PVT LTD-INV-2601", dir: "cr", amt: 118000, bucket: "revenue" },
  { n: 2, day: "02", text: "UPI-SUNDAR AUTO COMPONENTS-9876543210@okaxis-INV2603", dir: "cr", amt: 50300, bucket: "revenue" },
  { n: 3, day: "03", text: "IMPS-ORION IT SERVICES-REFUND OF EXCESS", dir: "cr", amt: 1500, bucket: "refund" },
  { n: 4, day: "05", text: "ACH D- HDFC LTD-LOAN EMI 4455", dir: "dr", amt: 42000, bucket: "loan_capital" },
  { n: 5, day: "07", text: "TDS PAYMENT CHALLAN 281", dir: "dr", amt: 7500, bucket: "tax_payment" },
  { n: 6, day: "10", text: "SMS CHGS 01-07-25 TO 30-09-25", dir: "dr", amt: 17.7, bucket: "expense" },
  { n: 7, day: "12", text: "NEFT-MANDI STEEL ROLLING-MGS/512", dir: "dr", amt: 153810.9, bucket: "expense" },
  { n: 8, day: "15", text: "ATM WDL SELF 00231", dir: "dr", amt: 10000, bucket: "transfer" },
  { n: 9, day: "20", text: "INT.PD:01-07-2025 to 30-09-2025", dir: "cr", amt: 842.5, bucket: "other_income" },
  { n: 10, day: "28", text: "PF CONTRIBUTION EPFO AUG", dir: "dr", amt: 21600, bucket: "expense" },
];
const M = "08";
const Y = "2025";
const inr = (n: number) => n.toFixed(2);
const grouped = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function build(head: string, row: (e: Ev, bal: number) => string, pre: string[] = []): string {
  let bal = 1000000;
  const lines = EV.map((e) => {
    bal += e.dir === "cr" ? e.amt : -e.amt;
    return row(e, bal);
  });
  return [...pre, head, ...lines].join("\n") + "\n";
}
const q = (s: string) => `"${s}"`;

const BANKS: Record<string, string> = {
  HDFC: build("Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance", (e, b) => `${e.day}/${M}/25,${e.text},REF${e.n},${e.day}/${M}/25,${e.dir === "dr" ? q(grouped(e.amt)) : ""},${e.dir === "cr" ? q(grouped(e.amt)) : ""},${q(grouped(b))}`, ["HDFC BANK LTD", "Account No : 50100099887766", ""]),
  ICICI: build("S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )", (e, b) => `${e.n},${e.day}/${M}/${Y},${e.day}/${M}/${Y},,${e.text},${e.dir === "dr" ? inr(e.amt) : "0.00"},${e.dir === "cr" ? inr(e.amt) : "0.00"},${inr(b)}`),
  SBI: build("Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance", (e, b) => `${e.day} Aug ${Y},${e.day} Aug ${Y},${e.text},REF${e.n},${e.dir === "dr" ? q(grouped(e.amt)) : ""},${e.dir === "cr" ? q(grouped(e.amt)) : ""},${q(grouped(b))}`, ["Account Name : MEHTA STEEL TRADERS", "Account Number : 00000012345678901", ""]),
  KOTAK: build("Sl. No.,Transaction Date,Value Date,Description,Chq / Ref No.,Debit,Credit,Balance,Dr / Cr", (e, b) => `${e.n},${e.day}-${M}-${Y},${e.day}-${M}-${Y},${e.text},REF${e.n},${e.dir === "dr" ? q(grouped(e.amt)) : ""},${e.dir === "cr" ? q(grouped(e.amt)) : ""},${q(grouped(b))},CR`),
  YES: build("Transaction Date,Value Date,Description,Cheque No.,Withdrawals,Deposits,Balance", (e, b) => `${e.day}-${M}-${Y},${e.day}-${M}-${Y},${e.text},,${e.dir === "dr" ? inr(e.amt) : ""},${e.dir === "cr" ? inr(e.amt) : ""},${inr(b)}`),
  AXIS: build("Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL", (e, b) => `${e.day}-${M}-${Y},,${e.text},${e.dir === "dr" ? inr(e.amt) : ""},${e.dir === "cr" ? inr(e.amt) : ""},${inr(b)},123`),
};

describe.each(Object.entries(BANKS))("%s statement style", (bank, csv) => {
  it("reads every line with the right date, direction and amount", async () => {
    const out: any = await runExtract({ bytes: new TextEncoder().encode(csv), filename: `${bank}.csv`, mime: "text/csv", side: "bank", businessId: null }, { llm: null });
    const rows = (out.rows ?? []) as { date: string; direction: string; amount: number; description: string }[];
    expect(rows, JSON.stringify(out.error ?? "")).toHaveLength(EV.length);
    for (const e of EV) {
      const r = rows.find((x) => Math.abs(x.amount - e.amt) < 0.005);
      expect(r, `${bank}: ${e.text}`).toBeTruthy();
      expect(r!.direction, `${bank}: ${e.text}`).toBe(e.dir === "cr" ? "in" : "out");
      expect(r!.date, `${bank}: ${e.text}`).toBe(`${Y}-${M}-${e.day}`);
    }
  });

  it("puts each narration in the MIS bucket a CA would", async () => {
    const out: any = await runExtract({ bytes: new TextEncoder().encode(csv), filename: `${bank}.csv`, mime: "text/csv", side: "bank", businessId: null }, { llm: null });
    for (const e of EV) {
      const r = out.rows.find((x: any) => Math.abs(x.amount - e.amt) < 0.005);
      expect(misBucket({ direction: r.direction, description: r.description, category: r.category ?? null, counterparty: r.counterparty ?? null }), `${bank}: ${e.text}`).toBe(e.bucket);
    }
  });
});
