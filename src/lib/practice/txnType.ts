// What kind of transaction a bank line is, read from its narration. Used to sort and group statement lines.
// Order of the checks matters: charges and interest are named before the payment mode, so "UPI charges" is a charge.
const RULES: Array<[string, RegExp]> = [
  ["Bank charges", /\b(charges?|chgs?|chrgs?|fees?|gst on|sms alert|min(imum)? bal|penalt(y|ies)|amc|processing fee)\b|(^|[^a-z])chgs/i],
  ["Interest", /\b(int(erest)?\.?\s*(paid|credit|pd|cr|on|coll)|int\.? ?pd|credit interest|sb int|interest)\b/i],
  ["Cash", /\b(atm|cash (wdl|withdrawal|deposit|dep)|cash\b|cdm)\b/i],
  ["Cheque", /\b(chq|cheque|check|clg|clearing|inward return|ecs)\b/i],
  // Banks glue their own codes onto the mode ("UPIAB/1086…/CR", "IMPSAB/5138…", "MOBFT/…"), so the mode is matched where a
  // word starts, not as a whole word.
  ["UPI", /(^|[^a-z])upi|\b(bhim|gpay|phonepe|paytm)\b/i],
  ["NEFT", /(^|[^a-z])neft|\/n\s?eft\//i],
  ["RTGS", /(^|[^a-z])rtgs/i],
  ["IMPS", /(^|[^a-z])imps|\bmmt\b/i],
  ["Card", /\b(pos|debit card|credit card|card)\b/i],
  ["Auto-debit", /\b(nach|si\b|standing instruction|emi|mandate|ach)\b/i],
  ["Transfer", /\b(ft|fund transfer|trf|tfr|trsf|transfer|to a\/c|by transfer|trfr|mobft|inft|inf)\b|(^|[^a-z])(mobft|inft)/i],
];

export const TXN_TYPES = [...RULES.map(([t]) => t), "Other"] as const;

export function txnType(particulars: string | null | undefined): string {
  // "Txn Amt. 48,903.00 Charges. 5.61 /NEFT/…" is a NEFT payment that states its fee, not a bank charge: the fee figure is set aside.
  const t = (particulars ?? "").replace(/\bcharges?\.?\s*[\d,]+(\.\s?\d+)?/gi, " ");
  for (const [name, re] of RULES) if (re.test(t)) return name;
  return "Other";
}

/** Money in or out, from the sign of the amount (credits positive). */
export function txnDirection(amount: number): "Money in" | "Money out" {
  return amount < 0 ? "Money out" : "Money in";
}
