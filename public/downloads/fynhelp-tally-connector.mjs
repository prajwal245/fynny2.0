#!/usr/bin/env node
/**
 * FynHelp Connector for TallyPrime (version 1.0.0)
 *
 * Runs on the PC where TallyPrime is open. It asks Tally (on this PC) for each linked company's
 * Day Book and sends it to FynHelp over HTTPS. It only makes outbound connections, never opens a
 * port to the internet, and only reads from Tally: it never changes anything in Tally.
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
 *     http://localhost:9000), "checkMinutes" (default 2).
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

export const VERSION = "1.0.0";

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

export function dayBookRequest(company, month) {
  const { from, to } = monthRange(month);
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>Day Book</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY><SVFROMDATE>${from}</SVFROMDATE><SVTODATE>${to}</SVTODATE><EXPLODEFLAG>Yes</EXPLODEFLAG></STATICVARIABLES></DESC></BODY></ENVELOPE>`;
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
  });
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

export function loadConfig(argv, cwd = process.cwd(), here = dirname(fileURLToPath(import.meta.url))) {
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
  };
}

async function readCompanies(cfg) {
  const xml = await askTally(cfg.tallyUrl, companyListRequest(), 30_000);
  const err = tallyError(xml);
  if (err) throw new Error(`Tally said: ${err}`);
  return parseCompanies(xml);
}

/** One check-in, and a full sync when it is due or a person asked for one. */
async function round(cfg, state, forceSync) {
  let companies = [];
  let tallyProblem = null;
  try {
    companies = await readCompanies(cfg);
    if (!companies.length) tallyProblem = "TallyPrime is reachable but no company is open. Open the company in Tally.";
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
  const due = !state.lastFull || Date.now() - state.lastFull >= (reply.intervalMinutes ?? 60) * 60_000;
  if (!(forceSync || reply.syncNow || due)) return;

  let sent = 0;
  for (const co of reply.companies) {
    if (!co.mapped) {
      log(`- ${co.name}: not linked to a client in FynHelp yet, skipped`);
      continue;
    }
    if (!companies.includes(co.name)) continue;
    for (const month of co.months) {
      try {
        const xml = await askTally(cfg.tallyUrl, dayBookRequest(co.name, month), 10 * 60_000);
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

async function main() {
  const argv = process.argv.slice(2);
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
