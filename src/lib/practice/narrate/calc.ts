/**
 * Narrate agent — deterministic MIS figures.
 *
 * Every number here is computed in code from matched transactions, and every
 * number keeps the list of transaction ids that produced it so a partner can
 * click through to the source. The AI never produces a figure.
 */
import { formatRupees, round2, sumRupees, toPaise, type Period } from "../core";

export interface NarrateTxn {
  id: string;
  side: "bank" | "books";
  direction: "in" | "out";
  amount: number;
  txn_date: string;
  counterparty: string | null;
  description: string | null;
  category: string | null;
  reference: string | null;
  balance: number | null;
  row_index: number | null;
  extraction_id: string | null;
}

export interface SourceRow {
  id: string;
  date: string;
  particulars: string;
  amount: number; // signed: in +, out −
}

export interface SummaryNumber {
  key: string;
  label: string;
  value: number;
  unit: "inr" | "count" | "pct";
  txn_ids: string[];
  note?: string;
}

export interface PartyTotal {
  party: string;
  total: number;
  count: number;
  txn_ids: string[];
}

export interface Variance {
  key: string;
  label: string;
  current: number;
  prior: number;
  change_pct: number | null;
  current_txn_ids: string[];
  prior_txn_ids: string[];
}

export interface MisFigures {
  numbers: Record<string, SummaryNumber>;
  receipts_by_party: PartyTotal[];
  payments_by_party: PartyTotal[];
  by_category: {
    category: string;
    direction: "in" | "out";
    total: number;
    count: number;
    txn_ids: string[];
  }[];
  variances: Variance[];
  largest: { receipts: SourceRow[]; payments: SourceRow[] };
}

export const toSourceRow = (t: NarrateTxn): SourceRow => ({
  id: t.id,
  date: t.txn_date,
  particulars: t.counterparty
    ? `${t.counterparty} — ${t.description ?? ""}`.trim().replace(/—\s*$/, "")
    : t.description || "Transaction",
  amount: t.direction === "out" ? -t.amount : t.amount,
});

const partyOf = (t: NarrateTxn) =>
  (t.counterparty?.trim() || "Unnamed party").slice(0, 80);
const byAmountDesc = (a: NarrateTxn, b: NarrateTxn) =>
  b.amount - a.amount || (a.id < b.id ? -1 : 1);

function groupParties(txns: NarrateTxn[]): PartyTotal[] {
  const map = new Map<string, NarrateTxn[]>();
  for (const t of txns) {
    const k = partyOf(t);
    (map.get(k) ?? map.set(k, []).get(k)!).push(t);
  }
  return [...map.entries()]
    .map(([party, list]) => ({
      party,
      total: sumRupees(list.map((t) => t.amount)),
      count: list.length,
      txn_ids: list.map((t) => t.id),
    }))
    .sort((a, b) => b.total - a.total || a.party.localeCompare(b.party));
}

const pct = (current: number, prior: number) =>
  prior === 0 ? null : round2(((current - prior) / Math.abs(prior)) * 100);

/**
 * @param matched  bank-side transactions in the period with match_status = matched
 * @param prior    same for the previous period (empty if none)
 * @param statement all bank-side lines in the period, used only for the printed opening/closing balance
 */
