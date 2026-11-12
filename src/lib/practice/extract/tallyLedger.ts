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
  "DSPVCHEXPLACCOUNT",
  "DSPVCHEXPLDRAMTEXCELEXPORT",
  "DSPVCHEXPLCRAMTEXCELEXPORT",
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
  /**
   * True for a customer or supplier ledger rather than a bank or cash book: its lines are invoices and the receipts
   * or payments against them. They are not money moving through the bank, so they must never be reconciled with it.
   */
  party: boolean;
  /** For a party ledger, in paise: what was invoiced (sales or purchases) and what was settled (receipts or payments). */
  invoicePaise: number;
  settledPaise: number;
  /** A customer ledger (sales invoices debit it); false for a supplier ledger. */
  customer: boolean;
  /** Invoice numbers that appear twice: the same bill entered twice. */
  duplicateInvoices: string[];
}

interface Line {
  [k: string]: string | undefined | Expl[];
  /** The "(as per details)" breakdown of one entry: each other ledger it touches and its amount. */
  expl?: Expl[];
}
interface Expl {
  account: string;
  amount: number;
}
const AS_PER_DETAILS = /^\(as per details\)$/i;

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
    if (tag === "DSPVCHEXPLACCOUNT") {
      (cur.expl ??= []).push({ account: value, amount: 0 });
      continue;
    }
    if (
      tag === "DSPVCHEXPLDRAMTEXCELEXPORT" ||
      tag === "DSPVCHEXPLCRAMTEXCELEXPORT"
    ) {
      const last = cur.expl?.[cur.expl.length - 1];
      if (last && !last.amount) last.amount = amountOf(value);
      continue;
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

const str = (l: Line, k: Tag): string | undefined => {
  const v = l[k];
  return typeof v === "string" ? v : undefined;
};

export function readTallyLedgerXml(xml: string): TallyLedgerRead {
  const all = lines(xml);
  const rows: ExtractedRow[] = [];
  let skipped = 0;
  let debitPaise = 0;
  let creditPaise = 0;
  const dates: string[] = [];

  all.forEach((l, idx) => {
    const date = parseDate(str(l, "DSPVCHDATE"));
    const dr = amountOf(str(l, "DSPVCHDRAMT"));
    const cr = amountOf(str(l, "DSPVCHCRAMT"));
    if (!date || (!dr && !cr)) {
      skipped++;
      return;
    }
    dates.push(date);
    const typeRaw = (str(l, "DSPVCHTYPE") ?? "").trim();
    const type = TYPES[typeRaw.toLowerCase()] ?? null;
    let particulars = (str(l, "DSPVCHLEDACCOUNT") ?? "").trim() || null;
    // "(as per details)" is Tally's way of saying the entry touches several ledgers (rent and TDS, GST heads, an invoice
    // and its taxes). The biggest of them names the line best.
    if (particulars && AS_PER_DETAILS.test(particulars)) {
      const biggest = [...(l.expl ?? [])].sort(
        (a, b) => b.amount - a.amount,
      )[0];
      particulars = biggest?.account || null;
    }
    const narration = (str(l, "INFOFIELD") ?? "").trim();
    const vno = numberOf(str(l, "DSPEXPLVCHNUMBER"));
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
          `Date ${str(l, "DSPVCHDATE")}`,
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

  // A customer or supplier ledger holds invoices ("(as per details)" over the invoice and its taxes) as well as the
  // receipts and payments against them. A bank or cash book never holds an invoice.
  const isInvoice = (l: Line) => {
    const t = TYPES[(str(l, "DSPVCHTYPE") ?? "").trim().toLowerCase()];
    return (
      t?.category === "sales_invoice" || t?.category === "purchase_invoice"
    );
  };
  const invoiceLines = all.filter(
    (l) =>
      isInvoice(l) &&
      AS_PER_DETAILS.test((str(l, "DSPVCHLEDACCOUNT") ?? "").trim()),
  );
  const party = invoiceLines.length > 0;
  const amt = (l: Line) =>
    Math.round(
      (amountOf(str(l, "DSPVCHDRAMT")) || amountOf(str(l, "DSPVCHCRAMT"))) *
        100,
    );
  const salesSide = invoiceLines.filter(
    (l) =>
      TYPES[(str(l, "DSPVCHTYPE") ?? "").trim().toLowerCase()]?.category ===
      "sales_invoice",
  );
  const customer = salesSide.length >= invoiceLines.length - salesSide.length;
  const settlement = (l: Line) => {
    const c =
      TYPES[(str(l, "DSPVCHTYPE") ?? "").trim().toLowerCase()]?.category;
    return c === "receipt" || c === "payment";
  };
  const seen = new Set<string>();
  const duplicateInvoices: string[] = [];
  for (const l of invoiceLines) {
    const n = numberOf(str(l, "DSPEXPLVCHNUMBER"));
    if (!n) continue;
    if (seen.has(n) && !duplicateInvoices.includes(n))
      duplicateInvoices.push(n);
    seen.add(n);
  }
  return {
    party,
    invoicePaise: invoiceLines.reduce((n, l) => n + amt(l), 0),
    settledPaise: all.filter(settlement).reduce((n, l) => n + amt(l), 0),
    customer,
    duplicateInvoices,
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

const inr = (p: number) =>
  `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What a customer or supplier ledger is good for: how much was invoiced, how much was settled and what is still
 * outstanding for the period. It is summarised, never turned into bank lines.
 */
export function partyLedgerSummary(r: TallyLedgerRead): {
  entries: number;
  totals: { label: string; amount: number }[];
  checks: { ok: boolean; label: string; detail: string }[];
  note: string;
} {
  const who = r.customer ? "customer" : "supplier";
  const net = r.invoicePaise - r.settledPaise;
  return {
    entries: r.lines - r.skipped,
    totals: [
      {
        label: r.customer ? "Invoiced (sales)" : "Billed (purchases)",
        amount: r.invoicePaise / 100,
      },
      { label: r.customer ? "Received" : "Paid", amount: r.settledPaise / 100 },
      {
        label:
          net >= 0
            ? "Outstanding for the period"
            : "Settled in excess of the period's invoices",
        amount: Math.abs(net) / 100,
      },
    ],
    checks: [
      {
        ok: r.duplicateInvoices.length === 0,
        label: "No invoice entered twice",
        detail: r.duplicateInvoices.length
          ? `Voucher numbers entered twice: ${r.duplicateInvoices.slice(0, 5).join(", ")}.`
          : "Every invoice number appears once.",
      },
    ],
    note: `This is a ${who} ledger (${r.firstDate} to ${r.lastDate}), so it was kept for outstanding and ageing checks and not used as bank lines. ${inr(r.invoicePaise)} ${r.customer ? "invoiced" : "billed"}, ${inr(r.settledPaise)} ${r.customer ? "received" : "paid"}. The opening balance is not in the export, so add it in Tally to get the closing balance. To reconcile the bank, use the bank book or the Day Book.`,
  };
}
