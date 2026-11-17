/**
 * A loan statement is not a bank account.
 *
 * A term loan, GECL, vehicle or CV loan statement lists disbursements, instalments (EMIs), interest and the outstanding principal. Read
 * as bank lines it fills the exception queue with entries that can never match a bank statement. It is recognised from its own wording
 * (never from a guess), kept as a loan account with a short summary, and left out of bank reconciliation. The EMIs that really left
 * the bank are matched from the bank statement against the loan ledger in the books.
 */
const MARKERS: [string, RegExp][] = [
  ["loan", /\bloan\b/i],
  ["emi", /\b(emi|equated monthly|instal+ment|installment)\b/i],
  ["principal", /\bprincipal\b/i],
  ["outstanding", /\b(outstanding|o\/s)\b/i],
  ["interest", /\binterest\b/i],
  ["disbursement", /\b(disburs\w+|sanction\w*)\b/i],
  ["rate", /\brate of interest\b|\broi\b/i],
];

/** The wording a loan statement uses about ITSELF, which a bank statement does not: "loan account", "loan A/c no", "statement of loan". */
const SELF = /\b(loan\s*(account|a\/c|acct|no\.?|number|statement|schedule)|statement\s+of\s+(the\s+)?loan|loan\s+outstanding|term\s+loan\s+account)\b/i;

export function looksLikeLoanStatement(text: string): boolean {
  const head = text.slice(0, 6_000);
  const hits = MARKERS.filter(([, re]) => re.test(head)).map(([k]) => k);
  // The statement must call itself a loan account AND carry instalment or principal wording. A bank statement that merely shows loan
  // EMIs in its narrations never describes itself that way.
  return SELF.test(head) && (hits.includes("emi") || hits.includes("principal")) && hits.length >= 3;
}

const MONEY = /\d[\d,]*\.\d{1,2}/g;
const DATED = /^\s*(\d{1,2}[-/. ](?:\d{1,2}|[A-Za-z]{3})[-/. ,]*\d{2,4})\b/;

export interface LoanSummary {
  entries: number;
  totals: { label: string; amount: number }[];
  note: string;
}

/** What can be said from the text alone: how many dated lines, how many are instalments, the last balance printed. Nothing is invented. */
export function summariseLoanStatement(text: string): LoanSummary {
  const lines = text.split("\n");
  const dated = lines.filter((l) => DATED.test(l));
  const emis = dated.filter((l) => /\b(emi|instal+ment|installment|repay\w*)\b/i.test(l));
  const lastWithMoney = [...dated].reverse().find((l) => (l.match(MONEY) ?? []).length > 0);
  const lastMoney = lastWithMoney ? (lastWithMoney.match(MONEY) ?? []).pop() : undefined;
  const totals: { label: string; amount: number }[] = [{ label: "Instalment lines", amount: emis.length }];
  if (lastMoney) totals.push({ label: "Last balance printed", amount: Number(lastMoney.replace(/,/g, "")) });
  return {
    entries: dated.length,
    totals,
    note: dated.length
      ? "Kept as a loan statement for reference. It is a loan account, not a bank account, so it is not reconciled line by line. The instalments that left the bank are matched from the bank statement against the loan ledger in the books."
      : "This loan statement has no dated entries in the period. It is kept for reference and not reconciled.",
  };
}
