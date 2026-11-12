#!/usr/bin/env node
/**
 * FynHelp Connector for TallyPrime (version 1.4.0)
 *
 * Runs on the PC where TallyPrime is open. It asks Tally (on this PC) for each linked company's
 * Day Book and sends it to FynHelp over HTTPS. It only makes outbound connections, never opens a
 * port to the internet. It reads from Tally. It writes into Tally ONLY lines your team approved in FynHelp,
 * and only if you set "allowWrite": true in fynhelp-connector.json (off by default).
 *
 * SET UP (about 5 minutes)
 *  1. TallyPrime: F1 (Help) -> Settings -> Connectivity -> Client/Server configuration.
 *     Set "TallyPrime acts as" to Both, port 9000. Keep the company you want open in Tally.
 *  2. Install Node.js 18 or later (https://nodejs.org), then save this file in a folder, for example
 *     C:\FynHelp\fynhelp-tally-connector.mjs
 *  3. In FynHelp: Settings -> TallyPrime -> Add connector. Copy the token it shows.
 *  4. In the same folder create fynhelp-connector.json:
 *       { "token": "fyn_tc_..." }
 *     Optional keys: "server" (default https://www.fynhelp.com), "tallyUrl" (default
 *     http://localhost:9000), "checkMinutes" (default 2), "allowWrite" (default false).
 *     Easier on Windows: run fynhelp-connector-setup.cmd, paste the token, and it does steps 2 to 5 for you.
 *  5. Test:   node fynhelp-tally-connector.mjs --check
 *     Run it: node fynhelp-tally-connector.mjs
 *  6. In FynHelp, link each Tally company to a client (Settings -> TallyPrime). Months of books
 *     then arrive by themselves. To keep it running after a restart, add it to Windows Task
 *     Scheduler ("At log on", action: node with this file) or install it as a service with NSSM.
 *
 * Flags: --check (test Tally and FynHelp, then exit)   --once (one round, then exit)
 *        --config <file> (use another config file)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const VERSION = "1.5.0";

/* ── Tally XML helpers (pure; tested) ───────────────────────── */

/** Tally answers in UTF-8 or UTF-16 (with a BOM). */
export function decodeTally(buf) {
  const b = Buffer.from(buf);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString("utf16le");
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString("utf8");
  return b.toString("utf8");
}

