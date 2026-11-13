// What kind of transaction a bank line is, read from its narration. Used to sort and group statement lines.
// Order of the checks matters: charges and interest are named before the payment mode, so "UPI charges" is a charge.
const RULES: Array<[string, RegExp]> = [
  ["Bank charges", /\b(charges?|chgs?|fees?|gst on|sms alert|min(imum)? bal|penalt(y|ies)|amc|processing fee)\b/i],
  ["Interest", /\b(int(erest)?\.?\s*(paid|credit|pd|cr|on)|int\.? ?pd|credit interest|sb int|interest)\b/i],
  ["Cash", /\b(atm|cash (wdl|withdrawal|deposit|dep)|cash\b|cdm)\b/i],
  ["Cheque", /\b(chq|cheque|check|clg|clearing|inward return|ecs)\b/i],
  ["UPI", /\b(upi|bhim|gpay|phonepe|paytm)\b/i],
  ["NEFT", /\bneft\b/i],
  ["RTGS", /\brtgs\b/i],
  ["IMPS", /\bimps\b/i],
  ["Card", /\b(pos|debit card|credit card|card)\b/i],
  ["Auto-debit", /\b(nach|si\b|standing instruction|emi|mandate|ach)\b/i],
  ["Transfer", /\b(ft|fund transfer|trf|transfer|to a\/c|by transfer)\b/i],
];

export const TXN_TYPES = [...RULES.map(([t]) => t), "Other"] as const;

export function txnType(particulars: string | null | undefined): string {
  const t = particulars ?? "";
  for (const [name, re] of RULES) if (re.test(t)) return name;
  return "Other";
}

/** Money in or out, from the sign of the amount (credits positive). */
export function txnDirection(amount: number): "Money in" | "Money out" {
  return amount < 0 ? "Money out" : "Money in";
}
