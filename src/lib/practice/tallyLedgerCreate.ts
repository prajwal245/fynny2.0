/**
 * Creating a ledger in Tally from FynHelp, so a payee that is not in Tally yet can still be entered.
 *
 * It is deliberately narrow. FynHelp creates ONE ledger with a name and a group, when a partner or manager asks, and
 * reads it back from Tally to prove it exists. It never alters or deletes a ledger, never sets an opening balance, and
 * never creates the ledgers that need tax or bank settings (GST, TDS, bank, cash, capital, stock): those stay in Tally.
 */
import { nameScore } from "./recon/engine";
import { xmlEscape } from "./tallyVoucher";

/** Groups a firm may create a ledger under: parties, income, expenses and plain assets and liabilities. */
export const CREATABLE_GROUPS: { name: string; use: string }[] = [
  { name: "Sundry Creditors", use: "A supplier or vendor you owe money" },
  { name: "Sundry Debtors", use: "A customer who owes you money" },
  {
    name: "Indirect Expenses",
    use: "Overheads: rent, fees, utilities, office costs",
  },
  {
    name: "Direct Expenses",
    use: "Costs of making or delivering: freight inward, wages",
  },
  { name: "Indirect Incomes", use: "Interest, commission, other income" },
  {
    name: "Direct Incomes",
    use: "Income from the main activity, other than sales",
  },
  { name: "Purchase Accounts", use: "Purchases of goods" },
  { name: "Sales Accounts", use: "Sales of goods or services" },
  { name: "Current Liabilities", use: "Amounts payable within a year" },
  { name: "Current Assets", use: "Amounts receivable or held short term" },
  { name: "Loans & Advances (Asset)", use: "Advances and deposits given" },
  { name: "Fixed Assets", use: "Long-term assets" },
  { name: "Unsecured Loans", use: "Loans taken without security" },
  { name: "Investments", use: "Investments held" },
];

/** Groups whose ledgers need tax, bank or stock settings that only Tally can ask for properly. */
const NEEDS_TALLY =
  /bank|cash|duties|tax|gst|tds|capital|stock|reserve|primary|branch|suspense|profit/i;

/** Names that mean something to Tally or to FynHelp and must not be created as a ledger. */
const RESERVED =
  /^(primary|profit\s*&\s*loss\s*a\/c|profit\s*and\s*loss\s*a\/c|cash|bank\s*accounts|\(as per details\)|opening balance|difference in opening balances)$/i;

export const MAX_LEDGER_NAME = 99;

export const cleanLedgerName = (raw: string): string =>
  raw.replace(/\s+/g, " ").trim();

/** Existing ledgers whose names are close enough that the new one is probably the same party spelt differently. */
export function similarLedgers(name: string, existing: string[]): string[] {
  const n = cleanLedgerName(name).toLowerCase();
  return existing
    .filter((e) => nameScore(n, e.toLowerCase()) >= 0.88)
    .slice(0, 3);
}

export interface LedgerRequest {
  name: string;
  parent: string;
}

/**
 * Why a ledger may not be created, in words a person can act on. An empty list means it may. A close match to an
 * existing ledger stops the request unless the person says it is really a different party.
 */
