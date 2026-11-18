/**
 * Narration to ledger learning. When a person approves a bank line for Tally, the ledger they chose is remembered against the
 * narration's pattern (its words without dates, amounts and references). Next time a line with the same pattern appears, that ledger
 * is suggested first, with the reason in words. Pure functions here; the server stores and loads the rules.
 *
 * Careful by design: only an EXISTING Tally ledger is ever suggested, a rule needs a distinctive narration (not "payment"), and a
 * rule that was overridden by a different choice moves to the newer choice only after it has been chosen as often.
 */
import { isDistinctiveName, narrationPattern } from "./memory";
import type { Suggestion } from "./tallyLedgerSuggest";

export interface LedgerRule {
  pattern: string;
  ledger: string;
  /** How many times a person chose this ledger for this pattern. */
  taught: number;
}

/** The key a line is remembered by: direction and the narration's words. Empty when the narration is too generic to learn from. */
export function ledgerPattern(line: { direction: "in" | "out"; counterparty?: string | null; description?: string | null }): string {
  const p = narrationPattern(line.description) || narrationPattern(line.counterparty ?? "");
  return p && isDistinctiveName(p) ? `ledger:${line.direction}:${p}` : "";
}

/** What to store after a person chooses `ledger` for a line, given what was stored before for the same pattern. */
export function learnChoice(existing: { ledger: string; taught: number; other?: { ledger: string; taught: number } } | null, ledger: string): { ledger: string; taught: number; other?: { ledger: string; taught: number } } {
  if (!existing) return { ledger, taught: 1 };
  if (existing.ledger.toLowerCase() === ledger.toLowerCase()) return { ledger: existing.ledger, taught: existing.taught + 1, ...(existing.other ? { other: existing.other } : {}) };
  // A different choice: count it on the side. It replaces the rule only when it has been chosen at least as often.
  const other = existing.other && existing.other.ledger.toLowerCase() === ledger.toLowerCase() ? { ledger: existing.other.ledger, taught: existing.other.taught + 1 } : { ledger, taught: 1 };
  return other.taught >= existing.taught ? { ledger: other.ledger, taught: other.taught, other: { ledger: existing.ledger, taught: existing.taught } } : { ...existing, other };
}

/** Puts a learned ledger ahead of the guess, when that ledger is still in Tally. Bank items and uncertain guesses yield to it. */
export function applyLearned(suggestion: Suggestion, rule: LedgerRule | undefined, tallyLedgers: string[]): Suggestion {
  if (!rule) return suggestion;
  const exact = tallyLedgers.find((l) => l.trim().toLowerCase() === rule.ledger.trim().toLowerCase());
  if (!exact) return suggestion;
  if (suggestion.kind === "suggest" && suggestion.ledger.toLowerCase() === exact.toLowerCase()) return { ...suggestion, confidence: Math.max(suggestion.confidence, 0.95), reason: `${suggestion.reason} You chose it ${rule.taught} time${rule.taught === 1 ? "" : "s"} before.` };
  return { kind: "suggest", ledger: exact, confidence: Math.min(0.98, 0.9 + 0.02 * rule.taught), reason: `You chose "${exact}" for ${rule.taught} similar line${rule.taught === 1 ? "" : "s"} before.` };
}
