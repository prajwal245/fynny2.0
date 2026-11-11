/**
 * Tally "Ledger Vouchers" exported as XML.
 *
 * Unlike a Day Book there is no <VOUCHER> wrapper. The report is a flat run of display tags, one group per line, and a
 * new line starts at each DSPVCHDATE:
 *
 *   DSPVCHDATE            4-Sep-26
 *   DSPVCHLEDACCOUNT      the other ledger of the entry (the "Particulars" column)
 *   NAMEFIELD             usually empty
 *   INFOFIELD             the narration
 *   DSPVCHTYPE            the voucher type, abbreviated: Ctra, Pymt, Rcpt, Jrnl, Sale, Purc ...
 *   DSPVCHDRAMT           debit amount of THIS ledger; Tally writes it NEGATIVE
 *   DSPVCHCRAMT           credit amount of THIS ledger; positive
 *   DSPEXPLVCHNUMBER      "(No. :16)"
 *
 * The side is decided by WHICH tag carries the amount, never by its sign, so a Tally version that writes the debit
 * positive is read the same way. For a bank or cash ledger a debit is money in and a credit is money out.
 *
 * The file names neither the ledger nor the company nor an opening balance. FynHelp therefore reads the lines and
 * reports the totals so a person can tick them against the ledger in Tally.
 */
import {
  parseDate,
  round2,
  type Direction,
  type ExtractedRow,
  type TxnCategory,
} from "../core";
import { decodeEntities } from "./xml";

const TAGS = [
  "DSPVCHDATE",
  "DSPVCHLEDACCOUNT",
  "NAMEFIELD",
  "INFOFIELD",
  "DSPVCHTYPE",
  "DSPVCHDRAMT",
  "DSPVCHCRAMT",
  "DSPEXPLVCHNUMBER",
] as const;
type Tag = (typeof TAGS)[number];

/** The abbreviations Tally prints in the Ledger Vouchers report, and the full names. */
const TYPES: Record<string, { name: string; category: TxnCategory }> = {
  ctra: { name: "Contra", category: "transfer" },
  contra: { name: "Contra", category: "transfer" },
  pymt: { name: "Payment", category: "payment" },
  payment: { name: "Payment", category: "payment" },
  rcpt: { name: "Receipt", category: "receipt" },
  receipt: { name: "Receipt", category: "receipt" },
  jrnl: { name: "Journal", category: "journal" },
  journal: { name: "Journal", category: "journal" },
  sale: { name: "Sales", category: "sales_invoice" },
  sales: { name: "Sales", category: "sales_invoice" },
  purc: { name: "Purchase", category: "purchase_invoice" },
  purchase: { name: "Purchase", category: "purchase_invoice" },
  crnt: { name: "Credit Note", category: "sales_invoice" },
  "credit note": { name: "Credit Note", category: "sales_invoice" },
  dbnt: { name: "Debit Note", category: "purchase_invoice" },
  "debit note": { name: "Debit Note", category: "purchase_invoice" },
};

/** True for the flat Ledger Vouchers report: display tags, no vouchers. */
export function isTallyLedgerXml(text: string): boolean {
  const head = text.slice(0, 60_000);
  return /<DSPVCHDATE\b/i.test(head) && !/<VOUCHER[\s>]/i.test(head);
}

export interface TallyLedgerRead {
  rows: ExtractedRow[];
  /** Lines in the report, with or without an amount. */
  lines: number;
  /** Lines with no date (a heading, an opening balance or a total) or no amount: left out. */
  skipped: number;
  /** Totals in paise, so they add up exactly. */
  debitPaise: number;
  creditPaise: number;
  firstDate: string | null;
  lastDate: string | null;
}

interface Line {
  [k: string]: string | undefined;
}

function lines(xml: string): Line[] {
  const out: Line[] = [];
  let cur: Line | null = null;
  const re = new RegExp(
    `<(${TAGS.join("|")})\\b[^>]*?(?:/>|>([\\s\\S]*?)</\\1\\s*>)`,
    "gi",
  );
  for (const m of xml.matchAll(re)) {
    const tag = m[1]!.toUpperCase() as Tag;
    const value = decodeEntities((m[2] ?? "").trim());
    if (tag === "DSPVCHDATE") {
      cur = {};
      out.push(cur);
    }
    if (!cur) {
      // A tag before the first date belongs to a heading; it starts a line of its own so nothing is lost.
      cur = {};
      out.push(cur);
    }
    // The first value wins: a second DSPVCHLEDACCOUNT in one line is a "(as per details)" breakdown of the same entry.
    if (cur[tag] === undefined || cur[tag] === "") cur[tag] = value;
  }
  return out;
}