export function computeFigures(
  matched: NarrateTxn[],
  prior: NarrateTxn[],
  statement: NarrateTxn[],
): MisFigures {
  const ins = matched.filter((t) => t.direction === "in");
  const outs = matched.filter((t) => t.direction === "out");
  const totalIn = sumRupees(ins.map((t) => t.amount));
  const totalOut = sumRupees(outs.map((t) => t.amount));

  const numbers: Record<string, SummaryNumber> = {
    total_receipts: {
      key: "total_receipts",
      label: "Total bank receipts",
      value: totalIn,
      unit: "inr",
      txn_ids: ins.map((t) => t.id),
    },
    total_payments: {
      key: "total_payments",
      label: "Total bank payments",
      value: totalOut,
      unit: "inr",
      txn_ids: outs.map((t) => t.id),
    },
    net_movement: {
      key: "net_movement",
      label: "Net cash movement",
      value: round2(totalIn - totalOut),
      unit: "inr",
      txn_ids: matched.map((t) => t.id),
    },
    matched_count: {
      key: "matched_count",
      label: "Matched transactions",
      value: matched.length,
      unit: "count",
      txn_ids: matched.map((t) => t.id),
    },
  };

  // Printed balances: opening = first line's balance before that line; closing = last line's balance.
  const withBalance = statement
    .filter((t) => t.balance !== null && t.balance !== undefined)
    .sort((a, b) =>
      a.txn_date === b.txn_date
        ? (a.row_index ?? 0) - (b.row_index ?? 0)
        : a.txn_date < b.txn_date
          ? -1
          : 1,
    );
  if (withBalance.length) {
    const first = withBalance[0];
    const last = withBalance[withBalance.length - 1];
    const opening = round2(
      (toPaise(first.balance!) -
        toPaise(first.direction === "in" ? first.amount : -first.amount)) /
        100,
    );
    numbers.opening_balance = {
      key: "opening_balance",
      label: "Opening bank balance (as per statement)",
      value: opening,
      unit: "inr",
      txn_ids: [first.id],
      note: "Derived from the running balance printed on the first statement line of the period.",
    };
    numbers.closing_balance = {
      key: "closing_balance",
      label: "Closing bank balance (as per statement)",
      value: round2(last.balance!),
      unit: "inr",
      txn_ids: [last.id],
      note: "Running balance printed on the last statement line of the period.",
    };
  }

  const receipts_by_party = groupParties(ins);
  const payments_by_party = groupParties(outs);
  receipts_by_party.slice(0, 5).forEach((p, i) => {
    numbers[`top_receipt_party_${i + 1}`] = {
      key: `top_receipt_party_${i + 1}`,
      label: `Receipts from ${p.party}`,
      value: p.total,
      unit: "inr",
      txn_ids: p.txn_ids,
    };
  });
  payments_by_party.slice(0, 5).forEach((p, i) => {
    numbers[`top_payment_party_${i + 1}`] = {
      key: `top_payment_party_${i + 1}`,
      label: `Payments to ${p.party}`,
      value: p.total,
      unit: "inr",
      txn_ids: p.txn_ids,
    };
  });

  const catMap = new Map<string, NarrateTxn[]>();
  for (const t of matched) {
    const k = `${t.direction}|${t.category || (t.direction === "in" ? "receipt" : "payment")}`;
    (catMap.get(k) ?? catMap.set(k, []).get(k)!).push(t);
  }
  const by_category = [...catMap.entries()]
    .map(([k, list]) => {
      const [direction, category] = k.split("|") as ["in" | "out", string];
      return {
        category,
        direction,
        total: sumRupees(list.map((t) => t.amount)),
        count: list.length,
        txn_ids: list.map((t) => t.id),
      };
    })
    .sort((a, b) => b.total - a.total);
  for (const c of by_category) {
    const key = `category_${c.direction}_${c.category}`;
    numbers[key] = {
      key,
      label: `${c.direction === "in" ? "Receipts" : "Payments"}: ${c.category.replace(/_/g, " ")}`,
      value: c.total,
      unit: "inr",
      txn_ids: c.txn_ids,
    };
  }

  const pIns = prior.filter((t) => t.direction === "in");
  const pOuts = prior.filter((t) => t.direction === "out");
  const priorIn = sumRupees(pIns.map((t) => t.amount));
  const priorOut = sumRupees(pOuts.map((t) => t.amount));
  const variances: Variance[] = prior.length
    ? [
        {
          key: "receipts",
          label: "Receipts",
          current: totalIn,
          prior: priorIn,
          change_pct: pct(totalIn, priorIn),
          current_txn_ids: ins.map((t) => t.id),
          prior_txn_ids: pIns.map((t) => t.id),
        },
        {
          key: "payments",
          label: "Payments",
          current: totalOut,
          prior: priorOut,
          change_pct: pct(totalOut, priorOut),
          current_txn_ids: outs.map((t) => t.id),
          prior_txn_ids: pOuts.map((t) => t.id),
        },
        {
          key: "net",
          label: "Net position",
          current: round2(totalIn - totalOut),
          prior: round2(priorIn - priorOut),
          change_pct: pct(totalIn - totalOut, priorIn - priorOut),
          current_txn_ids: matched.map((t) => t.id),
          prior_txn_ids: prior.map((t) => t.id),
        },
      ]
    : [];

  return {
    numbers,
    receipts_by_party,
    payments_by_party,
    by_category,
    variances,
    largest: {
      receipts: [...ins].sort(byAmountDesc).slice(0, 10).map(toSourceRow),
      payments: [...outs].sort(byAmountDesc).slice(0, 10).map(toSourceRow),
    },
  };
}

