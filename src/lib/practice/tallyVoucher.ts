/**
 * Pure rules for writing an APPROVED bank line into Tally as a voucher.
 * No network here. The connector sends the XML to Tally only after a person has approved the
 * line and the ledger, and only when the ledger already exists in that company.
 *
 * Tally behaviour (field names, REMOTEID handling, duplicate response) is not verified against
 * Tally's official documentation in this repo yet: prove it on a TEST company before any live use.
 */

export type VoucherKind = "Payment" | "Receipt" | "Contra";

export interface Split {
  ledger: string;
  amount: number;
}

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
  /** Receipt or Payment follow the direction. "Contra" is a transfer between your own bank and cash ledgers. */
  kind?: "Contra";
  /** The other side split over several ledgers (a charge and its GST). Amounts must add up to `amount` exactly. */
  splits?: Split[] | null;
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

const key = (n: string) => n.trim().toLowerCase();
const paise = (n: number) => Math.round(n * 100);

/**
 * GST that is included in a total, split into the base and the tax, in whole paise so the parts add up
 * to the total exactly. CGST and SGST are equal halves; any odd paisa goes to the base.
 */
export function splitGstInclusive(total: number, ratePercent: number, intra: boolean): { base: number; cgst: number; sgst: number; igst: number } {
  const t = paise(total);
  if (!(t > 0) || !(ratePercent > 0)) throw new Error("Amount and rate must be more than zero.");
  const tax = Math.round((t * ratePercent) / (100 + ratePercent));
  if (!intra) return { base: (t - tax) / 100, cgst: 0, sgst: 0, igst: tax / 100 };
  const half = Math.floor(tax / 2);
  const base = t - half * 2;
  return { base: base / 100, cgst: half / 100, sgst: half / 100, igst: 0 };
}

/**
 * Reasons a line must not be written. Empty means it may be.
 * `bankLike` is every bank and cash ledger in the company: a Contra must be between two of them,
 * and a Receipt or Payment must not be (that is a transfer, which Tally records as a Contra).
 */
export function problemsWith(line: ApprovedLine, existingLedgers: Iterable<string>, bankLike: Iterable<string> = []): string[] {
  const out: string[] = [];
  const have = new Set([...existingLedgers].map(key));
  const bankSet = new Set([...bankLike].map(key));
  if (!line.id) out.push("The line has no id.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date)) out.push("The date is not valid.");
  if (!(line.amount > 0) || !Number.isFinite(line.amount)) out.push("The amount must be more than zero.");
  if (!line.bankLedger.trim()) out.push("The bank ledger is missing.");
  if (key(line.bankLedger) && !have.has(key(line.bankLedger))) out.push(`Bank ledger "${line.bankLedger}" does not exist in Tally.`);

  const others = line.splits?.length ? line.splits.map((x) => x.ledger) : [line.partyLedger];
  if (line.splits?.length) {
    if (line.kind === "Contra") out.push("A transfer between your own accounts cannot be split.");
    if (line.splits.length < 2 || line.splits.length > 10) out.push("A split needs between 2 and 10 ledgers.");
    if (line.splits.some((x) => !(x.amount > 0) || !Number.isFinite(x.amount))) out.push("Every part of a split must be more than zero.");
    else if (paise(line.splits.reduce((a, x) => a + paise(x.amount), 0) / 100) !== paise(line.amount)) out.push("The parts of the split must add up to the amount of the line exactly.");
  } else if (!line.partyLedger.trim()) out.push("No ledger has been approved for this line.");

  for (const l of others) {
    if (!l.trim()) continue;
    if (key(l) === key(line.bankLedger)) out.push("The bank and the other ledger are the same.");
    if (!have.has(key(l))) out.push(`Ledger "${l}" does not exist in Tally. A new ledger needs its own approval and must be created in Tally first.`);
    if (line.kind === "Contra") {
      if (!bankSet.has(key(l))) out.push(`"${l}" is not a bank or cash ledger, so this cannot be a Contra.`);
    } else if (bankSet.has(key(l)) && key(l) !== key(line.bankLedger)) {
      out.push(`"${l}" is a bank or cash ledger. A transfer between your own accounts must be posted as a Contra.`);
    }
  }
  return [...new Set(out)];
}

/** Money in (a credit on the bank statement) is a Receipt, money out is a Payment. */
export const kindOf = (line: Pick<ApprovedLine, "direction"> & { kind?: "Contra" }): VoucherKind => (line.kind === "Contra" ? "Contra" : line.direction === "in" ? "Receipt" : "Payment");

/** The Import Data request for one approved line. Throws if the line has problems the caller did not clear. */
export function importVoucherXml(line: ApprovedLine): string {
  const kind = kindOf(line);
  const amt = line.amount.toFixed(2);
  // Money in (Receipt, or a Contra into the bank): the bank is debited (deemed positive, negative amount), the other side credited.
  // Money out (Payment, or a Contra out of the bank): the other side is debited, the bank credited.
  const bankDebit = line.direction === "in";
  const entry = (ledger: string, debit: boolean, value = amt) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? "-" : ""}${value}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
  const otherSide = line.splits?.length
    ? line.splits.map((x) => entry(x.ledger, !bankDebit, x.amount.toFixed(2))).join("")
    : entry(line.partyLedger, !bankDebit);
  const lead = line.splits?.length ? line.splits[0].ledger : line.partyLedger;
  const narration = [line.narration, line.reference ? `Ref ${line.reference}` : ""].filter(Boolean).join(" | ");
  const voucher =
    `<VOUCHER REMOTEID="${xmlEscape(line.id)}" VCHTYPE="${kind}" ACTION="Create">` +
    `<DATE>${tallyDate(line.date)}</DATE><VOUCHERTYPENAME>${kind}</VOUCHERTYPENAME>` +
    `<NARRATION>${xmlEscape(narration)}</NARRATION><PARTYLEDGERNAME>${xmlEscape(lead)}</PARTYLEDGERNAME>` +
    otherSide +
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
