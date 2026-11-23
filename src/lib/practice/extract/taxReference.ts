/**
 * File names of returns, tax records and registers that hold no bank lines: GST returns and challans, ITC, 26AS, AIS, ITR, Form 3CD,
 * and sales and purchase registers. They are kept as reference documents and never reconciled. A real bank statement is not caught
 * by name alone: see looksLikeBankStatement.
 */
export const TAX_REFERENCE_FILE =
  /\b(gstr[\s_-]?\w*|gst[\s_-]?(credits?|liabilit(?:y|ies)|challans?|returns?|payments?)|challans?|return[\s_-]filing|itc|26\s?as|form[\s_-]?26as|ais|annual information|itr|form[\s_-]?3cd|3cd|computation of income|tax audit|(?:sales|purchase)[\s_-]+(?:and[\s_-]+(?:sales|purchase)[\s_-]+)?registers?)\b/i;

/** A statement has a running balance on nearly every line. Day numbers and tax amounts read as lines do not. */
export function looksLikeBankStatement(rows: { balance: number | null }[]): boolean {
  return rows.length >= 3 && rows.filter((r) => r.balance != null).length >= rows.length * 0.6;
}
