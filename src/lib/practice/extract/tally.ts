/**
 * Tally XML → extracted rows.
 *
 * Works on the usual exports (Day Book, vouchers, ledger vouchers) by finding
 * every <VOUCHER> wherever it sits in the envelope. In Tally, a negative
 * AMOUNT on a ledger entry is a debit (ISDEEMEDPOSITIVE = Yes).
 */
import { parseMoneyCell } from "@/lib/bankAmount";
import { parseDate, round2, type Direction, type ExtractedRow, type TxnCategory } from "../core";
import { childText, children, findAll, parseXml, type XmlNode } from "./xml";

const TYPE_MAP: Record<string, { direction: Direction | null; category: TxnCategory }> = {
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
  instrument: string | null;
}

const BANK_HINT = /\b(bank|hdfc|icici|sbi|axis|kotak|yes bank|idfc|indusind|federal|canara|pnb|bob|union bank|cash)\b/i;

function ledgerEntries(v: XmlNode): LedgerEntry[] {
  const lists = [
    ...children(v, "ALLLEDGERENTRIES.LIST"),
    ...children(v, "LEDGERENTRIES.LIST"),
  ];
  return lists.map((l) => {
    const alloc = children(l, "BANKALLOCATIONS.LIST")[0];
    const instrument = alloc
      ? childText(alloc, "INSTRUMENTNUMBER") || childText(alloc, "UNIQUEREFERENCEID") || childText(alloc, "TRANSACTIONID") || null
      : null;
    const money = parseMoneyCell(childText(l, "AMOUNT"));
    const ledger = childText(l, "LEDGERNAME");
    return {
      ledger,
      amount: money.sign === -1 ? -money.value : money.value,
      isBank: Boolean(alloc) || BANK_HINT.test(ledger),
      instrument,
    };
  });
}

export function isTallyXml(text: string): boolean {
  const head = text.slice(0, 4000).toUpperCase();
  return head.includes("<ENVELOPE") || head.includes("<TALLYMESSAGE") || head.includes("<VOUCHER");
}

export function rowsFromTally(xml: string): ExtractedRow[] {
  const doc = parseXml(xml);
  const vouchers = findAll(doc, "VOUCHER");
  const out: ExtractedRow[] = [];
  vouchers.forEach((v, idx) => {
    const vtype = (childText(v, "VOUCHERTYPENAME") || v.attrs.VCHTYPE || "").trim();
    const kind = TYPE_MAP[vtype.toLowerCase()] ?? null;
    const date = parseDate(childText(v, "DATE") || childText(v, "EFFECTIVEDATE"));
    const party = childText(v, "PARTYLEDGERNAME") || childText(v, "PARTYNAME") || null;
    const narration = childText(v, "NARRATION");
    const vno = childText(v, "VOUCHERNUMBER") || null;
    const entries = ledgerEntries(v);
    const cancelled = /^yes$/i.test(childText(v, "ISCANCELLED")) || /^yes$/i.test(childText(v, "ISOPTIONAL"));
    if (cancelled) return;

    const issues: string[] = [];
    let confidence = 0.95;

    const bankEntry = entries.find((e) => e.isBank);
    const partyEntry = party ? entries.find((e) => e.ledger === party) : undefined;
    const pick = bankEntry ?? partyEntry ?? [...entries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
    const amount = pick ? round2(Math.abs(pick.amount)) : 0;

    // Direction from the bank ledger's side is the most reliable signal:
    // bank debited (negative in Tally) means money came in.
    let direction: Direction | null = null;
    if (bankEntry && bankEntry.amount !== 0) direction = bankEntry.amount < 0 ? "in" : "out";
    else if (kind?.direction) direction = kind.direction;
    if (!direction) {
      direction = "out";
      issues.push(`${vtype || "Voucher"} has no bank ledger, so money in/out was assumed`);
      confidence = 0.55;
    }
    if (!kind) { issues.push(`Unfamiliar voucher type "${vtype}"`); confidence = Math.min(confidence, 0.7); }
    if (!date) { issues.push("Voucher date missing"); confidence = 0.3; }
    if (!amount) return;

    const counterparty = party ?? entries.find((e) => !e.isBank && e !== pick)?.ledger ?? null;
    const reference = bankEntry?.instrument || childText(v, "REFERENCE") || vno;
    const rawText = [
      `Voucher ${vtype} #${vno ?? "?"}`,
      `Date ${childText(v, "DATE")}`,
      party ? `Party ${party}` : "",
      narration ? `Narration ${narration}` : "",
      ...entries.map((e) => `${e.ledger}: ${e.amount}`),
    ].filter(Boolean).join(" | ");

    out.push({
      row_index: idx,
      raw_text: rawText,
      date,
      amount,
      direction,
      description: narration || [vtype, counterparty].filter(Boolean).join(" — "),
      counterparty,
      reference: reference || null,
      category: kind?.category ?? null,
      currency: "INR",
      balance: null,
      parse_confidence: confidence,
      parse_issues: issues,
    });
  });
  return out;
}