/** Tally can write characters XML forbids (for example &#4;). Remove them so FynHelp can read the file. */
export function sanitizeTallyXml(text) {
  return String(text)
    .replace(/&#(?:0*(?:[0-8]|11|12|1[4-9]|2[0-9]|30|31)|x0*(?:[0-8]|b|c|e|f|1[0-9a-f]));/gi, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) =>
  String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

export function companyListRequest() {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>FynHelpCompanies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="FynHelpCompanies" ISMODIFY="No"><TYPE>Company</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}

/** First and last day of "YYYY-MM" as Tally dates (YYYYMMDD). */
export function monthRange(month) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new Error(`Bad month ${month}`);
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { from: `${m[1]}${m[2]}01`, to: `${m[1]}${m[2]}${String(last).padStart(2, "0")}` };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "20261101" as Tally prints a date ("1-Nov-2026"), or unchanged ("ymd"). */
export function tallyDate(ymd, style = "dmy") {
  if (style === "ymd") return ymd;
  return `${Number(ymd.slice(6, 8))}-${MON[Number(ymd.slice(4, 6)) - 1]}-${ymd.slice(0, 4)}`;
}

/** Every day of a month as YYYYMMDD. */
export function daysOfMonth(month) {
  const { from, to } = monthRange(month);
  const out = [];
  for (let d = Number(from.slice(6)); d <= Number(to.slice(6)); d++) out.push(`${from.slice(0, 6)}${String(d).padStart(2, "0")}`);
  return out;
}

/** The distinct voucher dates (YYYYMMDD) in a Day Book reply. */
export function voucherDates(xml) {
  const out = new Set();
  for (const m of xml.matchAll(/<VOUCHER\b[\s\S]*?<DATE>\s*(\d{8})\s*<\/DATE>/gi)) out.add(m[1]);
  return [...out].sort();
}

/** The <VOUCHER> blocks of a reply, as written. */
export function voucherBlocks(xml) {
  return xml.match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi) ?? [];
}

/** One Day Book envelope from several replies, without the same voucher twice. */
export function mergeDayBooks(replies) {
  const seen = new Set();
  const blocks = [];
  for (const r of replies) for (const b of voucherBlocks(r)) if (!seen.has(b)) { seen.add(b); blocks.push(b); }
  return `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${blocks.join("")}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
}

/**
 * The ways of asking Tally for a month of vouchers, in the order tried. TallyPrime 7.2 was seen to IGNORE the period in a
 * Day Book request (it answered with the same few vouchers, all dated Tally's current date), while its Voucher Register honours it.
 */
export const PERIOD_ATTEMPTS = [
  { id: "Voucher Register", style: "dmy", typed: true },
  { id: "Voucher Register", style: "ymd", typed: false },
  { id: "Day Book", style: "dmy", typed: true },
  { id: "Day Book", style: "ymd", typed: false },
];

/** The voucher dates in a reply that fall outside the month (YYYYMMDD), or an empty list. */
export function datesOutsideMonth(xml, month) {
  const { from, to } = monthRange(month);
  return voucherDates(xml).filter((d) => d < from || d > to);
}

/**
 * A month of vouchers that is checked: every voucher date must fall inside the month, or the reply is refused and the next
 * way of asking is tried. If nothing works, this throws and NOTHING is sent for the month (a wrong month must never be filed).
 * A month in which every way of asking returns no vouchers at all is genuinely empty and is returned as such.
 */
export async function fetchDayBook(ask, company, month, onAttempt = () => {}) {
  const { from, to } = monthRange(month);
  const problems = [];
  let empty = null;
  let undated = null;
  let sawWrongDates = false;
  for (const a of PERIOD_ATTEMPTS) {
    const reply = await ask(dayBookRequest(company, month, a.style, undefined, a));
    const err = tallyError(reply);
    if (err) {
      problems.push(`${a.id}: Tally said "${err}"`);
      continue;
    }
    const dates = voucherDates(reply);
    if (!dates.length) {
      // Vouchers with no readable date cannot be checked against the month; no vouchers at all is an empty month.
      if (voucherBlocks(reply).length) undated ??= reply;
      else empty ??= reply;
      problems.push(`${a.id}: no dated vouchers`);
      continue;
    }
    if (dates.every((d) => d >= from && d <= to)) {
      onAttempt(a);
      return reply;
    }
    sawWrongDates = true;
    problems.push(`${a.id}: vouchers dated ${dates[0]} to ${dates[dates.length - 1]}, outside the month`);
  }
  if (!sawWrongDates && undated) return undated;
  if (!sawWrongDates && empty) return empty;
  throw new Error(`TallyPrime did not return the vouchers of ${month}. ${problems.join("; ")}. Nothing was sent for this month.`);
}

export function dayBookRequest(company, month, style = "dmy", onlyDay, how = { id: "Day Book", typed: false }) {
  const range = monthRange(month);
  const from = onlyDay ?? range.from;
  const to = onlyDay ?? range.to;
  const attr = how.typed ? ' TYPE="Date"' : "";
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>${how.id}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY><SVFROMDATE${attr}>${tallyDate(from, style)}</SVFROMDATE><SVTODATE${attr}>${tallyDate(to, style)}</SVTODATE><EXPLODEFLAG>Yes</EXPLODEFLAG></STATICVARIABLES></DESC></BODY></ENVELOPE>`;
}

/**
 * Safety for writing. Before anything is sent to Tally, the entry FynHelp provided must be exactly ONE new voucher
 * (Receipt, Payment or Contra) for a company that is open and linked: never a ledger or other master, never a change or
 * a deletion, never several vouchers. Returns null when it is fine, otherwise why it is refused.
 */
export function refuseImport(xml, company, linked) {
  const x = String(xml);
  if (!linked.includes(company)) return `"${company}" is not a linked, open company.`;
  // Two shapes of the same request: TallyPrime's own "Import Data" form (1.4.0 and later) and the older "Import / Data / Vouchers" form.
  const modern = /<TALLYREQUEST>\s*Import Data\s*<\/TALLYREQUEST>/i.test(x) && /<REPORTNAME>\s*Vouchers\s*<\/REPORTNAME>/i.test(x);
  const legacy = /<TALLYREQUEST>\s*Import\s*<\/TALLYREQUEST>/i.test(x) && /<ID>\s*Vouchers\s*<\/ID>/i.test(x);
  if (!modern && !legacy) return "This is not a voucher import.";
  if (!new RegExp(`<SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY>`).test(x)) return "The entry names a different company.";
  const vouchers = x.match(/<VOUCHER[\s>]/gi) ?? [];
  if (vouchers.length !== 1) return `Expected exactly one voucher, found ${vouchers.length}.`;
  if (!/<VOUCHER\b[^>]*\bACTION="Create"/i.test(x)) return "A voucher may only be created, never changed.";
  if (/\bACTION="(Alter|Delete|Cancel|Remove)"/i.test(x) || /<(DELETE|CANCEL)\b/i.test(x)) return "Changing or deleting entries is not allowed.";
  if (/<(LEDGER|GROUP|STOCKITEM|STOCKGROUP|COSTCENTRE|COSTCATEGORY|VOUCHERTYPE|UNIT|GODOWN|CURRENCY|COMPANY|EMPLOYEE|PAYHEAD)[\s>]/i.test(x)) return "Creating ledgers or other masters is not allowed.";
  const type = /<VOUCHER\b[^>]*\bVCHTYPE="([^"]*)"/i.exec(x)?.[1] ?? "";
  if (!/^(Receipt|Payment|Contra)$/.test(type)) return `Voucher type "${type}" is not allowed.`;
  if (!/<VOUCHER\b[^>]*\bREMOTEID="[^"]+"/i.test(x)) return "The voucher has no id, so a resend could create a second one.";
  const unsound = voucherProblems(voucherBlocks(x)[0] ?? "");
  if (unsound.length) return `The voucher is not sound: ${unsound[0]}`;
  return null;
}

