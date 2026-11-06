#!/usr/bin/env node
/**
 * FynHelp Connector for TallyPrime (version 1.2.0)
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

export const VERSION = "1.2.0";

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
 * Tally can answer a Day Book request for only the first day when it does not like the date format.
 * So: ask with Tally's own format; if the answer covers a single day of a longer period, ask again with the other format;
 * if it still does, ask one day at a time and join the answers. The caller always gets the whole period.
 */
export async function fetchDayBook(ask, company, month) {
  const days = daysOfMonth(month);
  const first = await ask(dayBookRequest(company, month, "dmy"));
  if (voucherDates(first).length !== 1 || days.length < 2) return first;
  const second = await ask(dayBookRequest(company, month, "ymd"));
  if (voucherDates(second).length > 1) return second;
  const replies = [];
  for (const d of days) replies.push(await ask(dayBookRequest(company, month, "ymd", d)));
  const merged = mergeDayBooks(replies);
  return voucherBlocks(merged).length ? merged : first;
}

export function dayBookRequest(company, month, style = "dmy", onlyDay) {
  const range = monthRange(month);
  const from = onlyDay ?? range.from;
  const to = onlyDay ?? range.to;
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>Day Book</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY><SVFROMDATE>${tallyDate(from, style)}</SVFROMDATE><SVTODATE>${tallyDate(to, style)}</SVTODATE><EXPLODEFLAG>Yes</EXPLODEFLAG></STATICVARIABLES></DESC></BODY></ENVELOPE>`;
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

async function fynhelp(cfg, path, init) {
  const res = await fetch(`${cfg.server}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10 * 60_000),
    // A redirect would drop the token and turn the request into a GET: say so instead of failing mysteriously.
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400)
    throw new Error(`FynHelp redirected this request to ${res.headers.get("location") ?? "another address"}. Set "server" in fynhelp-connector.json to https://www.fynhelp.com`);
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
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (!/^fyn_tc_[A-Za-z0-9_-]{40,60}$/.test(raw.token ?? "")) throw new Error("The token in the config file is missing or wrong. Copy it again from FynHelp, Settings, TallyPrime.");
  return {
    token: raw.token,
    server: String(raw.server ?? "https://www.fynhelp.com").replace(/\/+$/, ""),
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
async function writeApproved(cfg, companies) {
  if (!cfg.allowWrite) return;
  const { postings } = await fynhelp(cfg, "/api/public/tally-outbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  for (const p of postings ?? []) {
    if (!companies.includes(p.company)) {
      await fynhelp(cfg, "/api/public/tally-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, error: `Company "${p.company}" is not open in Tally.` }) });
      continue;
    }
    let body;
    try {
      const reply = await askTally(cfg.tallyUrl, p.xml, 60_000);
      body = { id: p.id, reply };
      log(`→ wrote approved entry ${p.id.slice(0, 8)} to ${p.company}`);
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
    await writeApproved(cfg, companies);
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
        const xml = await fetchDayBook((body) => askTally(cfg.tallyUrl, body, 10 * 60_000), co.name, month);
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
    process.exit(2);
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
      process.exit(1);
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
