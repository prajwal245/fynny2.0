#!/usr/bin/env node
// FynHelp Tally agent. Reads Tally Prime on this PC (localhost) and sends
// ledger balances to FynHelp over HTTPS. Read-only: it never writes to Tally,
// and nothing connects in to this PC.
//
//   node agent.mjs pair FYN-XXXX-XXXX     once, with the code from FynHelp
//   node agent.mjs sync [--backfill]      read Tally and send (the scheduled task runs this)
//   node agent.mjs status                 check Tally and FynHelp are reachable
//
// Needs Node 18+. Tally must be open with "Enable ODBC / allow XML on port 9000"
// (F1 > Settings > Connectivity > Client/Server configuration).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import {
  AGENT_VERSION, companiesRequest, groupsRequest, ledgersRequest, parseCompanies, parseGroups, parseLedgers, snapshotDates, tallyError,
} from "./lib.mjs";

const DIR = process.env.FYNHELP_HOME ?? join(process.env.APPDATA ?? join(homedir(), ".config"), "FynHelpTally");
const CONFIG = join(DIR, "config.json");
const SERVER = (process.env.FYNHELP_URL ?? "https://www.fynhelp.com").replace(/\/+$/, "");
const ENDPOINT = `${SERVER}/api/integrations/tally/agent`;

const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);
const fail = (msg, code = 1) => { console.error(`\n  ${msg}\n`); process.exit(code); };

async function loadConfig() {
  try { return JSON.parse(await readFile(CONFIG, "utf8")); } catch { return null; }
}
async function saveConfig(c) {
  await mkdir(DIR, { recursive: true });
  await writeFile(CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
}

async function tally(cfg, xml) {
  let res;
  try {
    res = await fetch(cfg.tallyUrl, { method: "POST", headers: { "content-type": "text/xml" }, body: xml, signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new Error(`Cannot reach Tally at ${cfg.tallyUrl}. Open Tally Prime and switch on XML access (F1 > Settings > Connectivity).`);
  }
  const text = await res.text();
  const err = tallyError(text);
  if (err) throw new Error(`Tally said: ${err}`);
  return text;
}

async function send(cfg, body, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg?.token ? { authorization: `Bearer ${cfg.token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      if (res.status === 401) throw Object.assign(new Error(json.error ?? "FynHelp no longer accepts this agent. Pair it again."), { fatal: true });
      if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(json.error ?? `FynHelp refused the request (${res.status}).`), { fatal: true });
    } catch (e) {
      if (e.fatal) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
  throw new Error("Could not reach FynHelp. Check the internet connection; the next run will try again.");
}

async function pair(code) {
  if (!code) fail("Usage: node agent.mjs pair FYN-XXXX-XXXX   (get the code in FynHelp > Settings > Tally Prime)");
  const cfg = { tallyUrl: process.env.TALLY_URL ?? "http://localhost:9000" };
  let tallyVersion;
  try { tallyVersion = (await (await fetch(cfg.tallyUrl, { signal: AbortSignal.timeout(5000) })).text()).replace(/<[^>]+>/g, " ").trim().slice(0, 80); } catch { /* shown by status */ }
  const r = await send(null, { kind: "pair", code, label: hostname(), agentVersion: AGENT_VERSION, tallyVersion }, 1).catch((e) => fail(e.message));
  await saveConfig({ ...cfg, token: r.token, pairedAt: new Date().toISOString() });
  log("Paired. This PC is now connected to your CA's FynHelp. Run: node agent.mjs sync");
}

async function status() {
  const cfg = await loadConfig();
  if (!cfg) fail("Not paired yet. Run: node agent.mjs pair FYN-XXXX-XXXX");
  try {
    const companies = parseCompanies(await tally(cfg, companiesRequest()));
    log(`Tally is reachable. Companies open: ${companies.map((c) => c.name).join(", ") || "none (open a company in Tally)"}`);
  } catch (e) { log("Tally:", e.message); }
  try { await send(cfg, { kind: "companies", companies: [], agentVersion: AGENT_VERSION }, 1); log("FynHelp is reachable and accepts this agent."); } catch (e) { log("FynHelp:", e.message); }
}

async function sync({ backfill }) {
  const cfg = await loadConfig();
  if (!cfg) fail("Not paired yet. Run: node agent.mjs pair FYN-XXXX-XXXX");
  const only = (cfg.companies ?? null); // optional allow-list in config.json
  const companies = parseCompanies(await tally(cfg, companiesRequest())).filter((c) => !only || only.includes(c.name));
  if (!companies.length) fail("No company is open in Tally. Open the client's company and run again.");
  await send(cfg, { kind: "companies", companies, agentVersion: AGENT_VERSION });
  const today = new Date().toISOString().slice(0, 10);
  const { fyStart, dates } = snapshotDates(today, { backfill: backfill || !cfg.lastBackfill });
  let sent = 0;
  for (const c of companies) {
    for (const asOn of dates) {
      try {
        const groups = parseGroups(await tally(cfg, groupsRequest(c.name, fyStart, asOn)));
        const ledgers = parseLedgers(await tally(cfg, ledgersRequest(c.name, fyStart, asOn)));
        if (!ledgers.length) { log(`${c.name} as on ${asOn}: Tally returned no ledgers, skipped.`); continue; }
        const r = await send(cfg, { kind: "snapshot", company: c.name, fyStart, asOn, groups, ledgers, agentVersion: AGENT_VERSION });
        log(`${c.name} as on ${asOn}: ${r.status}${r.note ? ` (${r.note})` : ""}`);
        sent++;
      } catch (e) {
        log(`${c.name} as on ${asOn}: ${e.message}`);
        if (e.fatal) process.exit(2);
      }
    }
  }
  if (sent) await saveConfig({ ...cfg, lastBackfill: cfg.lastBackfill ?? new Date().toISOString(), lastSync: new Date().toISOString() });
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "pair") await pair(rest[0]);
  else if (cmd === "sync") await sync({ backfill: rest.includes("--backfill") });
  else if (cmd === "status") await status();
  else fail("Commands: pair <code> | sync [--backfill] | status");
} catch (e) {
  fail(e.message);
}
