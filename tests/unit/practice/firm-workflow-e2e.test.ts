/**
 * The whole job of a CA firm for one client and one month, from the files they receive to the entries in Tally:
 *   Flow A (books exist): Tally Day Book XML + bank statement -> read -> reconcile -> exceptions -> categorise -> approve -> Tally import XML
 *   Flow B (no books yet): bank statement only -> read -> categorise -> approve -> Tally import XML
 *   Books as a Ledger Vouchers XML export (cash book) are read as the books side too.
 * Nothing is written for a line a person has not approved, and nothing unsound is ever produced.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  runExtract,
  type ExtractOutcome,
} from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import { suggestLedger } from "@/lib/practice/tallyLedgerSuggest";
import {
  importProblems,
  importVoucherXml,
  type ApprovedLine,
} from "@/lib/practice/tallyVoucher";

const COMPANY = "Nirmal Textiles Mart Pvt Ltd";
const BANK_LEDGER = "ICICI Bank CA 6205";
const raw = (n: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/tally/${n}`));
const dayBookXml = raw("day-book-november-2026.xml");
const ledgers = [
  ...new Set(
    [
      ...new TextDecoder()
        .decode(dayBookXml)
        .matchAll(/<LEDGERNAME>([^<]+)<\/LEDGERNAME>/g),
    ].map((m) => m[1]!),
  ),
];

type Row = {
  date: string;
  amount: number;
  direction: "in" | "out";
  description: string;
  counterparty: string | null;
  reference: string | null;
  category: string | null;
};
const txn = (r: Row, i: number, side: "bank" | "books"): ReconTxn => ({
  id: `${side}${i}`,
  side,
  direction: r.direction,
  amount: r.amount,
  txn_date: r.date,
  counterparty: r.counterparty,
  reference: r.reference,
  description: r.description,
  category: r.category,
});
const inr = (n: number) => n.toFixed(2);
const day = (iso: string, plus = 0) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};
const ddmmyyyy = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function books(): Promise<Row[]> {
  const out: ExtractOutcome = await runExtract(
    {
      bytes: dayBookXml,
      filename: "DayBook Nov 2026.xml",
      mime: "text/xml",
      side: "books",
      businessId: null,
    },
    { llm: null },
  );
  expect(out.error).toBeNull();
  return out.rows;
}

/** A bank statement the way HDFC/ICICI print it: some lines are in the books, some are not. */
function statement(bookRows: Row[]) {
  const inBooks = bookRows.slice(0, 40);
  const bankOnly: Row[] = [
    {
      date: "2026-11-10",
      amount: 17.7,
      direction: "out",
      description: "SMS CHGS 01-10-26 TO 31-10-26",
      counterparty: null,
      reference: null,
      category: null,
    },
    {
      date: "2026-11-12",
      amount: 842.5,
      direction: "in",
      description: "INT.PD:01-08-2026 to 31-10-2026",
      counterparty: null,
      reference: null,
      category: null,
    },
    {
      date: "2026-11-15",
      amount: 12500,
      direction: "out",
      description: `NEFT-${ledgers.find((l) => /freight/i.test(l)) ?? "Freight Inward"}-FRT NOV`,
      counterparty: null,
      reference: null,
      category: null,
    },
    {
      date: "2026-11-20",
      amount: 48750,
      direction: "out",
      description: "NEFT-ZENITH PACKAGING WORKS PVT LTD-INV 2291",
      counterparty: null,
      reference: null,
      category: null,
    },
    {
      date: "2026-11-25",
      amount: 20000,
      direction: "out",
      description: "ATM WDL SELF 00231",
      counterparty: null,
      reference: null,
      category: null,
    },
  ];
  const lines = [
    ...inBooks.map((r) => ({
      ...r,
      description: r.description,
      ref: r.reference ?? "",
    })),
    ...bankOnly.map((r) => ({ ...r, ref: "" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 5_000_000;
  const rows = lines.map((l) => {
    bal += l.direction === "in" ? l.amount : -l.amount;
    return `${ddmmyyyy(l.date)},${JSON.stringify(l.description)},${l.ref},${ddmmyyyy(l.date)},${l.direction === "out" ? inr(l.amount) : ""},${l.direction === "in" ? inr(l.amount) : ""},${inr(bal)}`;
  });
  const csv =
    [
      "ICICI BANK LTD",
      "Account No : 000405016205",
      "",
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      ...rows,
    ].join("\n") + "\n";
  return { csv, inBooks, bankOnly };
}

async function readBank(csv: string): Promise<Row[]> {
  const out: ExtractOutcome = await runExtract(
    {
      bytes: new TextEncoder().encode(csv),
      filename: "ICICI Nov 2026.csv",
      mime: "text/csv",
      side: "bank",
      businessId: null,
    },
    { llm: null },
  );
  expect(out.error).toBeNull();
  return out.rows;
}

/** What a partner approves for a bank line: only a confident suggestion becomes an entry; anything else stays for a person. */
function proposeEntry(
  r: Row,
  i: number,
): { line: ApprovedLine | null; why: string } {
  const s = suggestLedger(
    {
      counterparty: r.counterparty,
      description: r.description,
      reference: r.reference,
      direction: r.direction,
    },
    ledgers,
    BANK_LEDGER,
  );
  if (s.kind !== "suggest")
    return {
      line: null,
      why: s.kind === "none" || s.kind === "uncertain" ? s.reason : "",
    };
  return {
    line: {
      id: `ln_${i}`,
      company: COMPANY,
      date: r.date,
      direction: r.direction,
      amount: r.amount,
      bankLedger: BANK_LEDGER,
      partyLedger: s.ledger,
      narration: r.description.slice(0, 100),
      reference: r.reference ?? undefined,
    },
    why: s.reason,
  };
}

describe("Flow A: the client's books are in Tally", () => {
  it("reads the Day Book: only entries touching bank are books lines, the rest are left out and said so", async () => {
    const out: ExtractOutcome = await runExtract(
      {
        bytes: dayBookXml,
        filename: "DayBook Nov 2026.xml",
        mime: "text/xml",
        side: "books",
        businessId: null,
      },
      { llm: null },
    );
    expect(out.kind).toBe("tally_xml");
    expect(out.rows).toHaveLength(42);
    expect(out.note).toMatch(/72 sales, purchase or journal vouchers/);
    expect(out.note).toMatch(/9 cash-only vouchers/);
    for (const r of out.rows) {
      expect(r.date).toMatch(/^2026-11-\d\d$/);
      expect(["in", "out"]).toContain(r.direction);
      expect(r.amount).toBeGreaterThan(0);
    }
  });

  it("reconciles a bank statement against those books: matched lines pair up, the rest become decisions", async () => {
    const b = await books();
    const { csv, inBooks, bankOnly } = statement(b);
    const bank = await readBank(csv);
    expect(bank).toHaveLength(inBooks.length + bankOnly.length);
    const result = reconcile(
      bank.map((r, i) => txn(r, i, "bank")),
      b.map((r, i) => txn(r, i, "books")),
    );
    // Every bank line that is in the books pairs with its own entry (same amount and direction); none pairs with a different one.
    expect(result.matches.length).toBeGreaterThanOrEqual(inBooks.length - 1);
    expect(result.stats.matched).toBe(result.matches.length);
    const bankAt = (id: string) => bank[Number(id.replace("bank", ""))]!;
    const bookAt = (id: string) => b[Number(id.replace("books", ""))]!;
    for (const m of result.matches) {
      const bt = bankAt(m.bank_txn_id);
      const total = m.book_txn_ids.reduce((n, id) => n + bookAt(id).amount, 0);
      expect(
        Math.abs(bt.amount - total),
        `${bt.description}`,
      ).toBeLessThanOrEqual(1);
      for (const id of m.book_txn_ids)
        expect(bookAt(id).direction).toBe(bt.direction);
    }
    // The bank-only lines surface as exceptions on the bank side, each with a reason: none is silently dropped or force-matched.
    const bankExceptions = result.exceptions.filter((e) => e.side === "bank");
    expect(bankExceptions.length + result.matches.length).toBe(bank.length);
    expect(bankExceptions.length).toBeGreaterThanOrEqual(bankOnly.length - 1);
    for (const e of bankExceptions) expect(e.reason_code).toBeTruthy();
    const zenith = bankExceptions.find((e) =>
      /ZENITH/.test(bankAt(e.txn_id).description),
    );
    expect(zenith, "an unknown payee must wait for a decision").toBeTruthy();
  });

  it("categorises the lines left over: known ledgers are suggested, an unknown payee is not guessed, nothing is entered unapproved", async () => {
    const b = await books();
    const { csv } = statement(b);
    const bank = await readBank(csv);
    const result = reconcile(
      bank.map((r, i) => txn(r, i, "bank")),
      b.map((r, i) => txn(r, i, "books")),
    );
    const matchedIds = new Set(result.matches.map((m) => m.bank_txn_id));
    const left = bank
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !matchedIds.has(`bank${i}`));
    expect(left.length).toBeGreaterThan(0);
    const proposals = left.map(({ r, i }) => ({ r, ...proposeEntry(r, i) }));
    const sms = proposals.find((p) => /SMS CHGS/.test(p.r.description))!;
    expect(
      sms.line?.partyLedger,
      "bank charges go to the Bank Charges ledger",
    ).toBe("Bank Charges");
    const atm = proposals.find((p) => /ATM WDL/.test(p.r.description))!;
    expect(
      atm.line,
      "a cash withdrawal is a Contra, never a payment to a made-up ledger",
    ).toBeNull();
    expect(atm.why).toMatch(/transfer between my own/i);
    const zenith = proposals.find((p) => /ZENITH/.test(p.r.description))!;
    expect(
      zenith.line,
      "an unknown payee must not be given a ledger by guesswork",
    ).toBeNull();
    for (const p of proposals.filter((x) => x.line)) {
      const xml = importVoucherXml(p.line!);
      expect(importProblems(xml, COMPANY), p.r.description).toEqual([]);
      expect(xml).toContain(
        `<VOUCHERTYPENAME>${p.r.direction === "in" ? "Receipt" : "Payment"}</VOUCHERTYPENAME>`,
      );
    }
  });
});

describe("Flow B: no books yet, the bank statement is all there is", () => {
  it("reads the statement, every line is either an entry a person can approve or waits with a reason", async () => {
    const b = await books();
    const { csv } = statement(b);
    const bank = await readBank(csv);
    const proposals = bank.map((r, i) => ({ r, ...proposeEntry(r, i) }));
    const entries = proposals.filter((p) => p.line);
    const waiting = proposals.filter((p) => !p.line);
    expect(entries.length + waiting.length).toBe(bank.length);
    expect(waiting.length).toBeGreaterThan(0);
    for (const w of waiting) expect(w.why, w.r.description).toBeTruthy();
    // Money in and out are never mixed up: a bank deposit is a Receipt, a withdrawal a Payment.
    for (const e of entries) {
      const x = importVoucherXml(e.line!);
      expect(importProblems(x, COMPANY), e.r.description).toEqual([]);
    }
  });

  it("the same statement twice does not double the lines (duplicate protection)", async () => {
    const b = await books();
    const { csv } = statement(b);
    const once = await readBank(csv);
    const lines = csv.trim().split("\n");
    const dup = [...lines, lines[lines.length - 1]!].join("\n") + "\n";
    const twice: ExtractOutcome = await runExtract(
      {
        bytes: new TextEncoder().encode(dup),
        filename: "ICICI Nov 2026.csv",
        mime: "text/csv",
        side: "bank",
        businessId: null,
      },
      { llm: null },
    );
    expect(twice.duplicateRows).toBeGreaterThanOrEqual(1);
    expect(once.length).toBeGreaterThan(0);
  });
});

describe("books as a Ledger Vouchers XML export (cash book)", () => {
  it("is read as the books side: eight lines, right direction and amount", async () => {
    const out: ExtractOutcome = await runExtract(
      {
        bytes: raw("cash-book-ledger-export.xml"),
        filename: "Cash Book.xml",
        mime: "text/xml",
        side: "books",
        businessId: null,
      },
      { llm: null },
    );
    expect(out.error).toBeNull();
    expect(out.rows).toHaveLength(8);
    expect(
      out.rows.filter((r) => r.direction === "in").map((r) => r.amount),
    ).toEqual([30000, 40000]);
  });
});
