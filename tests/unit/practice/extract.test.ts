import { describe, expect, it } from "vitest";
import {
  parseDate,
  parsePeriod,
  previousPeriod,
  dedupeKey,
} from "@/lib/practice/core";
import { parseDelimited, rowsFromTable } from "@/lib/practice/extract/table";
import { rowsFromTally } from "@/lib/practice/extract/tally";
import { rowsFromStatementText } from "@/lib/practice/extract/textStatement";
import {
  counterpartyFromNarration,
  referenceFromNarration,
  rowsFromAiRead,
  scoreRow,
  amountAppearsIn,
} from "@/lib/practice/extract/classify";
import {
  detectKind,
  runExtract,
  type LlmClient,
} from "@/lib/practice/extract/pipeline";

const enc = (s: string) => new TextEncoder().encode(s);

describe("dates and periods", () => {
  it("reads Indian bank and Tally date formats day-first", () => {
    expect(parseDate("01/02/2026")).toBe("2026-02-01");
    expect(parseDate("5-9-26")).toBe("2026-09-05");
    expect(parseDate("15 Sep 2026")).toBe("2026-09-15");
    expect(parseDate("15-SEP-2026")).toBe("2026-09-15");
    expect(parseDate("20260915")).toBe("2026-09-15");
    expect(parseDate("2026-09-15T00:00:00")).toBe("2026-09-15");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Opening Balance")).toBeNull();
  });

  it("parses the period labels the v2 screens use", () => {
    expect(parsePeriod("September 2026")).toMatchObject({
      key: "2026-09",
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(parsePeriod("2026-02")).toMatchObject({ end: "2026-02-28" });
    expect(previousPeriod(parsePeriod("January 2026"))?.key).toBe("2025-12");
    expect(() => parsePeriod("someday")).toThrow();
  });
});

const HDFC = `HDFC BANK Ltd.
Account No : 50100012345678,,,,,,
Statement From : 01/09/2026 To : 30/09/2026,,,,,,

Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/09/26,NEFT CR-HDFC0001234-SUNDARA TEXTILES PVT LTD-INV 1042,HDFCN52026090112345,01/09/26,,"1,25,000.00","5,25,000.00"
03/09/26,UPI/DR/624512345678/AMAZON PAY/YESB/amazon@apl,624512345678,03/09/26,"2,499.00",,"5,22,501.00"
03/09/26,"IMPS/P2A/624599999999/RAMESH KUMAR",624599999999,03/09/26,"15,000.00",,"5,07,501.00"
,continued narration for ramesh,,,,,
05/09/26,SMS CHGS FOR QTR,,05/09/26,17.70,,"5,07,483.30"
,,,,,,
Total,,,,"17,516.70","1,25,000.00",`;

describe("bank CSV", () => {
  it("finds the header below the preamble and maps HDFC columns", () => {
    const rows = rowsFromTable(parseDelimited(HDFC))!;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      date: "2026-09-01",
      amount: 125000,
      direction: "in",
      reference: "HDFCN52026090112345",
      balance: 525000,
    });
    expect(rows[1]).toMatchObject({
      date: "2026-09-03",
      amount: 2499,
      direction: "out",
    });
    expect(rows[2].description).toContain("continued narration for ramesh");
    expect(rows[3]).toMatchObject({ amount: 17.7, direction: "out" });
    expect(rows.every((r) => r.parse_confidence > 0.9)).toBe(true);
  });

  it("handles a single signed amount column with DR/CR suffix", () => {
    const csv =
      "Txn Date;Description;Amount;Balance\n02-09-2026;SALARY SEPT;50,000.00 DR;1,00,000.00\n04-09-2026;INT PD;1,234.00 CR;1,01,234.00";
    const rows = rowsFromTable(parseDelimited(csv))!;
    expect(rows.map((r) => [r.direction, r.amount])).toEqual([
      ["out", 50000],
      ["in", 1234],
    ]);
  });

  it("flags foreign currency lines for review", () => {
    const csv =
      "Date,Description,Amount,Currency\n01/09/2026,Stripe payout,1200.00,USD";
    const [row] = rowsFromTable(parseDelimited(csv))!;
    expect(row.currency).toBe("USD");
    expect(row.parse_confidence).toBeLessThan(0.75);
  });

  it("returns null when no header can be found", () => {
    expect(rowsFromTable(parseDelimited("hello,world\nfoo,bar"))).toBeNull();
  });
});