export interface Insight {
  text: string;
  cited_transaction_ids: string[];
  confidence: number;
  origin: "rules" | "ai";
  /** Short human label for the v2 screen ("3 transactions"). */
  source: string;
}

const inr = (n: number) => formatRupees(Math.abs(n));
const sourceLabel = (ids: string[]) =>
  `${ids.length} transaction${ids.length === 1 ? "" : "s"}`;

/** Insights written by rules. Always grounded; used alone when no AI is configured. */
export function ruleInsights(f: MisFigures, matched: NarrateTxn[]): Insight[] {
  const out: Insight[] = [];
  const n = f.numbers;
  if (!matched.length) return out;
  const net = n.net_movement.value;
  const topIns = f.largest.receipts.slice(0, 3).map((r) => r.id);
  const topOuts = f.largest.payments.slice(0, 3).map((r) => r.id);
  const netIds = net >= 0 ? topIns : topOuts;
  if (netIds.length) {
    out.push({
      text:
        net >= 0
          ? `Receipts exceeded payments by ${inr(net)} for the period (${inr(n.total_receipts.value)} in, ${inr(n.total_payments.value)} out).`
          : `Payments exceeded receipts by ${inr(net)} for the period (${inr(n.total_receipts.value)} in, ${inr(n.total_payments.value)} out).`,
      cited_transaction_ids: netIds,
      confidence: 1,
      origin: "rules",
      source: sourceLabel(netIds),
    });
  }
  const topR = f.receipts_by_party[0];
  if (topR && n.total_receipts.value > 0 && f.receipts_by_party.length > 1) {
    const share = round2((topR.total / n.total_receipts.value) * 100);
    if (share >= 40) {
      out.push({
        text: `${topR.party} accounts for ${share}% of receipts (${inr(topR.total)} across ${topR.count} transactions), a concentration worth noting.`,
        cited_transaction_ids: topR.txn_ids.slice(0, 20),
        confidence: 1,
        origin: "rules",
        source: sourceLabel(topR.txn_ids),
      });
    }
  }
  const bigPay = f.largest.payments[0];
  if (bigPay) {
    out.push({
      text: `The largest payment was ${inr(bigPay.amount)} on ${bigPay.date} (${bigPay.particulars}).`,
      cited_transaction_ids: [bigPay.id],
      confidence: 1,
      origin: "rules",
      source: "1 transaction",
    });
  }
  const charges = f.by_category.find(
    (c) => c.category === "bank_charge" && c.direction === "out",
  );
  if (charges) {
    out.push({
      text: `Bank charges totalled ${inr(charges.total)} across ${charges.count} debit${charges.count === 1 ? "" : "s"}.`,
      cited_transaction_ids: charges.txn_ids.slice(0, 20),
      confidence: 1,
      origin: "rules",
      source: sourceLabel(charges.txn_ids),
    });
  }
  for (const v of f.variances.filter((x) => x.key !== "net")) {
    if (
      v.change_pct !== null &&
      Math.abs(v.change_pct) >= 20 &&
      v.current_txn_ids.length
    ) {
      const ids = (v.key === "receipts" ? topIns : topOuts).slice(0, 3);
      if (ids.length)
        out.push({
          text: `${v.label} ${v.change_pct > 0 ? "rose" : "fell"} ${Math.abs(v.change_pct)}% against the previous period (${inr(v.current)} vs ${inr(v.prior)}).`,
          cited_transaction_ids: ids,
          confidence: 1,
          origin: "rules",
          source: sourceLabel(v.current_txn_ids),
        });
    }
  }
  return out.slice(0, 7);
}