/**
 * Safety for creating a ledger. The request must be exactly ONE ledger, created and never altered or deleted, with a name and a
 * group, no opening balance, for a company that is open and linked, and nothing else in it. Returns null when it is fine.
 * Mirrors src/lib/practice/tallyLedgerCreate.ts.
 */
export function refuseLedgerImport(xml, company, linked) {
  const x = String(xml);
  if (!linked.includes(company)) return `"${company}" is not a linked, open company.`;
  if (!/<TALLYREQUEST>\s*Import Data\s*<\/TALLYREQUEST>/i.test(x) || !/<REPORTNAME>\s*All Masters\s*<\/REPORTNAME>/i.test(x)) return "This is not a masters import.";
  if (!new RegExp(`<SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY>`).test(x)) return "The request names a different company.";
  const ledgers = x.match(/<LEDGER[\s>]/gi) ?? [];
  if (ledgers.length !== 1) return `Expected exactly one ledger, found ${ledgers.length}.`;
  if (!/<LEDGER\b[^>]*\bACTION="Create"/i.test(x)) return "A ledger may only be created, never changed.";
  if (/\bACTION="(Alter|Delete|Cancel|Remove)"/i.test(x) || /<(DELETE|CANCEL)\b/i.test(x)) return "Changing or deleting is not allowed.";
  if (/<(VOUCHER|GROUP|STOCKITEM|STOCKGROUP|COSTCENTRE|VOUCHERTYPE|UNIT|GODOWN|CURRENCY|COMPANY|EMPLOYEE|PAYHEAD)[\s>]/i.test(x)) return "Only a ledger may be created.";
  if (/<OPENINGBALANCE\b/i.test(x)) return "An opening balance may not be set from FynHelp.";
  const attr = /<LEDGER\b[^>]*\bNAME="([^"]*)"/i.exec(x)?.[1] ?? "";
  const inner = /<NAME\.LIST>\s*<NAME>([^<]*)<\/NAME>/i.exec(x)?.[1] ?? "";
  if (!attr.trim()) return "The ledger has no name.";
  if (attr !== inner) return "The ledger name is not the same in both places.";
  if (!/<PARENT>\s*[^<\s][^<]*<\/PARENT>/i.test(x)) return "The ledger has no group.";
  // Never under a group that needs tax, bank or stock settings.
  const parent = unesc(/<PARENT>([^<]*)<\/PARENT>/i.exec(x)?.[1] ?? "").trim();
  if (/bank|cash|duties|tax|gst|tds|capital|stock|reserve|primary|branch|suspense|profit/i.test(parent)) return `Ledgers under "${parent}" must be created in Tally.`;
  return null;
}

/** The ledger name and group a creation request asks for. */
export function requestedLedger(xml) {
  const x = String(xml);
  return { name: unesc(/<LEDGER\b[^>]*\bNAME="([^"]*)"/i.exec(x)?.[1] ?? "").trim(), parent: unesc(/<PARENT>([^<]*)<\/PARENT>/i.exec(x)?.[1] ?? "").trim() };
}