const TALLY = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <VOUCHER VCHTYPE="Receipt" ACTION="Create">
  <DATE>20260901</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>R-12</VOUCHERNUMBER>
  <PARTYLEDGERNAME>Sundara Textiles Pvt Ltd</PARTYLEDGERNAME><NARRATION>Against Inv 1042 &amp; others</NARRATION>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sundara Textiles Pvt Ltd</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>125000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-125000.00</AMOUNT>
   <BANKALLOCATIONS.LIST><INSTRUMENTNUMBER>HDFCN52026090112345</INSTRUMENTNUMBER></BANKALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
 </VOUCHER>
</TALLYMESSAGE>
<TALLYMESSAGE>
 <VOUCHER VCHTYPE="Payment"><DATE>20260903</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>P-7</VOUCHERNUMBER>
  <PARTYLEDGERNAME>Ramesh Kumar</PARTYLEDGERNAME>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Ramesh Kumar</LEDGERNAME><AMOUNT>-15000</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>15000</AMOUNT></ALLLEDGERENTRIES.LIST>
 </VOUCHER>
 <VOUCHER><DATE>20260904</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><ISCANCELLED>Yes</ISCANCELLED>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>500</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>
 <VOUCHER><DATE>20260930</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><NARRATION>Bank charges for Sept</NARRATION>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Charges</LEDGERNAME><AMOUNT>-17.70</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>17.70</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>
</TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

describe("Tally XML", () => {
  it("turns vouchers into rows with direction from the bank ledger", () => {
    const rows = rowsFromTally(TALLY);
    expect(rows).toHaveLength(3); // cancelled voucher skipped
    expect(rows[0]).toMatchObject({
      date: "2026-09-01",
      amount: 125000,
      direction: "in",
      counterparty: "Sundara Textiles Pvt Ltd",
      reference: "HDFCN52026090112345",
      category: "receipt",
    });
    expect(rows[0].description).toBe("Against Inv 1042 & others");
    expect(rows[1]).toMatchObject({
      amount: 15000,
      direction: "out",
      counterparty: "Ramesh Kumar",
      reference: "P-7",
    });
    // "Bank Charges" is an expense ledger, not the bank account: money went out.
    expect(rows[2]).toMatchObject({ amount: 17.7, direction: "out" });
  });
});

describe("PDF text statements", () => {
  it("confirms amounts and direction through the running balance", () => {
    const text = [
      "Opening Balance 4,00,000.00",
      "01/09/2026 NEFT CR SUNDARA TEXTILES 1,25,000.00 5,25,000.00",
      "03/09/2026 UPI AMAZON PAY 2,499.00 5,22,501.00",
      "Closing Balance 5,22,501.00",
    ].join("\n");
    const { rows, verifiedShare } = rowsFromStatementText(text);
    expect(verifiedShare).toBe(1);
    expect(
      rows.map((r) => [r.direction, r.amount, r.parse_confidence]),
    ).toEqual([
      ["in", 125000, 0.95],
      ["out", 2499, 0.95],
    ]);
  });
});

describe("classification helpers", () => {
  it("pulls counterparties and references out of narrations", () => {
    expect(
      counterpartyFromNarration(
        "NEFT CR-HDFC0001234-SUNDARA TEXTILES PVT LTD-INV 1042",
      ),
    ).toBe("SUNDARA TEXTILES PVT LTD");
    expect(
      counterpartyFromNarration(
        "UPI/DR/624512345678/AMAZON PAY/YESB/amazon@apl",
      ),
    ).toBe("AMAZON PAY");
    expect(referenceFromNarration("UPI/DR/624512345678/AMAZON PAY")).toBe(
      "624512345678",
    );
  });

  it("never lets the AI lift confidence above the parser's", () => {
    const [row] = rowsFromTable(
      parseDelimited(
        "Date,Description,Amount\n01/09/2026,Stripe payout,1200.00 USD",
      ),
    )!;
    const scored = scoreRow(row, {
      index: row.row_index,
      confidence: 0.99,
      category: "receipt",
    });
    expect(scored.route).toBe("review");
  });

  it("rejects AI-read amounts that are not printed in the document", () => {
    expect(amountAppearsIn(125000, "Total 1,25,000.00")).toBe(true);
    const rows = rowsFromAiRead(
      [
        {
          date: "2026-09-01",
          amount: 99999,
          direction: "out",
          description: "x",
          confidence: 0.95,
        },
      ],
      "Invoice total 1,25,000.00",
    );
    expect(rows[0].parse_confidence).toBeLessThanOrEqual(0.4);
    expect(rows[0].parse_issues.join(" ")).toMatch(/does not appear/);
  });
});

