/**
 * Grounded AI insights for the MIS, and the guardrail that rejects anything
 * the AI cannot back with real transaction ids and real figures.
 */
import { round2 } from "../core";
import type { Insight, MisFigures, NarrateTxn } from "./calc";

export const INSIGHTS_SYSTEM_PROMPT = `You are a senior at an Indian chartered accountancy firm writing the insights section of a client's monthly MIS for the partner.
You receive figures that were already calculated and a list of matched bank transactions with ids.
Return STRICT JSON: {"insights":[{"text":<string>,"cited_transaction_ids":[<ids>],"confidence":<0..1>}]}
Rules:
- Write 3 to 7 insights. Each must cite the specific transaction ids that support it.
- You must only reference transaction ids that appear in the input.
- If you cannot support a statement with specific transaction ids, do not write it.
- Do not calculate new totals. Only quote figures given in "figures", "parties", "categories", "variances" or a transaction's own amount.
- Use professional, concise CA language (no marketing tone, no advice to buy or sell). Indian number formatting (₹1,25,000).`;

export function insightsPayload(
  f: MisFigures,
  matched: NarrateTxn[],
  clientName: string,
  periodLabel: string,
) {
  const top = [...matched].sort((a, b) => b.amount - a.amount).slice(0, 60);
  return {
    client: clientName,
    period: periodLabel,
    figures: Object.values(f.numbers).map((n) => ({
      key: n.key,
      label: n.label,
      value: n.value,
      unit: n.unit,
    })),
    parties: {
      receipts: f.receipts_by_party.slice(0, 8).map((p) => ({
        party: p.party,
        total: p.total,
        count: p.count,
        ids: p.txn_ids.slice(0, 10),
      })),
      payments: f.payments_by_party.slice(0, 8).map((p) => ({
        party: p.party,
        total: p.total,
        count: p.count,
        ids: p.txn_ids.slice(0, 10),
      })),
    },
    categories: f.by_category.map((c) => ({
      category: c.category,
      direction: c.direction,
      total: c.total,
      count: c.count,
    })),
    variances: f.variances.map((v) => ({
      label: v.label,
      current: v.current,
      prior: v.prior,
      change_pct: v.change_pct,
    })),
    transactions: top.map((t) => ({
      id: t.id,
      date: t.txn_date,
      direction: t.direction,
      amount: t.amount,
      counterparty: t.counterparty,
      description: (t.description ?? "").slice(0, 120),
      category: t.category,
    })),
  };
}

const NUMBER_TOKEN =
  /(?:₹|rs\.?|inr)?\s?(\d[\d,]*(?:\.\d+)?)\s?(%|lakhs?|crores?|cr\b|k\b)?/gi;

/** Every figure the insight text is allowed to quote. */
export function allowedFigures(
  f: MisFigures,
  matched: NarrateTxn[],
): { amounts: number[]; pcts: number[] } {
  const amounts = new Set<number>();
  const pcts = new Set<number>();
  for (const n of Object.values(f.numbers)) amounts.add(Math.abs(n.value));
  for (const p of [...f.receipts_by_party, ...f.payments_by_party]) {
    amounts.add(p.total);
    amounts.add(p.count);
  }
  for (const c of f.by_category) {
    amounts.add(c.total);
    amounts.add(c.count);
  }
  for (const v of f.variances) {
    amounts.add(Math.abs(v.current));
    amounts.add(Math.abs(v.prior));
    amounts.add(Math.abs(round2(v.current - v.prior)));
    if (v.change_pct !== null) pcts.add(Math.abs(v.change_pct));
  }
  const inTotal = f.numbers.total_receipts?.value ?? 0;
  const outTotal = f.numbers.total_payments?.value ?? 0;
  for (const p of f.receipts_by_party)
    if (inTotal) pcts.add(round2((p.total / inTotal) * 100));
  for (const p of f.payments_by_party)
    if (outTotal) pcts.add(round2((p.total / outTotal) * 100));
  for (const t of matched) amounts.add(t.amount);
  return { amounts: [...amounts], pcts: [...pcts] };
}

function figureIsAllowed(
  value: number,
  unit: string | undefined,
  allowed: { amounts: number[]; pcts: number[] },
): boolean {
  if (unit === "%") return allowed.pcts.some((p) => Math.abs(p - value) <= 1);
  let v = value;
  if (unit && /^lakh/i.test(unit)) v *= 1e5;
  else if (unit && /^(crore|cr)/i.test(unit)) v *= 1e7;
  else if (unit && /^k$/i.test(unit)) v *= 1e3;
  if (Number.isInteger(v) && v <= 31) return true; // counts, days
  if (v >= 1900 && v <= 2100 && Number.isInteger(v)) return true; // years
  // Rounded quotes ("₹1.2 lakh") are fine within 1% of a real figure.
  return allowed.amounts.some((a) => Math.abs(a - v) <= Math.max(1, a * 0.01));
}

export interface InsightCheck {
  accepted: Insight[];
  rejected: { text: string; reason: string }[];
}

/** The mandatory citation guardrail. Nothing un-citable reaches the partner. */
export function validateInsights(
  raw: unknown,
  f: MisFigures,
  matched: NarrateTxn[],
): InsightCheck {
  const validIds = new Set(matched.map((t) => t.id));
  const allowed = allowedFigures(f, matched);
  const list = Array.isArray((raw as { insights?: unknown })?.insights)
    ? (raw as { insights: unknown[] }).insights
    : [];
  const accepted: Insight[] = [];
  const rejected: { text: string; reason: string }[] = [];
  for (const item of list.slice(0, 10)) {
    const it = item as {
      text?: unknown;
      cited_transaction_ids?: unknown;
      confidence?: unknown;
    };
    const text = typeof it.text === "string" ? it.text.trim() : "";
    const ids = Array.isArray(it.cited_transaction_ids)
      ? it.cited_transaction_ids.map(String)
      : [];
    if (!text) continue;
    if (!ids.length) {
      rejected.push({ text, reason: "no citations" });
      continue;
    }
    const unknown = ids.filter((id) => !validIds.has(id));
    if (unknown.length) {
      rejected.push({
        text,
        reason: `cites ids not in the input: ${unknown.slice(0, 3).join(", ")}`,
      });
      continue;
    }
    let badFigure: string | null = null;
    for (const m of text.matchAll(NUMBER_TOKEN)) {
      const value = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      if (!figureIsAllowed(value, m[2]?.toLowerCase(), allowed)) {
        badFigure = m[0].trim();
        break;
      }
    }
    if (badFigure) {
      rejected.push({
        text,
        reason: `quotes a figure not in the data: ${badFigure}`,
      });
      continue;
    }
    const confidence =
      typeof it.confidence === "number"
        ? Math.max(0, Math.min(1, it.confidence))
        : 0.8;
    accepted.push({
      text: text.slice(0, 600),
      cited_transaction_ids: [...new Set(ids)].slice(0, 25),
      confidence,
      origin: "ai",
      source: `${ids.length} transaction${ids.length === 1 ? "" : "s"}`,
    });
  }
  return { accepted: accepted.slice(0, 7), rejected };
}