/** Did Tally really keep the ledger? Reads the company's ledgers back and looks for this name under this group. */
export async function verifyLedgerCreated(ask, company, xml) {
  const want = requestedLedger(xml);
  let reply;
  try {
    reply = await ask(ledgerListRequest(company));
  } catch (e) {
    return { verified: false, note: `Could not read the ledgers back: ${e.message}` };
  }
  const err = tallyError(reply);
  if (err) return { verified: false, note: `Tally said "${err}" when asked to read the ledgers back.` };
  const found = parseLedgers(reply).find((l) => l.name.trim().toLowerCase() === want.name.toLowerCase());
  if (!found) return { verified: false, note: `"${want.name}" is not in the company's ledgers.` };
  if ((found.parent ?? "").trim().toLowerCase() !== want.parent.toLowerCase()) return { verified: false, note: `"${found.name}" is in Tally but under "${found.parent ?? "no group"}", not "${want.parent}".` };
  return { verified: true, note: `"${found.name}" is in Tally under ${found.parent}.` };
}

/* ── is a voucher sound, and did Tally really keep it? (pure; tested against real Tally exports) ── */

const tagText = (block, tag) => {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? unesc(m[1]).trim() : "";
};

const entryBlocks = (block) => [...block.matchAll(/<(ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST\b[^>]*>([\s\S]*?)<\/\1\.LIST>/gi)].map((m) => m[2]);

/**
 * Problems in a voucher: a valid date, at least two entries, each with a ledger and a non-zero amount of at most two decimals whose
 * sign agrees with ISDEEMEDPOSITIVE (Yes = debit = negative), a debit and a credit, and debits equal to credits to the paisa.
 * Mirrors src/lib/practice/tallyVoucher.ts and is held to a real 123 voucher Day Book and 104 voucher import file.
 */
export function voucherProblems(block) {
  const out = [];
  const date = tagText(block, "DATE");
  if (!/^\d{8}$/.test(date) || Number.isNaN(Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`))) out.push("The voucher date is not a valid date.");
  const entries = entryBlocks(block);
  if (entries.length < 2) out.push("A voucher needs at least two ledger entries.");
  let sum = 0;
  let debits = 0;
  let credits = 0;
  for (const e of entries) {
    const name = tagText(e, "LEDGERNAME");
    const amountText = tagText(e, "AMOUNT");
    const deemed = tagText(e, "ISDEEMEDPOSITIVE");
    if (!name) out.push("An entry has no ledger name.");
    if (!/^-?\d+(\.\d{1,2})?$/.test(amountText)) {
      out.push(`The amount "${amountText}" is not a number with at most two decimals.`);
      continue;
    }
    const p = Math.round(Number(amountText) * 100);
    if (p === 0) out.push(`The entry for "${name}" has no amount.`);
    if (deemed !== "Yes" && deemed !== "No") out.push(`The entry for "${name}" does not say whether it is a debit.`);
    else if ((deemed === "Yes") !== p < 0) out.push(`The entry for "${name}" has a sign that does not match its debit or credit.`);
    if (p < 0) debits += -p;
    else credits += p;
    sum += p;
  }
  if (entries.length >= 2 && (debits === 0 || credits === 0)) out.push("A voucher needs a debit and a credit.");
  if (sum !== 0) out.push(`Debits and credits differ by ₹${(Math.abs(sum) / 100).toFixed(2)}.`);
  return out;
}

/** What the entry we sent should look like in Tally: id, type, date and the signed paise per ledger. */
export function expectedVoucher(xml) {
  const block = voucherBlocks(String(xml))[0] ?? "";
  const head = /<VOUCHER\b([^>]*)>/i.exec(block)?.[1] ?? "";
  const attr = (n) => new RegExp(`\\b${n}="([^"]*)"`, "i").exec(head)?.[1] ?? "";
  return { remoteId: unesc(attr("REMOTEID")), type: attr("VCHTYPE"), date: tagText(block, "DATE"), ledgers: ledgerPaise(block) };
}

/** Signed paise per ledger (lower case name), so the same ledger twice in one voucher adds up. */
function ledgerPaise(block) {
  const m = new Map();
  for (const e of entryBlocks(block)) {
    const k = tagText(e, "LEDGERNAME").toLowerCase();
    m.set(k, (m.get(k) ?? 0) + Math.round(Number(tagText(e, "AMOUNT") || "0") * 100));
  }
  return m;
}

const sameLedgers = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

const describe = (m) => [...m].map(([k, v]) => `${k} ${(v / 100).toFixed(2)}`).join(", ");

/**
 * Looks for the voucher we wrote in a reply from Tally. It is found by its id when Tally exports it, and otherwise by its
 * type, date and entries. Found once with the same money on the same ledgers is "verified"; anything else is not:
 * missing, found with different money, or found more than once (a possible duplicate).
 */
export function findWritten(reply, expected) {
  const all = voucherBlocks(String(reply)).map((b) => ({
    id: unesc(/<VOUCHER\b[^>]*\bREMOTEID="([^"]*)"/i.exec(b)?.[1] ?? ""),
    type: (tagText(b, "VOUCHERTYPENAME") || /<VOUCHER\b[^>]*\bVCHTYPE="([^"]*)"/i.exec(b)?.[1] || ""),
    date: tagText(b, "DATE"),
    ledgers: ledgerPaise(b),
  }));
  const byId = expected.remoteId ? all.filter((v) => v.id === expected.remoteId) : [];
  if (byId.length) {
    // Tally's own exports can give two different vouchers the same id (Receipt 15 and Purchase 15 on one day), so an id is narrowed by content.
    const exact = byId.filter((v) => v.type === expected.type && v.date === expected.date && sameLedgers(v.ledgers, expected.ledgers));
    if (exact.length === 1) return { verified: true, note: "Read back from Tally by its id: same type, date, ledgers and amounts." };
    if (exact.length > 1) return { verified: false, note: `Tally has ${exact.length} identical entries with this id: a possible duplicate. Check Tally.` };
    if (byId.length === 1) {
      const v = byId[0];
      if (v.type !== expected.type || v.date !== expected.date) return { verified: false, note: `Tally kept it as ${v.type} dated ${v.date}, not ${expected.type} dated ${expected.date}.` };
      return { verified: false, note: `Tally kept different money: ${describe(v.ledgers)} instead of ${describe(expected.ledgers)}.` };
    }
    return { verified: false, note: `Tally has ${byId.length} entries with this id and none holds the money we sent.` };
  }
  const same = all.filter((v) => v.type === expected.type && v.date === expected.date && sameLedgers(v.ledgers, expected.ledgers));
  if (same.length > 1) return { verified: false, note: `Tally has ${same.length} identical entries on that date. Check Tally for a duplicate.` };
  if (same.length === 1) return { verified: true, note: "Read back from Tally by its type, date and amounts (Tally did not export the id)." };
  return { verified: false, note: "Tally said it created the entry, but it could not be found when read back." };
}