/** Amount text to a positive number; the tag decides the side, the sign is ignored. "" and "-" are no amount. */
function amountOf(raw: string | undefined): number {
  const t = (raw ?? "").replace(/[,\s₹]/g, "").replace(/(dr|cr)$/i, "");
  if (!t || t === "-") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? round2(Math.abs(n)) : 0;
}

/** "(No. :16)" to "16". */
const numberOf = (raw: string | undefined): string | null => {
  const m = /No\.?\s*:?\s*([^)]*?)\s*\)?\s*$/i.exec(raw ?? "");
  const v = (m ? m[1] : (raw ?? "")).trim();
  return v || null;
};

export function readTallyLedgerXml(xml: string): TallyLedgerRead {
  const all = lines(xml);
  const rows: ExtractedRow[] = [];
  let skipped = 0;
  let debitPaise = 0;
  let creditPaise = 0;
  const dates: string[] = [];

  all.forEach((l, idx) => {
    const date = parseDate(l["DSPVCHDATE"]);
    const dr = amountOf(l["DSPVCHDRAMT"]);
    const cr = amountOf(l["DSPVCHCRAMT"]);
    if (!date || (!dr && !cr)) {
      skipped++;
      return;
    }
    dates.push(date);
    const typeRaw = (l["DSPVCHTYPE"] ?? "").trim();
    const type = TYPES[typeRaw.toLowerCase()] ?? null;
    const particulars = (l["DSPVCHLEDACCOUNT"] ?? "").trim() || null;
    const narration = (l["INFOFIELD"] ?? "").trim();
    const vno = numberOf(l["DSPEXPLVCHNUMBER"]);
    const sides: { amount: number; direction: Direction }[] = [];
    if (dr) sides.push({ amount: dr, direction: "in" });
    if (cr) sides.push({ amount: cr, direction: "out" });
    for (const s of sides) {
      const issues: string[] = [];
      let confidence = 0.95;
      if (!type) {
        issues.push(`Unfamiliar voucher type "${typeRaw}"`);
        confidence = 0.7;
      }
      if (sides.length > 1) {
        issues.push(
          "This line has both a debit and a credit amount; both were kept",
        );
        confidence = Math.min(confidence, 0.8);
      }
      if (s.direction === "in") debitPaise += Math.round(s.amount * 100);
      else creditPaise += Math.round(s.amount * 100);
      rows.push({
        row_index: idx,
        raw_text: [
          `Ledger entry ${type?.name ?? typeRaw} #${vno ?? "?"}`,
          `Date ${l["DSPVCHDATE"]}`,
          particulars ? `Particulars ${particulars}` : "",
          narration ? `Narration ${narration}` : "",
          `${s.direction === "in" ? "Debit" : "Credit"} ${s.amount.toFixed(2)}`,
        ]
          .filter(Boolean)
          .join(" | "),
        date,
        amount: s.amount,
        direction: s.direction,
        description:
          narration ||
          [type?.name ?? typeRaw, particulars].filter(Boolean).join(" — "),
        counterparty: particulars,
        reference: vno,
        category: type?.category ?? null,
        currency: "INR",
        balance: null,
        parse_confidence: confidence,
        parse_issues: issues,
      });
    }
  });
  const sorted = [...dates].sort();
  return {
    rows,
    lines: all.length,
    skipped,
    debitPaise,
    creditPaise,
    firstDate: sorted[0] ?? null,
    lastDate: sorted[sorted.length - 1] ?? null,
  };
}

/** One sentence for the person to tick against Tally: how many lines, the period and both totals. */
export function ledgerTotalsNote(r: TallyLedgerRead): string {
  const money = (p: number) =>
    `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const n = r.rows.length;
  return `Ledger export: ${n} entr${n === 1 ? "y" : "ies"} from ${r.firstDate} to ${r.lastDate}. Debits ${money(r.debitPaise)}, credits ${money(r.creditPaise)}. Check these totals against the ledger in Tally.`;
}
