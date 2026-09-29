/**
 * Reconciliation engine — three passes over a client's bank lines.
 *
 *   1. exact  — same amount, date inside a tight window, reference present
 *   2. fuzzy  — same-ish amount and party name similarity in the narration
 *   3. rule   — part payments and recurring-vendor patterns
 *
 * Anything left over gets a reason code and becomes an exception. Nothing is
 * written until a human accepts a suggestion.
 */
import { supabase } from "@/integrations/supabase/client";
import { logCAAudit } from "@/lib/caAudit";
import { signalBrain } from "@/lib/caBrainSignals";

export interface BankLine {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  type: string;
  reconciled: boolean;
  source_reference: string | null;
}

export interface InvoiceLine {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  outstanding_amount: number;
  status: string;
  customer_name?: string | null;
}

export interface ExpenseLine {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  payment_status: string;
  vendor_name?: string | null;
}

export type MatchPass = "exact" | "fuzzy" | "rule";
export type CounterpartKind = "invoice" | "expense";

export interface MatchSuggestion {
  bank: BankLine;
  counterpartKind: CounterpartKind;
  counterpartId: string;
  counterpartLabel: string;
  counterpartAmount: number;
  pass: MatchPass;
  confidence: number;
  rationale: string;
  partial: boolean;
}

export type ReasonCode =
  | "no_counterpart"
  | "amount_mismatch"
  | "date_out_of_window"
  | "duplicate_candidate"
  | "missing_narration";

export const REASON_LABELS: Record<ReasonCode, string> = {
  no_counterpart: "No invoice or bill found for this line",
  amount_mismatch: "Amount does not match any open document",
  date_out_of_window: "Closest document is outside the date window",
  duplicate_candidate: "More than one document matches equally well",
  missing_narration: "Narration too thin to identify the party",
};

export interface UnmatchedLine {
  bank: BankLine;
  reason: ReasonCode;
  severity: "low" | "medium" | "high";
}

export interface ReconResult {
  suggestions: MatchSuggestion[];
  unmatched: UnmatchedLine[];
}

const DAY = 86_400_000;

function days(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY;
}