describe("pipeline", () => {
  it("detects file types by content, not just extension", () => {
    expect(detectKind(enc("%PDF-1.7"), "x.csv", null)).toBe("pdf");
    expect(
      detectKind(
        new Uint8Array([0x50, 0x4b, 3, 4]),
        "statement.csv",
        "text/csv",
      ),
    ).toBe("xlsx");
    expect(detectKind(enc(TALLY), "daybook.xml", null)).toBe("tally_xml");
    expect(detectKind(enc("a,b"), "x.csv", null)).toBe("csv");
  });

  it("routes rows by confidence and sends in-file duplicates to review without an AI", async () => {
    const dup = `${HDFC.split("\nTotal")[0]}\n05/09/26,SMS CHGS FOR QTR,,05/09/26,17.70,,"5,07,465.60"`;
    const out = await runExtract(
      {
        bytes: enc(dup),
        filename: "hdfc.csv",
        mime: "text/csv",
        side: "bank",
        businessId: "b1",
      },
      { llm: null },
    );
    expect(out.error).toBeNull();
    expect(out.rows.filter((r) => r.route === "transaction")).toHaveLength(4);
    expect(out.duplicateRows).toBe(1);
    const review = out.rows.filter((r) => r.route === "review");
    expect(review).toHaveLength(1);
    expect(review[0].reason).toMatch(/Identical to row/);
    expect(out.rows[3].category).toBe("bank_charge");
  });

  it("uses AI verdicts but keeps going when the AI fails", async () => {
    let calls = 0;
    const llm: LlmClient = {
      async json() {
        calls++;
        if (calls > 1) throw new Error("429 rate limited");
        return {
          data: {
            rows: [
              {
                index: 5,
                category: "receipt",
                counterparty: "SUNDARA TEXTILES PVT LTD",
                confidence: 0.6,
                reason: "Invoice number unclear",
              },
            ],
          },
          provider: "test",
          model: "m",
          latency_ms: 1,
          raw: "{}",
        };
      },
    };
    const out = await runExtract(
      {
        bytes: enc(HDFC),
        filename: "hdfc.csv",
        mime: null,
        side: "bank",
        businessId: "b1",
      },
      { llm },
    );
    const first = out.rows.find((r) => r.row_index === 5)!;
    expect(first.route).toBe("review");
    expect(first.reason).toContain("Invoice number unclear");
    expect(out.aiCalls[0].status).toBe("success");
  });

  it("explains scanned PDFs when no AI reader is configured", async () => {
    const out = await runExtract(
      {
        bytes: enc("%PDF-1.4 binary"),
        filename: "scan.pdf",
        mime: "application/pdf",
        side: "books",
        businessId: null,
      },
      { llm: null, pdfText: async () => ({ text: "", pages: 1 }) },
    );
    expect(out.error?.code).toBe("needs_ai");
  });

  it("builds stable dedupe keys", () => {
    const a = dedupeKey({
      business_id: "b",
      side: "bank",
      date: "2026-09-01",
      direction: "in",
      amount: 100,
      reference: "ref-001",
      description: "x",
    });
    const b = dedupeKey({
      business_id: "b",
      side: "bank",
      date: "2026-09-01",
      direction: "in",
      amount: 100.0,
      reference: "REF001",
      description: "different",
    });
    expect(a).toBe(b);
  });
});
