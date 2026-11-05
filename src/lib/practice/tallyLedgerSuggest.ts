/**
 * Suggests which EXISTING Tally ledger a bank line belongs to. Pure and cautious:
 * it only ever returns a ledger that is already in the Tally company, never invents one,
 * and says "uncertain" when two ledgers are close. A person approves every suggestion.
 */
import { nameScore } from "./recon/engine";

export interface LineForSuggest {
  counterparty: string | null;
  description: string | null;
  reference: string | null;
}

export type Suggestion =
  | { kind: "suggest"; ledger: string; confidence: number; reason: string }
  | { kind: "uncertain"; candidates: { ledger: string; confidence: number }[]; reason: string }
  | { kind: "none"; reason: string };

export const MIN_SCORE = 0.78;
export const MIN_GAP = 0.1;

/** Ledgers that are the bank or system accounts and must never be suggested for the other side. */
const NEVER = /^(cash|profit & loss a\/c|profit and loss a\/c|primary)$/i;

export function suggestLedger(line: LineForSuggest, ledgers: string[], bankLedger?: string): Suggestion {
  const names = [...new Set(ledgers.map((l) => l.trim()).filter(Boolean))].filter(
    (l) => !NEVER.test(l) && l.toLowerCase() !== (bankLedger ?? "").trim().toLowerCase(),
  );
  if (!names.length) return { kind: "none", reason: "No ledgers have been read from Tally yet." };
  const text = [line.counterparty, line.description].filter(Boolean).join(" ").trim();
  if (!text) return { kind: "none", reason: "The line has no payee or narration to match." };

  const scored = names
    .map((ledger) => ({
      ledger,
      // The payee is the strongest signal; fall back to the narration.
      confidence: Math.max(line.counterparty ? nameScore(line.counterparty, ledger) : 0, nameScore(text, ledger) * 0.92),
    }))
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence || a.ledger.localeCompare(b.ledger));

  const [top, second] = scored;
  if (!top || top.confidence < MIN_SCORE) return { kind: "none", reason: "No existing ledger is close enough. This may need a new ledger, which a person must approve." };
  if (second && top.confidence - second.confidence < MIN_GAP && second.confidence >= MIN_SCORE) {
    return {
      kind: "uncertain",
      candidates: scored.slice(0, 3).map((s) => ({ ledger: s.ledger, confidence: round(s.confidence) })),
      reason: "Two or more ledgers look equally likely. Please choose.",
    };
  }
  return { kind: "suggest", ledger: top.ledger, confidence: round(top.confidence), reason: `Payee resembles the existing ledger "${top.ledger}".` };
}

const round = (n: number) => Math.round(n * 100) / 100;
