#!/usr/bin/env node
/**
 * Builds the product architecture pack for a CA advisor: one self-contained HTML file, encrypted with a password (AES-256-GCM, key from
 * PBKDF2-SHA256, 600,000 rounds). The file holds the encrypted pack and a small page that asks for the password and decrypts it in the
 * browser. Without the password the content is not readable. No client data and no secrets go into it: only the product's structure.
 *
 *   PACK_PASSWORD='your password' node scripts/build-architecture-pack.mjs      (a random one is made and printed if not set)
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { webcrypto, randomBytes } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = (d, out = []) => {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
};
const lines = (p) => readFileSync(p, "utf8").split("\n").length;

/* ── 1. size of each area of the product, from the code itself ───────────────────────────────── */
const AREAS = [
  { id: "read", name: "Reading documents", layer: "engine", re: /lib\/practice\/(extract\/|files\.server|ocr\.server|llm\.server|documents\.server|statementVerification|passwordFile|filePasswords|aiBilled|aiPricing)/, what: "Turns any statement, register or scan into lines the code can prove. Rules first, then column positions, then AI; accepted only when the running balance and the bank's printed totals tie." },
  { id: "recon", name: "Reconciliation", layer: "engine", re: /lib\/practice\/(recon\/|recon\.server|reconScope|tallyRecon)|v2\/components\/(ReconGuide|MatchDrawer)/, what: "Matches bank lines to books by account, in stages from certain to fuzzy. Own-account transfers, reversals and contra legs are set aside with their evidence." },
  { id: "exc", name: "Exceptions and review", layer: "people", re: /lib\/practice\/(exception|narrate)|v2\/(pages\/(Exceptions|Review)|components\/(Exception|Review))|lib\/v2\/exceptions/, what: "What is left for a person: owners, states, history, senior review. A bank line and its book twin count as one decision." },
  { id: "close", name: "Month-end close", layer: "people", re: /lib\/practice\/close\/|v2\/(pages\/Close|components\/Close)/, what: "A ten-step checklist. Steps that can be proved tick by themselves; the rest are ticked by a person with the right role; the partner signs off last." },
  { id: "gst", name: "GST, audit and ageing checks", layer: "engine", re: /lib\/practice\/(gst\/|gstTally|audited|ageing)|v2\/(pages\/Gst|components\/(GstReturns|OpeningBalance))/, what: "GSTR-2B against purchases; sales against GSTR-1; GSTR-1 against 3B; ITC available against claimed; reverse charge; opening balances against the signed audit; ageing engine." },
  { id: "conn", name: "Tally and Zoho connectors", layer: "outside", re: /lib\/practice\/(tally|zoho)|routes\/api\/public\/tally-|v2\/components\/(Tally|Books)/, what: "Reads the books from Tally (a small program on the firm's PC) and Zoho Books. Writes back only what a partner approved, one attempt each." },
  { id: "intake", name: "Getting documents in", layer: "outside", re: /lib\/practice\/(gmail|whatsapp|uploadLinks|email|signupOtp)|routes\/(u\.|api\/public\/(whatsapp|upload-link|ca-poll-gmail))|v2\/components\/(Intake|Whatsapp|Gmail)/, what: "Upload, Gmail, WhatsApp and a no-login upload link (password-protected files are asked for, then kept encrypted)." },
  { id: "chaser", name: "Chaser (reminders)", layer: "outside", re: /lib\/practice\/(chaser|chaseContact|touchpoints|lifecycle)|v2\/(pages\/Chaser|components\/Chaser)/, what: "Asks clients for missing documents by WhatsApp or email, within a daily cap, a daytime window and consent. Stops when the file arrives." },
  { id: "mis", name: "MIS and reports", layer: "people", re: /lib\/practice\/(reports|reportRules|value)|v2\/(pages\/Report|components\/Value|components\/Portfolio)/, what: "Monthly reports from proven figures, the value card (percent matched, decisions left, hours saved with its assumption)." },
  { id: "billing", name: "Plans, credits and billing", layer: "platform", re: /lib\/practice\/billing|v2\/components\/(Billing|Credits|Trial)|razorpay/i, what: "Trials, plans, page credits for AI reading, invoices." },
  { id: "admin", name: "Admin and system health", layer: "platform", re: /lib\/admin|pages\/admin/, what: "For the FynHelp team only: AI reader status, failures, WhatsApp faults, firm health. Firms see plain messages; technical reasons stay here." },
  { id: "platform", name: "Platform and screens", layer: "platform", re: /./, what: "Sign-in, firms and roles, the workspace screens, the job scheduler, the database layer." },
];
const ROOTS = ["src/lib/practice", "src/v2", "src/routes", "src/lib/v2", "src/lib/admin", "src/pages/admin"].map((r) => join(ROOT, r));
const files = ROOTS.flatMap((r) => { try { return walk(r); } catch { return []; } });
const area = Object.fromEntries(AREAS.map((a) => [a.id, { ...a, lines: 0, files: 0 }]));
for (const f of files) {
  const rel = relative(ROOT, f).replace("src/", "");
  const a = AREAS.find((x) => x.id !== "platform" && x.re.test(rel)) ?? AREAS[AREAS.length - 1];
  area[a.id].lines += lines(f);
  area[a.id].files += 1;
}
const testFiles = walk(join(ROOT, "tests"));
const testLines = testFiles.reduce((n, f) => n + lines(f), 0);
const migrations = readdirSync(join(ROOT, "supabase/migrations")).length;
const treemap = Object.values(area).map((a) => ({ id: a.id, name: a.name, layer: a.layer, lines: a.lines, files: a.files, what: a.what }));
const stats = { generated: new Date().toISOString().slice(0, 10), codeFiles: files.length, codeLines: treemap.reduce((n, a) => n + a.lines, 0), testFiles: testFiles.length, testLines, migrations };