/**
 * Asks Tally for the day of the entry, the same careful ways the sync does, and checks what came back.
 * Anything that cannot be read back is reported as not verified, never as fine.
 */
export async function verifyWritten(ask, company, xml) {
  const expected = expectedVoucher(xml);
  if (!/^\d{8}$/.test(expected.date)) return { verified: false, note: "The entry has no valid date to read back." };
  const month = `${expected.date.slice(0, 4)}-${expected.date.slice(4, 6)}`;
  let last = { verified: false, note: "Tally could not be asked to read the entry back." };
  for (const a of PERIOD_ATTEMPTS) {
    let reply;
    try {
      reply = await ask(dayBookRequest(company, month, a.style, expected.date, a));
    } catch (e) {
      last = { verified: false, note: `Could not read the entry back: ${e.message}` };
      continue;
    }
    if (tallyError(reply)) {
      last = { verified: false, note: `Tally said "${tallyError(reply)}" when asked to read the entry back.` };
      continue;
    }
    const r = findWritten(reply, expected);
    if (r.verified || /not be found/.test(r.note) === false) return r;
    last = r;
  }
  return last;
}

export function ledgerListRequest(company) {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>FynHelpLedgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="FynHelpLedgers" ISMODIFY="No"><TYPE>Ledger</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>Parent</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}

/** Ledger names and groups from Tally's Ledger collection reply. */
export function parseLedgers(xml) {
  const out = new Map();
  for (const m of xml.matchAll(/<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/gi)) {
    const attr = /\bNAME="([^"]+)"/i.exec(m[1]);
    const tag = /<NAME[^>]*>([^<]+)<\/NAME>/i.exec(m[2]);
    const name = unesc((attr?.[1] ?? tag?.[1] ?? "")).trim();
    const parent = /<PARENT[^>]*>([^<]+)<\/PARENT>/i.exec(m[2]);
    if (name) out.set(name, parent ? unesc(parent[1]).trim() : null);
  }
  return [...out].map(([name, parent]) => ({ name, parent }));
}

