/** The three review working papers as sheet specs, so the screen and the tests build exactly the same file. */
import type { CashReview } from "./cash";
import type { AdjustmentRow } from "./adjustments";
import type { MapSuggestion } from "./ledgerMap";
import { firstRow, type SheetSpec } from "./workpaper";

export const ADJ_FLAG_LABEL: Record<string, string> = { year_end: "31 March", period_end: "Month end", round_sum: "Round sum", narration: "Narration", owner_or_suspense: "Owner or suspense ledger", reversed_next_period: "Reversed next period", large: "Large for this ledger book" };

export type Header = [string, string | number][];

export function cashSheet(cash: CashReview, header: Header): SheetSpec {
  const first = firstRow(header.length);
  return {
    name: "Cash by day", header, columns: ["Date", "Opening", "Receipts", "Payments", "Closing", "Flag"],
    // Opening follows the day before and closing is opening + receipts - payments, as live formulas: change a figure and the balance follows.
    rows: cash.days.map((d, i) => [d.date, i === 0 ? d.opening : { f: `E${first + i - 1}`, v: d.opening }, d.receipts, d.payments, { f: `B${first + i}+C${first + i}-D${first + i}`, v: d.closing }, d.flag]),
    total: { label: "Control total", columns: [2, 3] },
    notes: cash.notes,
  };
}

export function adjustmentSheet(rows: AdjustmentRow[], header: Header): SheetSpec {
  return {
    name: "Adjustment entries", header, columns: ["Date", "Type", "No.", "Amount", "Flags", "Routine", "Ledgers", "Narration", "CA decision"],
    rows: rows.map((a) => [a.date, a.type, a.no, a.amount, a.flags.map((f) => ADJ_FLAG_LABEL[f]).join("; "), a.routine ?? "", a.ledgers.join("; "), a.narration, ""]),
    total: { label: "Control total", columns: [3] },
    notes: ["A flag is a reason to look, not a finding. Routine entries (GST set-off, reverse charge) are tagged so this list stays readable."],
  };
}

export function ledgerMapSheet(map: MapSuggestion[], header: Header): SheetSpec {
  return {
    name: "Ledger map", header, columns: ["Ledger", "Suggested family", "GST head", "Rate %", "Year in name", "Basis", "Note", "Confirmed"],
    rows: map.map((m) => [m.ledger, m.family, m.gstHead ?? "", m.rate, m.year ?? "", m.basis, m.note ?? "", ""]),
    notes: ["Nothing reads a ledger through this map until a person has confirmed it."],
  };
}