/* ── 2. the pack ─────────────────────────────────────────────────────────────────────────────── */
const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FynHelp product architecture</title>
<style>
:root{--bg:#f7f8fa;--card:#fff;--ink:#111318;--body:#4b5563;--muted:#8c93a0;--line:#eaecef;--brand:#d92b2b;--g:#15803d;--gbg:#dcfce7;--a:#b45309;--abg:#fef3c7;--b:#4338ca;--bbg:#eef2ff;--r:#b91c1c;--rbg:#fee2e2}
@media(prefers-color-scheme:dark){:root{--bg:#141210;--card:#1c1a17;--ink:#faf7f2;--body:#c9c4bb;--muted:#8d877d;--line:#2d2a26;--gbg:#12301f;--abg:#33290f;--bbg:#1e1f3b;--rbg:#3b1717;--g:#5bd39a;--a:#f3b35b;--b:#9aa0ff;--r:#ff9a9a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px 80px}
nav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}nav .wrap{display:flex;gap:6px;overflow-x:auto;padding:10px 20px}
nav a{white-space:nowrap;color:var(--body);text-decoration:none;font-size:13px;padding:6px 12px;border-radius:8px}nav a:hover{background:var(--card);color:var(--ink)}
h1{font-size:34px;letter-spacing:-.03em;margin:44px 0 6px}h2{font-size:24px;letter-spacing:-.02em;margin:56px 0 6px}h3{font-size:16px;margin:0 0 4px}p{margin:6px 0}.lead{font-size:17px;color:var(--body);max-width:820px}.sub{color:var(--muted);font-size:13.5px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:0 2px 10px rgba(13,11,10,.03)}
.grid{display:grid;gap:14px}.g2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.g3{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.pill{display:inline-block;font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 10px;white-space:nowrap}.live{background:var(--gbg);color:var(--g)}.part{background:var(--abg);color:var(--a)}.plan{background:var(--bbg);color:var(--b)}.no{background:var(--rbg);color:var(--r)}
.where{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);word-break:break-all}
.principle{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);margin-top:18px}.principle div{padding:18px 20px;border-right:1px solid var(--line)}.principle div:last-child{border:0}.principle b{display:block;font-size:20px;letter-spacing:-.02em}.principle span{color:var(--body);font-size:13.5px}
@media(max-width:720px){.principle{grid-template-columns:1fr}.principle div{border-right:0;border-bottom:1px solid var(--line)}}
/* layers */
.layers{display:grid;gap:10px}.layer{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px 14px}.layer>h4{margin:0 0 8px;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.row{display:flex;gap:10px;flex-wrap:wrap}.box{flex:1 1 150px;border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:var(--bg);font-size:13px}.box b{display:block;font-size:13.5px;margin-bottom:2px}.box small{color:var(--muted)}
.arrow{text-align:center;color:var(--muted);font-size:20px;line-height:1}
.box.hot{border-color:var(--brand)}
/* treemap */
#tm{position:relative;width:100%;height:520px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--card)}
#tm .c{position:absolute;padding:10px 12px;color:#fff;overflow:hidden;border:2px solid var(--card);border-radius:8px;cursor:default;transition:filter .15s}#tm .c:hover{filter:brightness(1.12)}
#tm .c b{display:block;font-size:14px;line-height:1.2}#tm .c span{font-size:12px;opacity:.9}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--body);margin:10px 0}.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
#tmd{margin-top:12px;min-height:64px}
/* workflows */
.wf{margin:14px 0 0}.steps{display:flex;gap:0;overflow-x:auto;padding:4px 2px 10px;align-items:stretch}.step{flex:0 0 205px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 12px;font-size:13px;position:relative;margin-right:22px}.step:not(:last-child)::after{content:"›";position:absolute;right:-17px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:22px}
.step em{display:block;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--muted);margin-bottom:3px}.step .who{display:block;margin-top:6px;font-size:11.5px;color:var(--muted)}
.step.ai{border-color:color-mix(in srgb,var(--b) 50%,var(--line))}.step.code{border-color:color-mix(in srgb,var(--g) 50%,var(--line))}.step.person{border-color:color-mix(in srgb,var(--a) 55%,var(--line))}
.key{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;margin:6px 0 12px}.key i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:13.5px}th{text-align:left;font-size:12px;color:var(--muted);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 60%,var(--card))}td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.erd{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.ent{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:9px 11px;font-size:12.5px}.ent b{font-size:13px}.ent div{color:var(--body)}
footer{margin-top:60px;color:var(--muted);font-size:12.5px}
@media print{nav{display:none}.wrap{padding-bottom:0}.card,.layer,.step{break-inside:avoid}#tm{height:420px}}
</style></head><body>
<nav><div class="wrap"><a href="#top">Overview</a><a href="#arch">Architecture</a><a href="#map">Size map</a><a href="#flows">Workflows</a><a href="#trust">Trust and limits</a><a href="#data">Data</a><a href="#links">Integrations</a><a href="#status">Status</a><a href="#test">How to test</a></nav>
<div class="wrap" id="top">
<h1>FynHelp: how the product works</h1>
<p class="lead">FynHelp sits on top of Tally and Zoho Books for Indian CA firms. It reads bank statements and registers, proves what it read, reconciles them to the books, hands the firm only the decisions that need a person, and closes the month with a partner's sign-off.</p>
<div class="principle"><div><b>AI reads</b><span>A statement or scan is read by rules first; AI only where rules cannot, in a compact format with limits on cost.</span></div><div><b>Code proves</b><span>Every figure is computed in code and must tie to the document's own printed totals. A statement that does not tie is held, never used.</span></div><div><b>People approve</b><span>Nothing is written to Tally or Zoho, and no month is closed, without a partner or manager approving it.</span></div></div>
<p class="sub" style="margin-top:14px">Prepared <span id="gen"></span>. This pack describes the product's structure only. It contains no client data and no secrets. Status labels are honest: <span class="pill live">Live</span> built and used, <span class="pill part">Partial</span> built with stated limits, <span class="pill plan">Planned</span> not built.</p>

<h2 id="arch">1. Architecture: where things happen</h2>
<p class="sub">Read top to bottom: documents come in from outside, are read and proved, reconciled, handed to people, then turned into reports and (with approval) entries in Tally.</p>
<div class="layers">
 <div class="layer"><h4>Outside the product</h4><div class="row">
  <div class="box"><b>Client</b><small>Sends statements, bills and receipts</small></div>
  <div class="box"><b>Tally</b><small>Day Book, ledgers, masters, on the firm's PC</small></div>
  <div class="box"><b>Zoho Books</b><small>Ledger of a linked bank account</small></div>
  <div class="box"><b>GST portal</b><small>GSTR-1, 2B, 3B files the firm downloads</small></div>
  <div class="box"><b>Bank / auditor</b><small>Statements, signed audited statements</small></div></div></div>
 <div class="arrow">▼</div>
 <div class="layer"><h4>1. Intake: five ways in</h4><div class="row">
  <div class="box"><b>Upload</b><small>Drag and drop in the app</small></div>
  <div class="box"><b>Gmail</b><small>Attachments picked from the firm's mailbox</small></div>
  <div class="box"><b>WhatsApp</b><small>Client sends the file; shared number routes it to the right client</small></div>
  <div class="box"><b>Upload link</b><small>No login; asks for a file password if needed and keeps it encrypted</small></div>
  <div class="box"><b>Tally connector</b><small>Pulls each company's Day Book by month (hourly)</small></div></div></div>
 <div class="arrow">▼</div>
 <div class="layer"><h4>2. Reader: turn a file into proven lines</h4><div class="row">
  <div class="box hot"><b>Rules and columns</b><small>Excel, CSV, Tally XML, text PDFs by where the text sits</small></div>
  <div class="box hot"><b>AI (only if needed)</b><small>Scans and odd layouts. Compact output, call and token limits</small></div>
  <div class="box hot"><b>Tie-out</b><small>Running balance + printed totals. Fail means held, not used</small></div>
  <div class="box"><b>Recognise</b><small>Loan statements, GST registers, masters are kept out of bank lines</small></div></div></div>
 <div class="arrow">▼</div>
 <div class="layer"><h4>3. Reconciliation engine (code only, no AI)</h4><div class="row">
  <div class="box"><b>By account</b><small>Each bank account matched to its own ledger</small></div>
  <div class="box"><b>Stages</b><small>Reference, exact, unique pair, identical groups, late booking, fuzzy and learned rules</small></div>
  <div class="box"><b>Set aside</b><small>Own-account transfers, reversals, contra legs, with evidence</small></div>
  <div class="box"><b>Awaiting statement</b><small>Lines for an account whose statement is not in yet</small></div></div></div>
 <div class="arrow">▼</div>
 <div class="layer"><h4>4. People: the decisions</h4><div class="row">
  <div class="box"><b>Review queue</b><small>Lines the reader was unsure of</small></div>
  <div class="box"><b>Exception queue</b><small>Owner, state, history, senior review</small></div>
  <div class="box"><b>Chaser</b><small>Asks the client for what is missing</small></div>
  <div class="box"><b>Month-end close</b><small>Ten steps, partner signs off last</small></div></div></div>
 <div class="arrow">▼</div>
 <div class="layer"><h4>5. Outputs</h4><div class="row">
  <div class="box"><b>MIS and reports</b><small>From proven figures, shareable by link</small></div>
  <div class="box"><b>GST checks</b><small>2B vs purchases, sales vs GSTR-1, 1 vs 3B, ITC, RCM</small></div>
  <div class="box"><b>Audit checks</b><small>Opening balances vs signed audit; ageing engine</small></div>
  <div class="box"><b>Entries to Tally</b><small>Approved lines only, existing ledgers only, one attempt each</small></div></div></div>
 <div class="layer"><h4>Under everything</h4><div class="row">
  <div class="box"><b>Firms, roles, audit log</b><small>Owner, partner, manager, junior. Every action logged with who and when</small></div>
  <div class="box"><b>Database and storage</b><small>Postgres with row-level security per firm; files in private storage</small></div>
  <div class="box"><b>Scheduler</b><small>Gmail poll, chasers, Tally and Zoho sync, retries</small></div>
  <div class="box"><b>Guardrails</b><small>AI limits, daily caps, approvals, nothing posted blind</small></div>
  <div class="box"><b>System health (admin)</b><small>AI status, failures, WhatsApp faults</small></div></div></div>
</div>

<h2 id="map">2. Size map: where the work is in the code</h2>
<p class="sub">Each block is an area of the product; its size is the amount of code behind it (lines in the main product folders), a rough guide to where the effort has gone, not to importance. Hover or tap a block for what it does and where it lives.</p>
<div id="tm"></div>
<div class="legend"><span><i style="background:#2f6b4f"></i>Engine (code that proves)</span><span><i style="background:#8e1b1f"></i>People (decisions)</span><span><i style="background:#2b5fa8"></i>Outside world (in and out)</span><span><i style="background:#6b5b95"></i>Platform</span></div>
<div id="tmd" class="card"><span class="sub">Hover or tap a block.</span></div>
<p class="sub" id="stats"></p>

<h2 id="flows">3. Workflows, step by step</h2>
<p class="sub">Each step is coloured by who does it: <b style="color:#2f6b4f">code</b> (proves or computes), <b style="color:#4338ca">AI</b> (reads), <b style="color:#b45309">a person</b> (decides). Under each flow: where it lives in the product.</p>
<div id="flowbox"></div>

<h2 id="trust">4. Trust, limits and guardrails</h2>
<div class="grid g2">
 <div class="card"><h3>What AI may and may not do</h3><p>AI reads text and images into rows, and suggests a category for uncertain lines. It never changes an amount, never matches a bank line to a book entry, never posts anything, never closes a month.</p></div>
 <div class="card"><h3>AI cost and safety limits</h3><p>Rules read first, so most files use no AI. Compact AI output (about 45% fewer output tokens). At most 48 AI calls per document. A ceiling on every answer. A daily call cap and a daily token budget per firm; past a limit, the product carries on with rules only.</p></div>
 <div class="card"><h3>Held, never silent</h3><p>A statement whose lines do not add to the bank's printed totals is held and named ("bank prints 14 debits, we read 13"). Nothing downstream uses it until a partner accepts it with a written reason.</p></div>
 <div class="card"><h3>Approval before anything is written</h3><p>Tally: a partner or manager approves each line and the ledger (existing ledgers only); one voucher per bank line with a fixed reference; the connector tries once and never retries blind. Zoho posting is off until three switches are on (platform, firm consent, client). Nothing is filed with the GST portal by FynHelp.</p></div>
 <div class="card"><h3>Roles and history</h3><p>Owner, partner, manager, junior see and do different things. Every change (assign, accept as timing, approve, sign off) is logged with the person and time and cannot be edited afterwards.</p></div>
 <div class="card"><h3>Client data</h3><p>Each firm's data is separated by row-level security. Files are in private storage. File passwords given by clients are stored encrypted and shown only to a partner or manager, and each view is logged. Messages to clients go out only with consent, inside a daily cap and a daytime window.</p></div>
</div>

<h2 id="data">5. What the product stores</h2>
<div class="erd">
 <div class="ent"><b>Firm and people</b><div>firm, members with roles, invites, subscription and credits</div></div>
 <div class="ent"><b>Client</b><div>one workspace per client: expected bank accounts, books link (Tally company or Zoho), contacts</div></div>
 <div class="ent"><b>Document</b><div>the file, how it was read, the statement check (opening, closing, totals, tie-out), status</div></div>
 <div class="ent"><b>Transaction</b><div>one line, bank side or books side, with its match state and set-aside tag</div></div>
 <div class="ent"><b>Match</b><div>bank line to book lines, which stage matched it and why</div></div>
 <div class="ent"><b>Exception</b><div>a decision for a person: owner, state, reason, history, resolution</div></div>
 <div class="ent"><b>Close</b><div>ten steps per client-month, who ticked, partner sign-off</div></div>
 <div class="ent"><b>Chase</b><div>what was asked, on which channel, when, and when it stopped</div></div>
 <div class="ent"><b>Activity</b><div>the audit trail of every action</div></div>
 <div class="ent"><b>AI call log</b><div>every AI call: purpose, latency, tokens, status (feeds limits and system health)</div></div>
 <div class="ent"><b>Learning</b><div>ledger choices and match rules learned from approvals, per firm</div></div>
 <div class="ent"><b>Connector</b><div>paired Tally connectors, queued entries, results</div></div>
</div>
<p class="sub" id="dbn" style="margin-top:10px"></p>

<h2 id="links">6. Connections to other systems</h2>
<div class="scroll"><table><thead><tr><th>System</th><th>What FynHelp does</th><th>What it never does</th><th>Status</th></tr></thead><tbody>
<tr><td><b>Tally</b></td><td>Connector on the firm's PC pairs with a 10-character code, pulls Day Books monthly (hourly refresh), reads masters; writes approved vouchers and approved new ledgers.</td><td>Post without approval; retry an entry whose result is unknown (it is flagged for a person).</td><td><span class="pill part">Partial</span> Windows installer not built; set-up still needs Node.js.</td></tr>
<tr><td><b>Zoho Books</b></td><td>Reads a linked bank account's ledger; checks entries FynHelp created.</td><td>Write anything unless the platform switch, firm consent and client switch are all on, and then only a bank charge or a receipt naming one invoice, after a partner previews it.</td><td><span class="pill part">Partial</span> read-only by default</td></tr>
<tr><td><b>Gmail</b></td><td>Picks statement attachments from the firm's mailbox by rules.</td><td>Read mail unrelated to documents.</td><td><span class="pill live">Live</span></td></tr>
<tr><td><b>WhatsApp</b></td><td>Receives client files; sends reminders from approved message templates with a one-tap upload link.</td><td>Send outside consent, the daily cap or the daytime window.</td><td><span class="pill live">Live</span> shared number routes by client phone or a JOIN code</td></tr>
<tr><td><b>GST portal files</b></td><td>Reads the GSTR-1, 2B and 3B reports the firm downloads (Excel or JSON) and the Tally registers.</td><td>File anything with the portal.</td><td><span class="pill live">Live</span></td></tr>
<tr><td><b>Signed audited statements</b></td><td>Reads the Balance Sheet and P&L PDFs by code, proves they add up and the reserves roll forward, then compares with Tally's opening balances.</td><td>Use a statement that does not add up.</td><td><span class="pill part">Partial</span> comparison needs Tally masters as at 1 April</td></tr>
</tbody></table></div>

<h2 id="status">7. Honest status: built, partial, planned</h2>
<div class="grid g2">
 <div class="card"><h3>Built and in use</h3><p>Reading of bank statements (PDF, Excel, scans) with tie-out; loan statements recognised; per-account reconciliation with set-asides; exception queue with owners and history; ten-step close with sign-off; GSTR-2B against purchases; the new GST returns check; chaser by WhatsApp and email; upload links; value card; System Health for admins.</p></div>
 <div class="card"><h3>Built, with limits</h3><p>Tally connector (installer missing). Zoho (read-only by default). Opening-balance check (needs Tally masters). Ageing engine (bill-wise and FIFO built and proved on real Day Books; no screen yet; openings needed for a true picture).</p></div>
 <div class="card"><h3>Planned</h3><p>Windows installer for the Tally connector. Ageing screen. Asking a client about one exception on WhatsApp. Reading purchase invoices against GSTR-2B. Checking a sample of matches for wrong ones (precision audit). Faster opening on very large firms. Read-only client status page.</p></div>
 <div class="card"><h3>Deliberately not done</h3><p>Filing GST returns. Posting to Tally without approval. Claims such as "100% accurate" or "fully automatic". Replacing the firm's entry tool: FynHelp checks first, then proposes only what the bank proves is missing.</p></div>
</div>

<h2 id="test">8. For the advisor: how to test it and what to look at</h2>
<div class="card"><ol style="margin:0;padding-left:20px"><li><b>Reading:</b> upload a bank statement. Look for the tie-out line (opening, closing, printed totals). Upload one with a line removed: it should be held with a reason.</li><li><b>Reconciliation:</b> upload the Day Book and statements for a month. Look at what was matched on its own, what was set aside and why, and what is left.</li><li><b>Exceptions:</b> accept one as timing with a reason; check the history shows who and when.</li><li><b>GST:</b> on the GST page, tab "Returns check", drop the month's registers and GSTR-1, 2B and 3B. Check each difference against your own working.</li><li><b>Close:</b> in a client's Close tab, see which steps tick themselves and which wait for a person.</li></ol>
<p class="sub" style="margin-top:10px">Questions for the advisor: which differences in the GST checks would you act on first? What evidence would you want in an audit file? Where would a partner not trust an automatic tick?</p></div>
<footer>FynHelp. Product structure for an advisor. Confidential: shared under the password given with it.</footer>
</div>
<script>
const D=/*DATA*/;
document.getElementById('gen').textContent=D.stats.generated;
document.getElementById('stats').textContent='About '+D.stats.codeLines.toLocaleString('en-IN')+' lines of product code in '+D.stats.codeFiles+' files, with '+D.stats.testLines.toLocaleString('en-IN')+' lines of automated tests in '+D.stats.testFiles+' files.';
document.getElementById('dbn').textContent=D.stats.migrations+' database changes (migrations) define the tables; each firm sees only its own rows.';
/* squarified treemap */
const COL={engine:'#2f6b4f',people:'#8e1b1f',outside:'#2b5fa8',platform:'#6b5b95'};
function squarify(items,x,y,w,h){const out=[];let rest=items.slice().sort((a,b)=>b.v-a.v);const total=rest.reduce((n,i)=>n+i.v,0);let area=w*h;rest.forEach(i=>i.a=i.v/total*area);
 const worst=(row,s)=>{const sum=row.reduce((n,i)=>n+i.a,0);const mx=Math.max(...row.map(i=>i.a)),mn=Math.min(...row.map(i=>i.a));return Math.max(s*s*mx/(sum*sum),sum*sum/(s*s*mn))};
 while(rest.length){const s=Math.min(w,h);let row=[rest[0]];let i=1;while(i<rest.length&&worst([...row,rest[i]],s)<=worst(row,s)){row.push(rest[i]);i++}
  const sum=row.reduce((n,r)=>n+r.a,0);if(w>=h){const rw=sum/h;let cy=y;row.forEach(r=>{const rh=r.a/rw;out.push({...r,x,y:cy,w:rw,h:rh});cy+=rh});x+=rw;w-=rw}else{const rh=sum/w;let cx=x;row.forEach(r=>{const rw=r.a/rh;out.push({...r,x:cx,y,w:rw,h:rh});cx+=rw});y+=rh;h-=rh}rest=rest.slice(row.length)}return out}
function drawTm(){const el=document.getElementById('tm');el.innerHTML='';const W=el.clientWidth,H=el.clientHeight;const items=D.treemap.filter(a=>a.lines>0).map(a=>({...a,v:a.lines}));
 squarify(items,0,0,W,H).forEach(r=>{const d=document.createElement('div');d.className='c';d.style.cssText='left:'+r.x+'px;top:'+r.y+'px;width:'+r.w+'px;height:'+r.h+'px;background:'+COL[r.layer];d.innerHTML='<b>'+r.name+'</b><span>'+r.lines.toLocaleString('en-IN')+' lines · '+r.files+' files</span>';
  const show=()=>{document.getElementById('tmd').innerHTML='<h3>'+r.name+'</h3><p>'+r.what+'</p><p class="sub">'+r.lines.toLocaleString('en-IN')+' lines in '+r.files+' files ('+Math.round(r.lines/D.stats.codeLines*100)+'% of the product code)</p>'};d.onmouseenter=show;d.onclick=show;el.appendChild(d)})}
drawTm();addEventListener('resize',drawTm);
/* workflows */
const W=[
{t:'A. A document arrives and is proved',st:'live',where:'Reading documents · documents.server, extract/, statementVerification',steps:[['Arrives','Upload, Gmail, WhatsApp, upload link or Tally','code','System'],['Identify','Bank or books? which client and account? loan statement?','code','System'],['Read','Rules and column positions first; AI only for scans and odd layouts, with limits','ai','System'],['Prove','Running balance line by line + bank printed totals','code','System'],['Accept or hold','Tied: used. Not tied: held with the reason in plain words','code','System'],['Decide held','Partner accepts with a written reason, or asks for a better copy','person','Partner']]},
{t:'B. Month-end reconciliation',st:'live',where:'Reconciliation · recon/engine, recon.server',steps:[['Books in','Tally Day Book or Zoho ledger for the month','code','Connector'],['Split by account','Each bank account against its own ledger (account tail)','code','System'],['Match in stages','Reference, exact, unique pair, identical groups, late booking, learned rules','code','System'],['Set aside','Own-account transfers, reversals, contra legs, with evidence and Undo','code','System'],['Exceptions','Only what is left, one decision per line and its book twin','code','System'],['Start over','Clears automatic matches, keeps anything a person matched','person','Manager']]},
{t:'C. Exceptions to close',st:'live',where:'Exceptions and review, Month-end close · exceptionWork.server, close/',steps:[['Assign','Unassigned until a person takes it or a manager gives it out','person','Manager'],['Work it','Query sent, note, accept as timing with a reason, or resolve','person','Junior'],['Senior review','Second pair of eyes where the firm has a second partner','person','Partner'],['Auto-ticks','Documents received, statements verified, reconciliation done, exceptions explained','code','System'],['Manual ticks','GST, TDS, provisions, MIS review by the right role','person','Manager'],['Sign off','Partner signs last; month reads Fully Closed','person','Partner']]},
{t:'D. Asking the client for documents (chaser)',st:'live',where:'Chaser · chaser.server, whatsapp*, uploadLinks.server',steps:[['Detect','Which statement or invoice is missing for the month','code','System'],['Compose','Approved template, one-tap upload link','code','System'],['Send','WhatsApp or email, only with consent, daily cap and daytime window','code','System'],['Client uploads','No login; asks for the file password if locked and keeps it encrypted','person','Client'],['Stops','The chase ends when the file arrives','code','System']]},
{t:'E. Writing approved entries to Tally',st:'part',where:'Connectors · tallyPosting.server, tallyVoucher, tallyLedgerSuggest',steps:[['Propose','A bank line with no book entry; ledger suggested from the firm\'s past approvals','code','System'],['Approve','Partner or manager picks an existing ledger and approves','person','Partner'],['Queue','One voucher per bank line with a fixed reference','code','System'],['Connector posts','On the firm\'s PC, one attempt','code','Connector'],['Result','Confirmed, or flagged for a person if the result never came back','code','System']]},
{t:'F. GST returns check',st:'live',where:'GST, audit and ageing checks · gst/reports, gst/returns, GstReturnsCheck',steps:[['Drop files','Tally registers and journals; GSTR-1, 2B, 3B (Excel or JSON)','person','CA team'],['Recognise','Each file is identified by its headings; the month is chosen','code','System'],['Compare','Sales vs GSTR-1 (invoice by invoice); GSTR-1 vs 3B; ITC available vs claimed; reverse charge','code','System'],['Explain','Every difference shown with both figures and sources; missing files named','code','System'],['Act','The CA decides: amend, claim, follow up with the supplier','person','CA']]},
{t:'G. Opening balances against last year\'s audit',st:'part',where:'GST, audit and ageing checks · audited.ts, OpeningBalanceCheck',steps:[['Drop PDFs','Signed Balance Sheet and P&L (text layer), and Tally masters XML','person','CA team'],['Read by code','Figures scaled by the unit stated on the page (e.g. thousands)','code','System'],['Prove','Totals add up; liabilities equal assets; reserves roll forward by the year\'s profit','code','System'],['Compare','Tally openings by head against the audited closing','code','System'],['Explain','A person explains every difference before the month closes','person','CA']]},
{t:'H. Ageing (debtors and creditors)',st:'part',where:'GST, audit and ageing checks · ageing.ts',steps:[['Postings','Each party ledger from the Day Book or Tally bill allocations','code','System'],['Bill-wise','Where a party has bill references: bills and their settlements','code','System'],['FIFO','Where it does not: each receipt settles the oldest bill; the rest is on account','code','System'],['Prove','Closing equals the ledger\'s own closing to the paisa','code','System'],['Show','Age buckets per party, with the method named (screen not built yet)','code','System']]}];
const fb=document.getElementById('flowbox');const label={live:'Live',part:'Partial',plan:'Planned'};
fb.innerHTML='<div class="key"><span><i style="background:#2f6b4f"></i>Code</span><span><i style="background:#4338ca"></i>AI</span><span><i style="background:#b45309"></i>A person</span></div>'+W.map(f=>'<div class="wf card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">'+f.t+'</h3><span class="pill '+f.st+'">'+label[f.st]+'</span></div><div class="steps">'+f.steps.map((s,i)=>'<div class="step '+s[2]+'"><em>STEP '+(i+1)+'</em><b>'+s[0]+'</b><br>'+s[1]+'<span class="who">'+s[3]+'</span></div>').join('')+'</div><div class="where">'+f.where+'</div></div>').join('');
</script></body></html>`;
const html = PAGE.replace("/*DATA*/", JSON.stringify({ treemap, stats }));

/* ── 3. encrypt and wrap ─────────────────────────────────────────────────────────────────────── */
const password = process.env.PACK_PASSWORD || randomBytes(9).toString("base64url");
const c = webcrypto;
const salt = c.getRandomValues(new Uint8Array(16));
const iv = c.getRandomValues(new Uint8Array(12));
const ITER = 600_000;
const keyMat = await c.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await c.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const enc = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(html)));
const b64 = (u) => Buffer.from(u).toString("base64");
const wrapper = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>FynHelp product architecture (protected)</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f8fa;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#111318}@media(prefers-color-scheme:dark){body{background:#141210;color:#faf7f2}.b{background:#1c1a17!important;border-color:#2d2a26!important}input{background:#141210!important;color:#faf7f2!important;border-color:#2d2a26!important}}
.b{background:#fff;border:1px solid #eaecef;border-radius:16px;padding:28px;width:min(420px,92vw);box-shadow:0 2px 10px rgba(13,11,10,.04)}h1{font-size:20px;margin:0 0 6px;letter-spacing:-.02em}p{margin:0 0 16px;color:#6b7280;font-size:13.5px}input{width:100%;padding:11px 12px;border:1px solid #e2e5ec;border-radius:8px;font-size:15px}button{margin-top:12px;width:100%;padding:11px;border:0;border-radius:8px;background:#18181b;color:#fff;font-size:14px;font-weight:600;cursor:pointer}#e{color:#b91c1c;font-size:13px;margin-top:10px;min-height:18px}</style></head>
<body><form class="b" id="f"><h1>FynHelp product architecture</h1><p>This document is protected. Enter the password you were given. It is decrypted in your browser; nothing is sent anywhere.</p><input id="p" type="password" autocomplete="current-password" placeholder="Password" autofocus><button>Open</button><div id="e" role="alert"></div></form>
<script>
const S="${b64(salt)}",I="${b64(iv)}",C="${b64(enc)}",N=${ITER};
const u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const err=document.getElementById('e');err.textContent='';const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Opening…';
 try{if(!crypto||!crypto.subtle)throw new Error('nosub');const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(document.getElementById('p').value),'PBKDF2',false,['deriveKey']);
  const k=await crypto.subtle.deriveKey({name:'PBKDF2',salt:u(S),iterations:N,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['decrypt']);
  const t=await crypto.subtle.decrypt({name:'AES-GCM',iv:u(I)},k,u(C));document.open();document.write(new TextDecoder().decode(t));document.close();}
 catch(x){err.textContent=x.message==='nosub'?'This browser cannot decrypt from a local file. Open it in Chrome, Edge or Safari, or from a web address.':'Wrong password.';btn.disabled=false;btn.textContent='Open'}};
</script></body></html>`;
mkdirSync(join(ROOT, "docs/share"), { recursive: true });
const out = join(ROOT, "docs/share/FynHelp_Product_Architecture_PROTECTED.html");
writeFileSync(out, wrapper);
console.log(JSON.stringify({ out, password, stats }, null, 1));
