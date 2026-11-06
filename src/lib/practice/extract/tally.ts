/**
 * Tally XML → extracted rows.
 *
 * Works on the usual exports (Day Book, vouchers, ledger vouchers) by finding
 * every <VOUCHER> wherever it sits in the envelope. In Tally, a negative
 * AMOUNT on a ledger entry is a debit (ISDEEMEDPOSITIVE = Yes).
 */
import { parseMoneyCell } from "@/lib/bankAmount";
import {
  parseDate,
  round2,
  type Direction,
  type ExtractedRow,
  type TxnCategory,
} from "../core";
import { childText, children, findAll, parseXml, type XmlNode } from "./xml";

const TYPE_MAP: Record<
  string,
  { direction: Direction | null; category: TxnCategory }
> = {
  receipt: { direction: "in", category: "receipt" },
  payment: { direction: "out", category: "payment" },
  sales: { direction: "in", category: "sales_invoice" },
  "credit note": { direction: "out", category: "sales_invoice" },
  purchase: { direction: "out", category: "purchase_invoice" },
  "debit note": { direction: "in", category: "purchase_invoice" },
  contra: { direction: null, category: "transfer" },
  journal: { direction: null, category: "journal" },
};

interface LedgerEntry {
  ledger: string;
  amount: number; // signed as in Tally: negative = debit
  isBank: boolean;
  hasAllocation: boolean;
  instrument: string | null;
}

const NOT_BANK = /\b(charges?|interest|commission|fees?|gst|tds|loan)\b/i;
const BANK_HINT =
  /\b(bank|hdfc|icici|sbi|axis|kotak|yes bank|idfc|indusind|federal|canara|pnb|bob|union bank|cash)\b/i;

function ledgerEntries(v: XmlNode): LedgerEntry[] {
  const lists = [
    ...children(v, "ALLLEDGERENTRIES.LIST"),
    ...children(v, "LEDGERENTRIES.LIST"),
  ];
  return lists.map((l) => {
    const alloc = children(l, "BANKALLOCATIONS.LIST")[0];
    const instrument = alloc
      ? childText(alloc, "INSTRUMENTNUMBER") ||
        childText(alloc, "UNIQUEREFERENCEID") ||
        childText(alloc, "TRANSACTIONID") ||
        null
      : null;
    const money = parseMoneyCell(childText(l, "AMOUNT"));
    const ledger = childText(l, "LEDGERNAME");
    return {
      ledger,
      amount: money.sign === -1 ? -money.value : money.value,
      // "Bank Charges" / "Bank Interest" are expense or income ledgers, not the bank account.
      isBank:
        Boolean(alloc) || (BANK_HINT.test(ledger) && !NOT_BANK.test(ledger)),
      hasAllocation: Boolean(alloc),
      instrument,
    };
  });
}

export function isTallyXml(text: string): boolean {
  const head = text.slice(0, 4000).toUpperCase();
  return (
    head.includes("<ENVELOPE") ||
    head.includes("<TALLYMESSAGE") ||
    head.includes("<VOUCHER")
  );
}

/** Voucher types that move no money through the bank or cash: they are not bank-reconciliation lines. */
const NON_BANK_TYPES = new Set(["sales", "purchase", "journal", "credit note", "debit note", "memorandum", "rejections out", "rejections in"]);

export interface TallyRead {
  rows: ExtractedRow[];
  /** Vouchers read but left out of bank reconciliation because no bank or cash ledger is in them (sales, purchase, journal...). */
  skippedNonBank: number;
  /** Cancelled and optional vouchers. */
  skippedCancelled: number;
  /** Every voucher found in the file, kept or not. */
  vouchers: number;
}

export function rowsFromTally(xml: string): ExtractedRow[] {
  return readTally(xml).rows;
}

/** Like rowsFromTally, and also says what was left out and why, so the screen can tell the person. */
export function readTally(xml: string): TallyRead {
  const doc = parseXml(xml);
  const vouchers = findAll(doc, "VOUCHER");
  const out: ExtractedRow[] = [];
  let skippedNonBank = 0;
  let skippedCancelled = 0;
  vouchers.forEach((v, idx) => {
    const vtype = (
      childText(v, "VOUCHERTYPENAME") ||
      v.attrs.VCHTYPE ||
      ""
    ).trim();
    const kind = TYPE_MAP[vtype.toLowerCase()] ?? null;
    const date = parseDate(
      childText(v, "DATE") || childText(v, "EFFECTIVEDATE"),
    );
    const party =
      childText(v, "PARTYLEDGERNAME") || childText(v, "PARTYNAME") || null;
    const narration = childText(v, "NARRATION");
    const vno = childText(v, "VOUCHERNUMBER") || null;
    const entries = ledgerEntries(v);
    const cancelled =
      /^yes$/i.test(childText(v, "ISCANCELLED")) ||
      /^yes$/i.test(childText(v, "ISOPTIONAL"));
    if (cancelled) {
      skippedCancelled++;
      return;
    }

    const issues: string[] = [];
    let confidence = 0.95;

    // A ledger with bank allocations is certainly the bank account; a name match is second best.
    const bankEntry =
      entries.find((e) => e.hasAllocation) ?? entries.find((e) => e.isBank);
    const partyEntry = party
      ? entries.find((e) => e.ledger === party)
      : undefined;
    // A Day Book also holds sales, purchases and journals. With no bank or cash leg they are not bank
    // movements, so they stay out of bank reconciliation instead of showing up as unmatched items.
    if (!bankEntry && NON_BANK_TYPES.has(vtype.toLowerCase())) {
      skippedNonBank++;
      return;
    }
    const pick =
      bankEntry ??
      partyEntry ??
      [...entries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const amount = pick ? round2(Math.abs(pick.amount)) : 0;

    // Direction from the bank ledger's side is the most reliable signal:
    // bank debited (negative in Tally) means money came in.
    let direction: Direction | null = null;
    if (bankEntry && bankEntry.amount !== 0)
      direction = bankEntry.amount < 0 ? "in" : "out";
    else if (kind?.direction) direction = kind.direction;
    if (!direction) {
      direction = "out";
      issues.push(
        `${vtype || "Voucher"} has no bank ledger, so money in/out was assumed`,
      );
      confidence = 0.55;
    }
    if (!kind) {
      issues.push(`Unfamiliar voucher type "${vtype}"`);
      confidence = Math.min(confidence, 0.7);
    }
    if (!date) {
      issues.push("Voucher date missing");
      confidence = 0.3;
    }
    if (!amount) return;

    const counterparty =
      party ?? entries.find((e) => !e.isBank && e !== pick)?.ledger ?? null;
    const reference = bankEntry?.instrument || childText(v, "REFERENCE") || vno;
    const rawText = [
      `Voucher ${vtype} #${vno ?? "?"}`,
      `Date ${childText(v, "DATE")}`,
      party ? `Party ${party}` : "",
      narration ? `Narration ${narration}` : "",
      ...entries.map((e) => `${e.ledger}: ${e.amount}`),
    ]
      .filter(Boolean)
      .join(" | ");

    out.push({
      row_index: idx,
      raw_text: rawText,
      date,
      amount,
      direction,
      description:
        narration || [vtype, counterparty].filter(Boolean).join(" — "),
      counterparty,
      reference: reference || null,
      category: kind?.category ?? null,
      currency: "INR",
      balance: null,
      parse_confidence: confidence,
      parse_issues: issues,
    });
  });
  return { rows: out, skippedNonBank, skippedCancelled, vouchers: vouchers.length };
}
