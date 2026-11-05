/**
 * Pure rules for writing an APPROVED bank line into Tally as a voucher.
 * No network here. The connector sends the XML to Tally only after a person has approved the
 * line and the ledger, and only when the ledger already exists in that company.
 *
 * Tally behaviour (field names, REMOTEID handling, duplicate response) is not verified against
 * Tally's official documentation in this repo yet: prove it on a TEST company before any live use.
 */

export type VoucherKind = "Payment" | "Receipt";

export interface ApprovedLine {
  /** Stable id of this approved line (our batch/line id). Used as REMOTEID so a resend cannot create a second voucher. */
  id: string;
  company: string;
  /** YYYY-MM-DD */
  date: string;
  direction: "in" | "out";
  amount: number;
  /** The bank ledger in Tally the statement belongs to. */
  bankLedger: string;
  /** The ledger the reviewer approved for the other side. */
  partyLedger: string;
  narration: string;
  reference?: string | null;
}

export const xmlEscape = (s: string): string =>
  String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const tallyDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Bad date ${iso}`);
  return `${m[1]}${m[2]}${m[3]}`;
};

/** Reasons a line must not be written. Empty means it may be. */
export function problemsWith(line: ApprovedLine, existingLedgers: Iterable<string>): string[] {
  const out: string[] = [];
  const have = new Set([...existingLedgers].map((l) => l.trim().toLowerCase()));
  if (!line.id) out.push("The line has no id.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date)) out.push("The date is not valid.");
  if (!(line.amount > 0) || !Number.isFinite(line.amount)) out.push("The amount must be more than zero.");
  if (!line.bankLedger.trim()) out.push("The bank ledger is missing.");
  if (!line.partyLedger.trim()) out.push("No ledger has been approved for this line.");
  if (line.bankLedger.trim().toLowerCase() === line.partyLedger.trim().toLowerCase()) out.push("The bank and the other ledger are the same.");
  if (line.partyLedger.trim() && !have.has(line.partyLedger.trim().toLowerCase())) out.push(`Ledger "${line.partyLedger}" does not exist in Tally. A new ledger needs its own approval.`);
  if (line.bankLedger.trim() && !have.has(line.bankLedger.trim().toLowerCase())) out.push(`Bank ledger "${line.bankLedger}" does not exist in Tally.`);
  return out;
}

/** Money in (a credit on the bank statement) is a Receipt, money out is a Payment. */
export const kindOf = (line: Pick<ApprovedLine, "direction">): VoucherKind => (line.direction === "in" ? "Receipt" : "Payment");

/** The Import Data request for one approved line. Throws if the line has problems the caller did not clear. */
export function importVoucherXml(line: ApprovedLine): string {
  const kind = kindOf(line);
  const amt = line.amount.toFixed(2);
  // Receipt: bank is debited (deemed positive, negative amount), the other ledger credited.
  // Payment: the other ledger is debited, the bank credited.
  const bankDebit = kind === "Receipt";
  const entry = (ledger: string, debit: boolean) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? "-" : ""}${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
  const narration = [line.narration, line.reference ? `Ref ${line.reference}` : ""].filter(Boolean).join(" | ");
  const voucher =
    `<VOUCHER REMOTEID="${xmlEscape(line.id)}" VCHTYPE="${kind}" ACTION="Create">` +
    `<DATE>${tallyDate(line.date)}</DATE><VOUCHERTYPENAME>${kind}</VOUCHERTYPENAME>` +
    `<NARRATION>${xmlEscape(narration)}</NARRATION><PARTYLEDGERNAME>${xmlEscape(line.partyLedger)}</PARTYLEDGERNAME>` +
    entry(line.partyLedger, !bankDebit) +
    entry(line.bankLedger, bankDebit) +
    `</VOUCHER>`;
  return (
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>` +
    `<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(line.company)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC>` +
    `<DATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${voucher}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`
  );
}

export interface ImportResult {
  ok: boolean;
  created: number;
  errors: number;
  message: string | null;
}

/** Reads Tally's import reply. Anything other than a clear single creation is NOT treated as posted. */
export function parseImportReply(xml: string): ImportResult {
  const num = (tag: string) => {
    const m = new RegExp(`<${tag}>\\s*(\\d+)\\s*</${tag}>`, "i").exec(xml);
    return m ? Number(m[1]) : 0;
  };
  const created = num("CREATED");
  const errors = num("ERRORS");
  const line = /<LINEERROR>([^<]*)<\/LINEERROR>/i.exec(xml);
  const message = line ? line[1].trim() : null;
  return { ok: created === 1 && errors === 0 && !message, created, errors, message };
}
