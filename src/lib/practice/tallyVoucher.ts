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
  /** True when the approved ledger sits under Sundry Debtors or Sundry Creditors: Tally flags that entry as the party. */
  partyLedgerIsParty?: boolean;
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
export function splitGstInclusive(
  total: number,
  ratePercent: number,
  intra: boolean,
): { base: number; cgst: number; sgst: number; igst: number } {
  const t = paise(total);
  if (!(t > 0) || !(ratePercent > 0))
    throw new Error("Amount and rate must be more than zero.");
  const tax = Math.round((t * ratePercent) / (100 + ratePercent));
  if (!intra)
    return { base: (t - tax) / 100, cgst: 0, sgst: 0, igst: tax / 100 };
  const half = Math.floor(tax / 2);
  const base = t - half * 2;
  return { base: base / 100, cgst: half / 100, sgst: half / 100, igst: 0 };
}

/**
 * Reasons a line must not be written. Empty means it may be.
 * `bankLike` is every bank and cash ledger in the company: a Contra must be between two of them,
 * and a Receipt or Payment must not be (that is a transfer, which Tally records as a Contra).
 */
export function problemsWith(
  line: ApprovedLine,
  existingLedgers: Iterable<string>,
  bankLike: Iterable<string> = [],
): string[] {
  const out: string[] = [];
  const have = new Set([...existingLedgers].map(key));
  const bankSet = new Set([...bankLike].map(key));
  if (!line.id) out.push("The line has no id.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date))
    out.push("The date is not valid.");
  if (!(line.amount > 0) || !Number.isFinite(line.amount))
    out.push("The amount must be more than zero.");
  if (!line.bankLedger.trim()) out.push("The bank ledger is missing.");
  if (key(line.bankLedger) && !have.has(key(line.bankLedger)))
    out.push(`Bank ledger "${line.bankLedger}" does not exist in Tally.`);

  const others = line.splits?.length
    ? line.splits.map((x) => x.ledger)
    : [line.partyLedger];
  if (line.splits?.length) {
    if (line.kind === "Contra")
      out.push("A transfer between your own accounts cannot be split.");
    if (line.splits.length < 2 || line.splits.length > 10)
      out.push("A split needs between 2 and 10 ledgers.");
    if (line.splits.some((x) => !(x.amount > 0) || !Number.isFinite(x.amount)))
      out.push("Every part of a split must be more than zero.");
    else if (
      paise(line.splits.reduce((a, x) => a + paise(x.amount), 0) / 100) !==
      paise(line.amount)
    )
      out.push(
        "The parts of the split must add up to the amount of the line exactly.",
      );
  } else if (!line.partyLedger.trim())
    out.push("No ledger has been approved for this line.");

  for (const l of others) {
    if (!l.trim()) continue;
    if (key(l) === key(line.bankLedger))
      out.push("The bank and the other ledger are the same.");
    if (!have.has(key(l)))
      out.push(
        `Ledger "${l}" does not exist in Tally. A new ledger needs its own approval and must be created in Tally first.`,
      );
    if (line.kind === "Contra") {
      if (!bankSet.has(key(l)))
        out.push(
          `"${l}" is not a bank or cash ledger, so this cannot be a Contra.`,
        );
    } else if (bankSet.has(key(l)) && key(l) !== key(line.bankLedger)) {
      out.push(
        `"${l}" is a bank or cash ledger. A transfer between your own accounts must be posted as a Contra.`,
      );
    }
  }
  return [...new Set(out)];
}

/** Money in (a credit on the bank statement) is a Receipt, money out is a Payment. */
export const kindOf = (
  line: Pick<ApprovedLine, "direction"> & { kind?: "Contra" },
): VoucherKind =>
  line.kind === "Contra"
    ? "Contra"
    : line.direction === "in"
      ? "Receipt"
      : "Payment";

export type ImportFormat = "import-data" | "legacy";

/**
 * The Import Data request for one approved line, shaped like the vouchers TallyPrime itself exports and imports
 * (checked against a real Tally import file): header "Import Data", IMPORTDATA / REQUESTDESC / REQUESTDATA, a VOUCHER with
 * REMOTEID, VCHTYPE, ACTION="Create" and OBJVIEW, debit entries first, each entry with ISDEEMEDPOSITIVE, ISPARTYLEDGER
 * and a signed AMOUNT (negative for a debit). The older "Import / Data / Vouchers" shape is kept for connectors before 1.4.0.
 * Throws if the line has problems the caller did not clear.
 */
export function importVoucherXml(
  line: ApprovedLine,
  format: ImportFormat = "import-data",
): string {
  const kind = kindOf(line);
  const amt = line.amount.toFixed(2);
  // Money in (Receipt, or a Contra into the bank): the bank is debited (deemed positive, negative amount), the other side credited.
  // Money out (Payment, or a Contra out of the bank): the other side is debited, the bank credited.
  const bankDebit = line.direction === "in";
  const entry = (
    ledger: string,
    debit: boolean,
    value: string,
    party = false,
  ) =>
    `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>` +
    (format === "import-data"
      ? `<ISPARTYLEDGER>${party ? "Yes" : "No"}</ISPARTYLEDGER>`
      : "") +
    `<AMOUNT>${debit ? "-" : ""}${value}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
  const legs: { debit: boolean; xml: string }[] = [];
  if (line.splits?.length)
    for (const x of line.splits)
      legs.push({
        debit: !bankDebit,
        xml: entry(x.ledger, !bankDebit, x.amount.toFixed(2)),
      });
  else
    legs.push({
      debit: !bankDebit,
      xml: entry(
        line.partyLedger,
        !bankDebit,
        amt,
        kindOf(line) !== "Contra" && line.partyLedgerIsParty === true,
      ),
    });
  legs.push({ debit: bankDebit, xml: entry(line.bankLedger, bankDebit, amt) });
  // Tally writes its own debit entries before its credit entries.
  const entries = [
    ...legs.filter((l) => l.debit),
    ...legs.filter((l) => !l.debit),
  ]
    .map((l) => l.xml)
    .join("");
  const lead = line.splits?.length ? line.splits[0].ledger : line.partyLedger;
  const narration = [
    line.narration,
    line.reference ? `Ref ${line.reference}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const view =
    format === "import-data" ? ` OBJVIEW="Accounting Voucher View"` : "";
  const voucher =
    `<VOUCHER REMOTEID="${xmlEscape(line.id)}" VCHTYPE="${kind}" ACTION="Create"${view}>` +
    `<DATE>${tallyDate(line.date)}</DATE><VOUCHERTYPENAME>${kind}</VOUCHERTYPENAME>` +
    `<PARTYLEDGERNAME>${xmlEscape(lead)}</PARTYLEDGERNAME><NARRATION>${xmlEscape(narration)}</NARRATION>` +
    (format === "import-data"
      ? `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>`
      : "") +
    entries +
    `</VOUCHER>`;
  if (format === "legacy")
    return (
      `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>` +
      `<BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(line.company)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC>` +
      `<DATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${voucher}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`
    );
  return (
    `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>` +
    `<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(line.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>` +
    `<REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${voucher}</TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`
  );
}

/* ── the last check before anything is sent: is this voucher sound? ── */

const tagText = (block: string, tag: string) => {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(
    block,
  );
  return m ? m[1]!.trim() : "";
};

/**
 * Problems in ONE voucher, whatever its type. It is held to what Tally's own exports always satisfy (checked against a real
 * 123 voucher Day Book and a 104 voucher import file, with no false alarms): a valid date, at least two entries, every entry with
 * a ledger and a non-zero amount of at most two decimals whose sign agrees with ISDEEMEDPOSITIVE (Yes = debit = negative),
 * at least one debit and one credit, and debits equal to credits to the paisa.
 */
export function voucherProblems(block: string): string[] {
  const out: string[] = [];
  const date = tagText(block, "DATE");
  if (
    !/^\d{8}$/.test(date) ||
    Number.isNaN(
      Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`),
    )
  )
    out.push("The voucher date is not a valid date.");
  const entries = [
    ...block.matchAll(
      /<(ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST\b[^>]*>([\s\S]*?)<\/\1\.LIST>/gi,
    ),
  ].map((m) => m[2]!);
  if (entries.length < 2)
    out.push("A voucher needs at least two ledger entries.");
  let sum = 0;
  let debits = 0;
  let credits = 0;
  for (const e of entries) {
    const name = tagText(e, "LEDGERNAME");
    const amountText = tagText(e, "AMOUNT");
    const deemed = tagText(e, "ISDEEMEDPOSITIVE");
    if (!name) out.push("An entry has no ledger name.");
    if (!/^-?\d+(\.\d{1,2})?$/.test(amountText)) {
      out.push(
        `The amount "${amountText}" is not a number with at most two decimals.`,
      );
      continue;
    }
    const p = Math.round(Number(amountText) * 100);
    if (p === 0) out.push(`The entry for "${name}" has no amount.`);
    if (deemed !== "Yes" && deemed !== "No")
      out.push(`The entry for "${name}" does not say whether it is a debit.`);
    else if ((deemed === "Yes") !== p < 0)
      out.push(
        `The entry for "${name}" has a sign that does not match its debit or credit.`,
      );
    if (p < 0) debits += -p;
    else credits += p;
    sum += p;
  }
  if (entries.length >= 2 && (debits === 0 || credits === 0))
    out.push("A voucher needs a debit and a credit.");
  if (sum !== 0)
    out.push(
      `Debits and credits differ by ₹${(Math.abs(sum) / 100).toFixed(2)}.`,
    );
  return out;
}

/**
 * Everything wrong with an Import Data request FynHelp is about to send: it must be exactly one NEW Receipt, Payment or Contra
 * for the named company, with an id, and a sound voucher. Empty means it may be sent.
 */
export function importProblems(xml: string, company: string): string[] {
  const out: string[] = [];
  const blocks = xml.match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi) ?? [];
  if (blocks.length !== 1)
    return [`Expected exactly one voucher, found ${blocks.length}.`];
  const block = blocks[0]!;
  const head = /<VOUCHER\b([^>]*)>/i.exec(block)?.[1] ?? "";
  const attr = (n: string) =>
    new RegExp(`\\b${n}="([^"]*)"`, "i").exec(head)?.[1] ?? "";
  if (attr("ACTION") !== "Create")
    out.push("A voucher may only be created, never changed.");
  if (!attr("REMOTEID"))
    out.push("The voucher has no id, so a resend could create a second one.");
  const type = attr("VCHTYPE");
  if (!/^(Receipt|Payment|Contra)$/.test(type))
    out.push(`Voucher type "${type}" is not allowed.`);
  if (tagText(block, "VOUCHERTYPENAME") !== type)
    out.push("The voucher type names disagree.");
  const co =
    /<SVCURRENTCOMPANY>([\s\S]*?)<\/SVCURRENTCOMPANY>/i.exec(xml)?.[1] ?? "";
  if (
    co
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim() !== company.trim()
  )
    out.push("The entry names a different company.");
  out.push(...voucherProblems(block));
  return out;
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
  return {
    ok: created === 1 && errors === 0 && !message,
    created,
    errors,
    message,
  };
}