/** Company names from Tally's Company collection reply. */
export function parseCompanies(xml) {
  const names = new Set();
  for (const m of xml.matchAll(/<COMPANY\b[^>]*\bNAME="([^"]+)"/gi)) names.add(unesc(m[1]).trim());
  if (!names.size) {
    for (const m of xml.matchAll(/<COMPANY\b[^>]*>([\s\S]*?)<\/COMPANY>/gi)) {
      const n = /<NAME[^>]*>([^<]+)<\/NAME>/i.exec(m[1]);
      if (n) names.add(unesc(n[1]).trim());
    }
  }
  return [...names].filter(Boolean);
}

/** Tally reports problems inside a normal reply. Returns the message, or null when the reply looks fine. */
export function tallyError(xml) {
  const line = /<LINEERROR>([^<]*)<\/LINEERROR>/i.exec(xml);
  if (line) return unesc(line[1]).trim();
  const resp = /<RESPONSE>([^<]*)<\/RESPONSE>/i.exec(xml);
  if (resp && /unknown request|cannot be processed|could not|not found|error/i.test(resp[1])) return unesc(resp[1]).trim();
  return null;
}

/* ── talking to Tally and FynHelp ───────────────────────────── */

async function askTally(tallyUrl, body, timeoutMs) {
  const res = await fetch(tallyUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Tally answered ${res.status}`);
  return sanitizeTallyXml(decodeTally(await res.arrayBuffer()));
}

const FYNHELP_HOSTS = new Set(["fynhelp.com", "www.fynhelp.com"]);

async function fynhelp(cfg, path, init) {
  let url = `${cfg.server}${path}`;
  let res;
  // A redirect between FynHelp's own two addresses is followed with the same method, body and token. Any other redirect is
  // refused, so the token can never be sent to another site.
  for (let hop = 0; ; hop++) {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10 * 60_000),
      redirect: "manual",
    });
    if (!(res.status >= 300 && res.status < 400)) break;
    const next = new URL(res.headers.get("location") ?? "", url);
    if (hop >= 2 || next.protocol !== "https:" || !FYNHELP_HOSTS.has(next.hostname))
      throw new Error(`FynHelp redirected this request to ${next.href}. Set "server" in fynhelp-connector.json to https://www.fynhelp.com`);
    url = next.href;
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new Error(json?.error ?? `FynHelp answered ${res.status}`);
  return json;
}

const log = (...a) => console.log(new Date().toISOString().replace("T", " ").slice(0, 19), ...a);

/** "https://fynhelp.com" works too: it is changed to the www address, which is the real one. */
export function normaliseServer(value) {
  const v = String(value ?? "https://www.fynhelp.com").trim().replace(/\/+$/, "");
  try {
    const u = new URL(v);
    if (u.hostname === "fynhelp.com") u.hostname = "www.fynhelp.com";
    return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, ""));
  } catch {
    return v;
  }
}

/** The folder this file is in. When packaged as a program there is no such address, so fall back to the program's folder. */
function thisFolder() {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return dirname(process.execPath);
  }
}

export function loadConfig(argv, cwd = process.cwd(), here = thisFolder()) {
  const i = argv.indexOf("--config");
  const candidates = i >= 0 && argv[i + 1] ? [resolve(argv[i + 1])] : [join(cwd, "fynhelp-connector.json"), join(here, "fynhelp-connector.json")];
  const file = candidates.find((f) => existsSync(f));
  if (!file) throw new Error(`Create fynhelp-connector.json with your token. Looked in: ${candidates.join(", ")}`);
  // Windows tools may save the file with a byte-order mark; JSON.parse refuses it.
  const raw = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  if (!/^fyn_tc_[A-Za-z0-9_-]{40,60}$/.test(raw.token ?? "")) throw new Error("The token in the config file is missing or wrong. Copy it again from FynHelp, Settings, TallyPrime.");
  return {
    token: raw.token,
    server: normaliseServer(raw.server),
    tallyUrl: String(raw.tallyUrl ?? "http://localhost:9000"),
    checkMinutes: Math.max(1, Number(raw.checkMinutes) || 2),
    // Writing into Tally is OFF unless the person at this PC turns it on with "allowWrite": true.
    allowWrite: raw.allowWrite === true,
  };
}