function normalise(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Token overlap between a narration and a party name, 0..1. */
export function nameSimilarity(narration: string | null | undefined, party: string | null | undefined) {
  const a = normalise(narration).split(" ").filter((t) => t.length > 2);
  const b = normalise(party).split(" ").filter((t) => t.length > 2);
  if (!a.length || !b.length) return 0;
  const hits = b.filter((t) => a.some((x) => x.includes(t) || t.includes(x))).length;
  return hits / b.length;
}

function amountCloseness(a: number, b: number) {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return 1 - Math.abs(a - b) / max;
}

export interface ReconOptions {
  /** Date window in days for an exact match. */
  exactWindowDays?: number;
  /** Wider window used by the fuzzy and rule passes. */
  fuzzyWindowDays?: number;
  /** Treat a bank credit under this share of the invoice as a part payment. */
  partPaymentFloor?: number;
  /** Hard period boundary — nothing before this date participates. */
  periodStart?: string;
  /** Hard period boundary — nothing after this date participates. */
  periodEnd?: string;
}

export function reconcile(
  bank: BankLine[],
  invoices: InvoiceLine[],
  expenses: ExpenseLine[],
  opts: ReconOptions = {},
): ReconResult {
  const exactWindow = opts.exactWindowDays ?? 3;
  const fuzzyWindow = opts.fuzzyWindowDays ?? 21;
  const partFloor = opts.partPaymentFloor ?? 0.1;
  const ps = opts.periodStart ?? null;
  const pe = opts.periodEnd ?? null;

  if (ps || pe) {
    console.log(`[fyn:recon] period-scoped periodStart=${ps ?? "none"} periodEnd=${pe ?? "none"}`);
  }

  const suggestions: MatchSuggestion[] = [];
  const unmatched: UnmatchedLine[] = [];
  const usedInvoices = new Set<string>();
  const usedExpenses = new Set<string>();

  const openInvoices = invoices.filter((i) => {
    if (i.outstanding_amount <= 0) return false;
    if (ps && i.invoice_date < ps) return false;
    if (pe && i.invoice_date > pe) return false;
    return true;
  });
  const openExpenses = expenses.filter((e) => {
    if (e.payment_status === "paid") return false;
    if (ps && e.date < ps) return false;
    if (pe && e.date > pe) return false;
    return true;
  });

  for (const line of bank) {
    if (line.reconciled || line.source_reference?.startsWith("recon:")) continue;
    if (ps && line.date < ps) continue;
    if (pe && line.date > pe) continue;


    const isCredit = line.type.toLowerCase() === "credit";
    const candidates = isCredit
      ? openInvoices
          .filter((i) => !usedInvoices.has(i.id))
          .map((i) => ({
            kind: "invoice" as CounterpartKind,
            id: i.id,
            label: `${i.invoice_number}${i.customer_name ? ` · ${i.customer_name}` : ""}`,
            party: i.customer_name ?? i.invoice_number,
            amount: i.outstanding_amount,
            date: i.invoice_date,
          }))
      : openExpenses
          .filter((e) => !usedExpenses.has(e.id))
          .map((e) => ({
            kind: "expense" as CounterpartKind,
            id: e.id,
            label: `${e.vendor_name ?? "Expense"}${e.description ? ` · ${e.description}` : ""}`,
            party: e.vendor_name ?? e.description,
            amount: e.amount,
            date: e.date,
          }));

    if (!candidates.length) {
      unmatched.push({ bank: line, reason: "no_counterpart", severity: line.amount > 100_000 ? "high" : "medium" });
      continue;
    }

    // Pass 1 — exact
    const exact = candidates.filter(
      (c) => Math.abs(c.amount - line.amount) < 1 && days(c.date, line.date) <= exactWindow,
    );
    if (exact.length === 1) {
      const c = exact[0];
      suggestions.push({
        bank: line,
        counterpartKind: c.kind,
        counterpartId: c.id,
        counterpartLabel: c.label,
        counterpartAmount: c.amount,
        pass: "exact",
        confidence: 0.99,
        rationale: `Exact amount within ${Math.round(days(c.date, line.date))} day(s)`,
        partial: false,
      });
      (c.kind === "invoice" ? usedInvoices : usedExpenses).add(c.id);
      continue;
    }
    if (exact.length > 1) {
      unmatched.push({ bank: line, reason: "duplicate_candidate", severity: "medium" });
      continue;
    }

    // Pass 2 — fuzzy
    const scored = candidates
      .filter((c) => days(c.date, line.date) <= fuzzyWindow)
      .map((c) => {
        const amt = amountCloseness(c.amount, line.amount);
        const nm = nameSimilarity(line.description, c.party);
        const dateScore = 1 - days(c.date, line.date) / fuzzyWindow;
        return { c, score: amt * 0.55 + nm * 0.3 + dateScore * 0.15, amt, nm };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= 0.7 && best.nm > 0) {
      suggestions.push({
        bank: line,
        counterpartKind: best.c.kind,
        counterpartId: best.c.id,
        counterpartLabel: best.c.label,
        counterpartAmount: best.c.amount,
        pass: "fuzzy",
        confidence: Math.round(best.score * 100) / 100,
        rationale: `Party name and amount similarity (${Math.round(best.nm * 100)}% name, ${Math.round(best.amt * 100)}% amount)`,
        partial: Math.abs(best.c.amount - line.amount) >= 1,
      });
      (best.c.kind === "invoice" ? usedInvoices : usedExpenses).add(best.c.id);
      continue;
    }

    // Pass 3 — rules: part payment against a single open document of the same party
    const partCandidates = candidates.filter(
      (c) =>
        line.amount < c.amount &&
        line.amount / c.amount >= partFloor &&
        days(c.date, line.date) <= fuzzyWindow &&
        nameSimilarity(line.description, c.party) >= 0.5,
    );
    if (partCandidates.length === 1) {
      const c = partCandidates[0];
      suggestions.push({
        bank: line,
        counterpartKind: c.kind,
        counterpartId: c.id,
        counterpartLabel: c.label,
        counterpartAmount: c.amount,
        pass: "rule",
        confidence: 0.72,
        rationale: `Part payment — ${Math.round((line.amount / c.amount) * 100)}% of the open amount`,
        partial: true,
      });
      (c.kind === "invoice" ? usedInvoices : usedExpenses).add(c.id);
      continue;
    }

    const nearest = scored[0];
    const reason: ReasonCode = !normalise(line.description)
      ? "missing_narration"
      : !nearest
      ? "date_out_of_window"
      : "amount_mismatch";
    unmatched.push({
      bank: line,
      reason,
      severity: line.amount > 100_000 ? "high" : line.amount > 10_000 ? "medium" : "low",
    });
  }

  return { suggestions, unmatched };
}

/** Apply an accepted suggestion: settle the document and stamp the bank line. */
export async function acceptMatch(
  s: MatchSuggestion,
  ctx: { firmId: string; businessId: string; actorRole?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const ref = `recon:${s.counterpartKind}:${s.counterpartId}`;

  if (s.counterpartKind === "invoice") {
    const remaining = Math.max(0, Math.round((s.counterpartAmount - s.bank.amount) * 100) / 100);
    const { error } = await supabase
      .from("invoices")
      .update({
        outstanding_amount: remaining,
        status: remaining === 0 ? "paid" : "partial",
        payment_date: remaining === 0 ? s.bank.date : null,
      })
      .eq("id", s.counterpartId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("expenses")
      .update({ payment_status: s.partial ? "partial" : "paid" })
      .eq("id", s.counterpartId);
    if (error) return { ok: false, error: error.message };
  }

  const { error: bankErr } = await supabase
    .from("bank_transactions")
    .update({ reconciled: true, source_reference: ref })
    .eq("id", s.bank.id);
  if (bankErr) return { ok: false, error: bankErr.message };

  await logCAAudit({
    firmId: ctx.firmId,
    businessId: ctx.businessId,
    entityType: "reconciliation",
    entityId: s.bank.id,
    action: `matched_${s.pass}`,
    actorRole: ctx.actorRole ?? null,
    detail: {
      counterpart: ref,
      amount: s.bank.amount,
      confidence: s.confidence,
      partial: s.partial,
      rationale: s.rationale,
    },
  });

  void signalBrain(ctx.firmId, ctx.businessId, "recon_match_accepted", {
    pass: s.pass,
    confidence: s.confidence,
    partial: s.partial,
    amount: s.bank.amount,
    counterpart_kind: s.counterpartKind,
  });

  return { ok: true };
}

/** Push unmatched lines into the exception queue, skipping ones already raised. */
export async function raiseExceptions(
  lines: UnmatchedLine[],
  ctx: { firmId: string; businessId: string; actorRole?: string | null },
): Promise<{ created: number; error?: string }> {
  if (!lines.length) return { created: 0 };

  const { data: existing } = await supabase
    .from("ca_exceptions")
    .select("description")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", ctx.businessId)
    .eq("source", "reconciliation")
    .neq("status", "resolved");
  const seen = new Set(((existing ?? []) as { description: string | null }[]).map((e) => e.description ?? ""));

  const payload = lines
    .map((l) => ({
      ca_firm_id: ctx.firmId,
      business_id: ctx.businessId,
      source: "reconciliation",
      reason_code: l.reason,
      severity: l.severity,
      amount: l.bank.amount,
      description: `${l.bank.date} · ${l.bank.description ?? "Bank line"} [${l.bank.id.slice(0, 8)}]`,
    }))
    .filter((p) => !seen.has(p.description));

  if (!payload.length) return { created: 0 };

  const { error } = await supabase.from("ca_exceptions").insert(payload);
  if (error) return { created: 0, error: error.message };

  await logCAAudit({
    firmId: ctx.firmId,
    businessId: ctx.businessId,
    entityType: "exception",
    action: "exceptions_raised",
    actorRole: ctx.actorRole ?? null,
    detail: { count: payload.length },
  });

  return { created: payload.length };
}
