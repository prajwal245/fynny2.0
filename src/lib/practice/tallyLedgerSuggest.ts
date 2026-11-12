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
  /** Which way the money moved. Lets the standard bank items (charges, interest, cash) be recognised. */
  direction?: "in" | "out";
}

export type Suggestion =
  | { kind: "suggest"; ledger: string; confidence: number; reason: string }
  | {
      kind: "uncertain";
      candidates: { ledger: string; confidence: number }[];
      reason: string;
    }
  | { kind: "none"; reason: string };

export const MIN_SCORE = 0.78;
export const MIN_GAP = 0.1;

/** Ledgers that are the bank or system accounts and must never be suggested for the other side. */
const NEVER = /^(cash|profit & loss a\/c|profit and loss a\/c|primary)$/i;

/**
 * The items every bank statement has, recognised by the bank's own wording. They are matched only to a ledger that
 * already exists and only when exactly one ledger fits; otherwise the line waits for a person as before.
 */
const BANK_CHARGE =
  /\b(sms\s*chgs?|sms\s*charges?|chgs?\b|charges?\b|service\s*charges?|min(imum)?\s*bal\w*\s*(chg|charge)|processing\s*fee|annual\s*(fee|chg)|debit\s*card\s*(fee|chg)|folio\s*chg|chq\s*(book|issue)|imps\s*chg|neft\s*chg|rtgs\s*chg)/i;
const BANK_CHARGE_LEDGER =
  /^(bank\s*(charges?|fees?)|bank\s*&\s*finance\s*charges?|charges?|bank\s*service\s*charges?)$/i;
const CREDIT_INTEREST =
  /\b(int\.?\s*pd|interest\s*(paid|credit|credited)|int\s*cr|sb\s*int|savings?\s*interest)\b/i;
const CREDIT_INTEREST_LEDGER =
  /interest\s*(received|income|earned)|bank\s*interest|interest\s*on\s*(fd|savings|bank|deposit)/i;
const LOAN_INTEREST =
  /\b(int\.?\s*coll|loan\s*int|interest\s*(debit|debited|charged|on\s*(od|cc|loan)))\b/i;
const LOAN_INTEREST_LEDGER =
  /interest\s*(paid|expense|on\s*(loan|od|cc|overdraft))|bank\s*interest\s*paid/i;
const CASH_MOVE =
  /\b(atm\s*(wdl|withdrawal|cash)|self\s*(wdl|withdrawal)|cash\s*(wdl|withdrawal|deposit|dep)|cdm\b|cash\s*dep)/i;

function bankItem(
  text: string,
  direction: "in" | "out" | undefined,
  names: string[],
  all: string[],
): Suggestion | null {
  if (!direction || !text) return null;
  const one = (re: RegExp) => {
    const hit = names.filter((n) => re.test(n));
    return hit.length === 1 ? hit[0]! : null;
  };
  if (CASH_MOVE.test(text)) {
    const cash = all.find((n) => /^cash(\s+in\s+hand)?$/i.test(n.trim()));
    return {
      kind: "none",
      reason: cash
        ? `This looks like cash ${direction === "out" ? "withdrawn from" : "deposited into"} the bank. Open More options, tick "Transfer between my own bank or cash accounts" and choose "${cash}".`
        : "This looks like a cash withdrawal or deposit, which is a transfer between your own accounts. Open More options and tick the transfer option.",
    };
  }
  if (direction === "out" && BANK_CHARGE.test(text)) {
    const l = one(BANK_CHARGE_LEDGER);
    if (l)
      return {
        kind: "suggest",
        ledger: l,
        confidence: 0.9,
        reason: `Looks like a bank charge. If it includes GST, tick "This amount includes GST" in More options.`,
      };
  }
  if (direction === "in" && CREDIT_INTEREST.test(text)) {
    const l = one(CREDIT_INTEREST_LEDGER);
    if (l)
      return {
        kind: "suggest",
        ledger: l,
        confidence: 0.9,
        reason: "Looks like interest credited by the bank.",
      };
  }
  if (direction === "out" && LOAN_INTEREST.test(text)) {
    const l = one(LOAN_INTEREST_LEDGER);
    if (l)
      return {
        kind: "suggest",
        ledger: l,
        confidence: 0.9,
        reason: "Looks like interest charged by the bank.",
      };
  }
  return null;
}

export function suggestLedger(
  line: LineForSuggest,
  ledgers: string[],
  bankLedger?: string,
): Suggestion {
  const names = [
    ...new Set(ledgers.map((l) => l.trim()).filter(Boolean)),
  ].filter(
    (l) =>
      !NEVER.test(l) &&
      l.toLowerCase() !== (bankLedger ?? "").trim().toLowerCase(),
  );
  if (!names.length)
    return {
      kind: "none",
      reason: "No ledgers have been read from Tally yet.",
    };
  const text = [line.counterparty, line.description]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!text)
    return {
      kind: "none",
      reason: "The line has no payee or narration to match.",
    };
  const standard = bankItem(
    text,
    line.direction,
    names,
    ledgers.map((l) => l.trim()),
  );
  if (standard) return standard;

  const scored = names
    .map((ledger) => ({
      ledger,
      // The payee is the strongest signal; fall back to the narration.
      confidence: Math.max(
        line.counterparty ? nameScore(line.counterparty, ledger) : 0,
        nameScore(text, ledger) * 0.92,
      ),
    }))
    .filter((s) => s.confidence > 0)
    .sort(
      (a, b) => b.confidence - a.confidence || a.ledger.localeCompare(b.ledger),
    );

  const [top, second] = scored;
  if (!top || top.confidence < MIN_SCORE)
    return {
      kind: "none",
      reason:
        "No existing ledger is close enough. This may need a new ledger, which a person must approve.",
    };
  if (
    second &&
    top.confidence - second.confidence < MIN_GAP &&
    second.confidence >= MIN_SCORE
  ) {
    return {
      kind: "uncertain",
      candidates: scored
        .slice(0, 3)
        .map((s) => ({ ledger: s.ledger, confidence: round(s.confidence) })),
      reason: "Two or more ledgers look equally likely. Please choose.",
    };
  }
  return {
    kind: "suggest",
    ledger: top.ledger,
    confidence: round(top.confidence),
    reason: `Payee resembles the existing ledger "${top.ledger}".`,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
