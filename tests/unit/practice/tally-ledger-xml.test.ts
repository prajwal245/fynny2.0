import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isTallyLedgerXml,
  ledgerTotalsNote,
  readTallyLedgerXml,
} from "@/lib/practice/extract/tallyLedger";
import { readTally } from "@/lib/practice/extract/tally";
import { runExtract } from "@/lib/practice/extract/pipeline";

/** Tally writes XML as UTF-16 (little endian, with a byte order mark) by default; other exports are UTF-8. */
const bytes = (n: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/tally/${n}`));
const fx = (n: string) => {
  const b = bytes(n);
  return new TextDecoder(
    b[0] === 0xff && b[1] === 0xfe ? "utf-16le" : "utf-8",
  ).decode(b);
};
const cash = fx("cash-book-ledger-export.xml");

describe("Tally Ledger Vouchers exported as XML (a real cash book export)", () => {
  it("is UTF-16 as Tally writes it, and is recognised as a ledger report; a Day Book is not", () => {
    expect(bytes("cash-book-ledger-export.xml").slice(0, 2)).toEqual(
      new Uint8Array([0xff, 0xfe]),
    );
    expect(isTallyLedgerXml(cash)).toBe(true);
    expect(isTallyLedgerXml(fx("day-book-november-2026.xml"))).toBe(false);
    expect(isTallyLedgerXml("<ENVELOPE><VOUCHER></VOUCHER></ENVELOPE>")).toBe(
      false,
    );
  });

  it("reads all eight lines with the right side, amount, date, number and narration", () => {
    const r = readTallyLedgerXml(cash);
    expect(r.lines).toBe(8);
    expect(r.rows).toHaveLength(8);
    expect(r.skipped).toBe(0);
    const first = r.rows[0]!;
    expect(first).toMatchObject({
      date: "2026-09-04",
      amount: 30000,
      direction: "in",
      counterparty: "SBI Current A/c 3871",
      reference: "1",
      category: "transfer",
      description: "Cash withdrawn for office use",
    });
    const pay = r.rows[1]!;
    expect(pay).toMatchObject({
      date: "2026-09-09",
      amount: 2647.96,
      direction: "out",
      counterparty: "Staff Welfare",
      reference: "16",
      category: "payment",
    });
  });

  it("a debit is money in and a credit is money out, whatever the sign Tally wrote", () => {
    const r = readTallyLedgerXml(cash);
    expect(
      r.rows.filter((x) => x.direction === "in").map((x) => x.amount),
    ).toEqual([30000, 40000]);
    expect(r.rows.filter((x) => x.direction === "out")).toHaveLength(6);
    const positiveDebit = cash
      .replace("-30000.00", "30000.00")
      .replace("-40000.00", "40000.00");
    expect(
      readTallyLedgerXml(positiveDebit).rows.map((x) => [
        x.direction,
        x.amount,
      ]),
    ).toEqual(r.rows.map((x) => [x.direction, x.amount]));
  });

  it("totals add up exactly, to the paisa, for a person to tick against Tally", () => {
    const r = readTallyLedgerXml(cash);
    expect(r.debitPaise).toBe(7_000_000);
    expect(r.creditPaise).toBe(2_442_021);
    expect(r.firstDate).toBe("2026-09-04");
    expect(r.lastDate).toBe("2026-09-26");
    expect(ledgerTotalsNote(r)).toContain(
      "Debits ₹70,000.00, credits ₹24,420.21",
    );
    expect(ledgerTotalsNote(r)).toContain("8 entries");
  });

  it("leaves out a heading, an opening balance or a total (no date or no amount), and says how many", () => {
    const withOpening = `<ENVELOPE><DSPVCHLEDACCOUNT>Opening Balance</DSPVCHLEDACCOUNT><DSPVCHDRAMT>-5000.00</DSPVCHDRAMT>${cash.replace("<ENVELOPE>", "")}`;
    const r = readTallyLedgerXml(withOpening);
    expect(r.rows).toHaveLength(8);
    expect(r.skipped).toBe(1);
  });

  it("decodes names with an ampersand and handles empty self-closing tags", () => {
    const x = `<ENVELOPE><DSPVCHDATE>3-Oct-26</DSPVCHDATE><DSPVCHLEDACCOUNT>Sharma &amp; Sons</DSPVCHLEDACCOUNT><NAMEFIELD/><INFOFIELD/><DSPVCHTYPE>Rcpt</DSPVCHTYPE><DSPVCHDRAMT>-1,250.50</DSPVCHDRAMT><DSPVCHCRAMT/><DSPEXPLVCHNUMBER>(No. :7)</DSPEXPLVCHNUMBER></ENVELOPE>`;
    const r = readTallyLedgerXml(x);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      counterparty: "Sharma & Sons",
      amount: 1250.5,
      direction: "in",
      category: "receipt",
      reference: "7",
      description: "Receipt — Sharma & Sons",
    });
  });

  it("flags a voucher type it does not know instead of guessing", () => {
    const x = `<ENVELOPE><DSPVCHDATE>3-Oct-26</DSPVCHDATE><DSPVCHLEDACCOUNT>X</DSPVCHLEDACCOUNT><DSPVCHTYPE>Zzz</DSPVCHTYPE><DSPVCHCRAMT>10.00</DSPVCHCRAMT></ENVELOPE>`;
    const r = readTallyLedgerXml(x);
    expect(r.rows[0]!.parse_issues[0]).toMatch(/Unfamiliar voucher type "Zzz"/);
    expect(r.rows[0]!.parse_confidence).toBeLessThan(0.8);
  });

  it("goes through the whole Extract pipeline as books, with the totals in its note", async () => {
    const out = await runExtract(
      {
        bytes: bytes("cash-book-ledger-export.xml"),
        filename: "05_Cash_book_Tally_ledger_export_6.xml",
        mime: "text/xml",
        side: "books",
      } as never,
      {} as never,
    );
    expect(out.error).toBeNull();
    expect(out.kind).toBe("tally_xml");
    expect(out.documentKind).toBe("tally_export");
    expect(out.rows).toHaveLength(8);
    expect(out.note).toContain("Debits ₹70,000.00");
  });
});

describe("a real Tally Day Book (November 2026, 123 vouchers)", () => {
  const day = fx("day-book-november-2026.xml");
  it("reads every voucher, keeps bank movements, and leaves cash-only and non-bank vouchers out openly", () => {
    const r = readTally(day);
    expect(r.vouchers).toBe(123);
    expect(r.skippedCancelled).toBe(0);
    expect(r.rows.length + r.skippedNonBank + r.skippedCash).toBe(123);
    expect(r.skippedNonBank).toBeGreaterThan(40); // sales, purchases and journals
  });
  it("two vouchers can share a REMOTEID (Receipt 15 and Purchase 15 on 6 Nov): neither is lost", () => {
    const r = readTally(day);
    expect(
      r.rows.some(
        (x) =>
          x.date === "2026-11-06" &&
          x.amount === 455369.54 &&
          x.direction === "in",
      ),
    ).toBe(true);
    expect(r.vouchers).toBe((day.match(/<VOUCHER\b/g) ?? []).length);
  });
});
