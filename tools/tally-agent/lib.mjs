// Pure helpers for the FynHelp Tally agent: build Tally XML requests, read
// the replies, and work out which dates to snapshot. No network, no files.

export const AGENT_VERSION = "0.1.0";

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#13;": "", "&#10;": " " };
export const xmlText = (s) =>
  String(s ?? "")
    .replace(/&(amp|lt|gt|quot|apos|#13|#10);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tally dates are YYYYMMDD. */
export const tallyDate = (iso) => iso.replaceAll("-", "");

/**
 * A Tally amount as a number in Tally's own sign: a debit is negative.
 * Plain exports give "-1500.00"; some versions write "1500.00 Dr" / "Cr".
 */
export function tallyAmount(text) {
  const t = xmlText(text).replace(/,/g, "");
  if (!t) return 0;
  const m = /^(-?\d+(?:\.\d+)?)\s*(Dr|Cr)?$/i.exec(t);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!m[2]) return n;
  return m[2].toLowerCase() === "dr" ? -Math.abs(n) : Math.abs(n);
}

/** Export request for a Tally collection, in the period and company given. */
export function collectionRequest({ id, type, fields, company, from, to }) {
  const vars = [
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
    company ? `<SVCURRENTCOMPANY>${xmlEsc(company)}</SVCURRENTCOMPANY>` : "",
    from ? `<SVFROMDATE TYPE="Date">${tallyDate(from)}</SVFROMDATE>` : "",
    to ? `<SVTODATE TYPE="Date">${tallyDate(to)}</SVTODATE>` : "",
  ].join("");
  const natives = fields.map((f) => `<NATIVEMETHOD>${f}</NATIVEMETHOD>`).join("");
  return (
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${id}</ID></HEADER>` +
    `<BODY><DESC><STATICVARIABLES>${vars}</STATICVARIABLES>` +
    `<TDL><TDLMESSAGE><COLLECTION NAME="${id}" ISMODIFY="No"><TYPE>${type}</TYPE>${natives}</COLLECTION></TDLMESSAGE></TDL>` +
    `</DESC></BODY></ENVELOPE>`
  );
}

export const companiesRequest = () => collectionRequest({ id: "FHCompanies", type: "Company", fields: ["Name"] });
export const groupsRequest = (company, from, to) => collectionRequest({ id: "FHGroups", type: "Group", fields: ["Name", "Parent"], company, from, to });
export const ledgersRequest = (company, from, to) =>
  collectionRequest({ id: "FHLedgers", type: "Ledger", fields: ["Name", "Parent", "OpeningBalance", "ClosingBalance"], company, from, to });

/** Elements named `tag`, each as { name (attribute), fields: {FIELD: text} }. */
export function parseCollection(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, "gi");
  for (const m of String(xml).matchAll(re)) {
    const name = /\bNAME="([^"]*)"/i.exec(m[1])?.[1];
    const fields = {};
    for (const f of (m[2] ?? "").matchAll(/<([A-Z][A-Z0-9.]*)\b[^>]*>([^<]*)<\/\1>/gi)) fields[f[1].toUpperCase()] = f[2];
    // Newer Tally writes the name as a child element too; the attribute wins.
    const nm = name !== undefined ? xmlText(name) : xmlText(fields.NAME ?? "");
    if (nm) out.push({ name: nm, fields });
  }
  return out;
}

export const parseCompanies = (xml) => parseCollection(xml, "COMPANY").map((c) => ({ name: c.name }));
export const parseGroups = (xml) => parseCollection(xml, "GROUP").map((g) => ({ name: g.name, parent: xmlText(g.fields.PARENT ?? "") }));
export const parseLedgers = (xml) =>
  parseCollection(xml, "LEDGER").map((l) => ({
    name: l.name,
    parent: xmlText(l.fields.PARENT ?? ""),
    opening: tallyAmount(l.fields.OPENINGBALANCE),
    closing: tallyAmount(l.fields.CLOSINGBALANCE),
  }));

/** Tally answers errors with a LINEERROR or RESPONSE text instead of data. */
export const tallyError = (xml) => /<LINEERROR>([\s\S]*?)<\/LINEERROR>/i.exec(xml)?.[1]?.trim() ?? null;

/** April to March. */
export function fyStartOf(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Dates to snapshot. Normal run: today, plus the last closed month end so a
 * backdated entry still lands. Backfill: every month end of the year so far.
 */
export function snapshotDates(today, { backfill = false } = {}) {
  const fy = fyStartOf(today);
  const ends = [];
  let y = Number(fy.slice(0, 4));
  let m = 4;
  for (let i = 0; i < 12; i++) {
    const e = iso(y, m, lastDay(y, m));
    if (e < today) ends.push(e);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  const dates = backfill ? ends : ends.slice(-1);
  return { fyStart: fy, dates: [...dates, today] };
}