async function readCompanies(cfg) {
  const xml = await askTally(cfg.tallyUrl, companyListRequest(), 30_000);
  const err = tallyError(xml);
  if (err) throw new Error(`Tally said: ${err}`);
  return parseCompanies(xml);
}

/** Sends each company's ledger names so FynHelp can only ever point at a ledger that exists. */
async function sendLedgers(cfg, name) {
  const xml = await askTally(cfg.tallyUrl, ledgerListRequest(name), 60_000);
  const err = tallyError(xml);
  if (err) throw new Error(`Tally said: ${err}`);
  const ledgers = parseLedgers(xml);
  if (!ledgers.length) return;
  await fynhelp(cfg, "/api/public/tally-ledgers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: name, ledgers }) });
  log(`✓ ${name}: ${ledgers.length} ledgers sent`);
}

/** Writes lines a person approved in FynHelp. One at a time; every answer is reported back. Off unless allowWrite is true. */
async function writeApproved(cfg, companies, linked) {
  if (!cfg.allowWrite) return;
  const { postings, ledgers } = await fynhelp(cfg, "/api/public/tally-outbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const report = (body) => fynhelp(cfg, "/api/public/tally-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // Ledgers first, so an entry waiting on a new ledger finds it in the same round.
  for (const p of ledgers ?? []) {
    if (!companies.includes(p.company)) {
      await report({ kind: "ledger", id: p.id, error: `Company "${p.company}" is not open in Tally.` });
      continue;
    }
    const refused = refuseLedgerImport(p.xml, p.company, linked);
    if (refused) {
      log(`✗ refused to create ledger ${p.id.slice(0, 8)}: ${refused}`);
      await report({ kind: "ledger", id: p.id, error: `The connector refused this ledger: ${refused}` });
      continue;
    }
    let body;
    try {
      const reply = await askTally(cfg.tallyUrl, p.xml, 60_000);
      body = { kind: "ledger", id: p.id, reply };
      log(`→ asked Tally to create the ledger "${requestedLedger(p.xml).name}" in ${p.company}`);
      if (/<CREATED>\s*1\s*<\/CREATED>/i.test(reply) && !tallyError(reply)) {
        const check = await verifyLedgerCreated((b) => askTally(cfg.tallyUrl, b, 60_000), p.company, p.xml);
        body.verified = check.verified;
        body.verifyNote = check.note;
        log(check.verified ? `  ✓ read back from Tally: ${check.note}` : `  ✗ NOT verified: ${check.note}`);
      }
    } catch (e) {
      body = { kind: "ledger", id: p.id, error: e.message };
      log(`✗ could not create ledger ${p.id.slice(0, 8)}: ${e.message}`);
    }
    await report(body);
    try {
      await sendLedgers(cfg, p.company);
    } catch (e) {
      log(`✗ ${p.company} ledgers: ${e.message}`);
    }
  }
  for (const p of postings ?? []) {
    if (!companies.includes(p.company)) {
      await fynhelp(cfg, "/api/public/tally-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, error: `Company "${p.company}" is not open in Tally.` }) });
      continue;
    }
    const refused = refuseImport(p.xml, p.company, linked);
    if (refused) {
      log(`✗ refused to write ${p.id.slice(0, 8)}: ${refused}`);
      await fynhelp(cfg, "/api/public/tally-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, error: `The connector refused this entry: ${refused}` }) });
      continue;
    }
    let body;
    try {
      const reply = await askTally(cfg.tallyUrl, p.xml, 60_000);
      body = { id: p.id, reply };
      log(`→ wrote approved entry ${p.id.slice(0, 8)} to ${p.company}`);
      // Tally says created: read the voucher back and check it holds the same money on the same ledgers before it counts as done.
      if (/<CREATED>\s*1\s*<\/CREATED>/i.test(reply) && !tallyError(reply)) {
        const check = await verifyWritten((b) => askTally(cfg.tallyUrl, b, 60_000), p.company, p.xml);
        body.verified = check.verified;
        body.verifyNote = check.note;
        log(check.verified ? `  ✓ read back from Tally: ${check.note}` : `  ✗ NOT verified: ${check.note}`);
      }
    } catch (e) {
      body = { id: p.id, error: e.message };
      log(`✗ could not write ${p.id.slice(0, 8)}: ${e.message}`);
    }
    await fynhelp(cfg, "/api/public/tally-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
}

/** One check-in, and a full sync when it is due or a person asked for one. */
async function round(cfg, state, forceSync) {
  let companies = [];
  let tallyProblem = null;
  try {
    companies = await readCompanies(cfg);
    if (!companies.length) tallyProblem = "TallyPrime answered but listed no companies. In Tally, check that Client/Server is set to Both on port 9000, and that a company is loaded (Alt+F3 to select one). Then run the connector again.";
  } catch (e) {
    tallyProblem = `Cannot reach TallyPrime at ${cfg.tallyUrl}. Is it open, with Client/Server set to Both on port 9000? (${e.message})`;
  }
  const reply = await fynhelp(cfg, "/api/public/tally-hello", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: VERSION, host: hostname(), companies, error: tallyProblem }),
  });
  if (tallyProblem) {
    log("!", tallyProblem);
    return;
  }
  try {
    await writeApproved(cfg, companies, reply.companies.filter((c) => c.mapped).map((c) => c.name).filter((n) => companies.includes(n)));
  } catch (e) {
    log(`✗ writing approved entries: ${e.message}`);
  }
  const due = !state.lastFull || Date.now() - state.lastFull >= (reply.intervalMinutes ?? 60) * 60_000;
  if (!(forceSync || reply.syncNow || due)) return;

  let sent = 0;
  for (const co of reply.companies) {
    if (!co.mapped) {
      log(`- ${co.name}: not linked to a client in FynHelp yet, skipped`);
      continue;
    }
    if (!companies.includes(co.name)) continue;
    try {
      await sendLedgers(cfg, co.name);
    } catch (e) {
      log(`✗ ${co.name} ledgers: ${e.message}`);
    }
    for (const month of co.months) {
      try {
        const xml = await fetchDayBook((body) => askTally(cfg.tallyUrl, body, 10 * 60_000), co.name, month, (a) => log(`  ${co.name} ${month}: period honoured by Tally via "${a.id}" (${a.style})`));
        const err = tallyError(xml);
        if (err) throw new Error(`Tally said: ${err}`);
        const r = await fynhelp(cfg, `/api/public/tally-ledger?company=${encodeURIComponent(co.name)}&month=${month}`, {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: xml,
        });
        log(`✓ ${co.name} ${month}: ${r.note}`);
        sent++;
      } catch (e) {
        log(`✗ ${co.name} ${month}: ${e.message}`);
      }
    }
  }
  state.lastFull = Date.now();
  log(`Sync finished: ${sent} month${sent === 1 ? "" : "s"} sent.`);
}

export async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--version")) {
    console.log(VERSION);
    return;
  }
  let cfg;
  try {
    cfg = loadConfig(argv);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
    return;
  }
  log(`FynHelp Connector ${VERSION} · Tally ${cfg.tallyUrl} · FynHelp ${cfg.server}`);

  if (argv.includes("--check")) {
    try {
      const names = await readCompanies(cfg);
      log(`✓ TallyPrime reachable. Companies open: ${names.length ? names.join(", ") : "none"}`);
    } catch (e) {
      log(`✗ TallyPrime: ${e.message}`);
    }
    try {
      const r = await fynhelp(cfg, "/api/public/tally-hello", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: VERSION, host: hostname(), companies: [] }) });
      log(`✓ FynHelp accepted the token. Linked companies: ${r.companies.filter((c) => c.mapped).length}`);
    } catch (e) {
      log(`✗ FynHelp: ${e.message}`);
      // Let the process end by itself: calling exit while requests are still closing makes Node print a scary message on Windows.
      process.exitCode = 1;
      return;
    }
    return;
  }

  const state = { lastFull: 0 };
  let first = true;
  const tick = async () => {
    try {
      await round(cfg, state, first && argv.includes("--once"));
    } catch (e) {
      log(`✗ ${e.message}`);
    }
    first = false;
  };
  await tick();
  if (argv.includes("--once")) return;
  log(`Running. Checking in every ${cfg.checkMinutes} minutes. Press Ctrl+C to stop.`);
  setInterval(tick, cfg.checkMinutes * 60_000);
}

// Run when started directly (node fynhelp-tally-connector.mjs). The packaged program calls main() from its own entry file.
let startedDirectly = false;
try {
  startedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
} catch {
  startedDirectly = false;
}
if (startedDirectly) void main();