export function ledgerRequestProblems(
  req: LedgerRequest,
  existing: { name: string; parent: string | null }[],
  opts: { allowSimilar?: boolean } = {},
): string[] {
  const out: string[] = [];
  const name = cleanLedgerName(req.name);
  const parent = req.parent.trim();
  if (!name) out.push("Type the ledger name.");
  if (name.length > MAX_LEDGER_NAME)
    out.push(`A ledger name can be at most ${MAX_LEDGER_NAME} characters.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>"]/.test(name))
    out.push(
      "The ledger name has a character Tally does not accept (a quote, an angle bracket or a control character).",
    );
  if (RESERVED.test(name))
    out.push(`"${name}" is a name Tally keeps for itself.`);
  const customParents = new Set(
    existing
      .map((e) => (e.parent ?? "").trim())
      .filter((p) => p && !NEEDS_TALLY.test(p)),
  );
  const allowed =
    CREATABLE_GROUPS.some(
      (g) => g.name.toLowerCase() === parent.toLowerCase(),
    ) ||
    [...customParents].some((p) => p.toLowerCase() === parent.toLowerCase());
  if (!parent) out.push("Choose the group the ledger belongs to.");
  else if (NEEDS_TALLY.test(parent))
    out.push(
      `Ledgers under "${parent}" need tax, bank or stock settings, so create them in Tally.`,
    );
  else if (!allowed)
    out.push(
      `"${parent}" is not a group FynHelp creates ledgers under. Choose one from the list.`,
    );
  const same = existing.find(
    (e) => e.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (same)
    out.push(
      `"${same.name}" already exists in Tally${same.parent ? ` under ${same.parent}` : ""}. Choose it from the list instead.`,
    );
  else if (!opts.allowSimilar) {
    const close = similarLedgers(
      name,
      existing.map((e) => e.name),
    );
    if (close.length)
      out.push(
        `This looks like ${close.map((c) => `"${c}"`).join(" or ")}, which already exists. Use that ledger, or confirm this is a different party.`,
      );
  }
  return out;
}

/** The request Tally accepts for one new ledger: its own "Import Data" form with the All Masters report. */
export function createLedgerXml(
  company: string,
  nameRaw: string,
  parent: string,
): string {
  const name = xmlEscape(cleanLedgerName(nameRaw));
  return (
    `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>` +
    `<STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>` +
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${name}" ACTION="Create"><NAME.LIST><NAME>${name}</NAME></NAME.LIST><PARENT>${xmlEscape(parent.trim())}</PARENT></LEDGER></TALLYMESSAGE>` +
    `</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`
  );
}

/**
 * The same check the connector runs before it sends anything: exactly one ledger, created (never altered or deleted),
 * with a name and a group, for the named company, and nothing else in the request.
 */
export function ledgerImportProblems(xml: string, company: string): string[] {
  const out: string[] = [];
  if (
    !/<TALLYREQUEST>\s*Import Data\s*<\/TALLYREQUEST>/i.test(xml) ||
    !/<REPORTNAME>\s*All Masters\s*<\/REPORTNAME>/i.test(xml)
  )
    out.push("This is not a masters import.");
  if (
    !new RegExp(
      `<SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>`,
    ).test(xml)
  )
    out.push("The request names a different company.");
  const ledgers = xml.match(/<LEDGER[\s>]/gi) ?? [];
  if (ledgers.length !== 1)
    out.push(`Expected exactly one ledger, found ${ledgers.length}.`);
  if (!/<LEDGER\b[^>]*\bACTION="Create"/i.test(xml))
    out.push("A ledger may only be created, never changed.");
  if (
    /\bACTION="(Alter|Delete|Cancel|Remove)"/i.test(xml) ||
    /<(DELETE|CANCEL)\b/i.test(xml)
  )
    out.push("Changing or deleting is not allowed.");
  if (
    /<(VOUCHER|GROUP|STOCKITEM|STOCKGROUP|COSTCENTRE|VOUCHERTYPE|UNIT|GODOWN|CURRENCY|COMPANY|EMPLOYEE|PAYHEAD)[\s>]/i.test(
      xml,
    )
  )
    out.push("Only a ledger may be created.");
  if (/<OPENINGBALANCE\b/i.test(xml))
    out.push("An opening balance may not be set from FynHelp.");
  const attr = /<LEDGER\b[^>]*\bNAME="([^"]*)"/i.exec(xml)?.[1] ?? "";
  const inner = /<NAME\.LIST>\s*<NAME>([^<]*)<\/NAME>/i.exec(xml)?.[1] ?? "";
  if (!attr.trim()) out.push("The ledger has no name.");
  if (attr !== inner)
    out.push("The ledger name is not the same in both places.");
  if (!/<PARENT>\s*[^<\s][^<]*<\/PARENT>/i.test(xml))
    out.push("The ledger has no group.");
  return out;
}
