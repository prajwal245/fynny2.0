#!/usr/bin/env node
/**
 * Campaign report from a Google Analytics 4 CSV export.
 *
 *   node scripts/ga4-campaign-report.mjs export.csv [--campaign launch-oct26] [--min-sessions 30]
 *
 * Export (GA4 → Explore → Free form): Rows = Session source, Session medium, Session campaign,
 * Session manual ad content (or the "Campaign content" custom dimension). Values = Sessions and
 * Key events (or the sign_up count). Download as CSV. One row per combination.
 *
 * Every number comes from the file: sessions, sign-ups and conversion rate (sign-ups / sessions).
 * Rates on fewer than --min-sessions sessions are marked "low sample" and never ranked as winners.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/* ── parsing ─────────────────────────────────────────────── */

/** One CSV line into cells, honouring "quoted, cells". */
export function splitLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** GA4 puts "# comment" lines first, then the table; a blank line ends it. */
export function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith("#"))) i++;
  if (i >= lines.length) throw new Error("The file has no table in it.");
  const headers = splitLine(lines[i]);
  const rows = [];
  for (i += 1; i < lines.length && lines[i].trim(); i++) {
    const cells = splitLine(lines[i]);
    rows.push(Object.fromEntries(headers.map((h, k) => [h, cells[k] ?? ""])));
  }
  return { headers, rows };
}

const find = (headers, patterns) => {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x));
    if (h) return h;
  }
  return null;
};

/** Which column is which, whatever GA4 called it. */
export function detectColumns(headers) {
  const cols = {
    source: find(headers, [/^utm_source$/i, /session.*source(?!.*medium)/i, /^source$/i, /source(?!.*medium)/i]),
    medium: find(headers, [/^utm_medium$/i, /session.*medium/i, /^medium$/i, /medium/i]),
    campaign: find(headers, [/^utm_campaign$/i, /session.*campaign/i, /campaign name/i, /^campaign$/i]),
    content: find(headers, [/^utm_content$/i, /manual ad content/i, /campaign content/i, /ad content/i, /content/i]),
    sessions: find(headers, [/^sessions$/i, /sessions/i]),
    signups: find(headers, [/sign.?ups?/i, /key events?/i, /conversions?/i]),
  };
  const missing = ["sessions", "signups"].filter((k) => !cols[k]);
  if (missing.length) throw new Error(`Could not find a column for: ${missing.join(", ")}. Columns in the file: ${headers.join(" | ")}`);
  if (!cols.source && !cols.medium && !cols.content) throw new Error("The file needs at least one of: source, medium, content.");
  return cols;
}

/* ── analysis ────────────────────────────────────────────── */

const clean = (v) => (!v || /^\(?not set\)?$/i.test(v) ? "(not set)" : v.toLowerCase());

export function normalise(rows, cols, campaign) {
  const out = rows.map((r) => ({
    source: cols.source ? clean(r[cols.source]) : "(all)",
    medium: cols.medium ? clean(r[cols.medium]) : "(all)",
    campaign: cols.campaign ? clean(r[cols.campaign]) : "(all)",
    content: cols.content ? clean(r[cols.content]) : "(all)",
    sessions: num(r[cols.sessions]),
    signups: num(r[cols.signups]),
  }));
  // Drop GA4's own "Total" row, and keep only the requested campaign when the file has campaigns.
  const rowsOnly = out.filter((r) => ![r.source, r.medium, r.content].some((v) => /^total$/i.test(v)));
  return campaign && cols.campaign ? rowsOnly.filter((r) => r.campaign === campaign.toLowerCase()) : rowsOnly;
}

export function group(rows, keyOf) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) ?? { key: k, sessions: 0, signups: 0 };
    g.sessions += r.sessions;
    g.signups += r.signups;
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, rate: g.sessions ? g.signups / g.sessions : null }));
}

export const PEOPLE = ["tarun", "nidhi", "prajwal", "samiksha", "company-page"];
/** Team member / page, ad, group, referral... judged by the content name. */
export function contentKind(content, source) {
  if (PEOPLE.includes(content)) return "team";
  if (/^ad[-_ ]?\d+/i.test(content) || /paid/i.test(source) || source === "meta") return "ad";
  return "other";
}

const pct = (x) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const table = (title, groups, minSessions) => {
  const sorted = [...groups].sort((a, b) => b.signups - a.signups || b.sessions - a.sessions);
  const lines = [`### ${title}`, "", "| | Sessions | Sign-ups | Conversion | Note |", "|---|---:|---:|---:|---|"];
  for (const g of sorted) lines.push(`| ${g.key} | ${g.sessions} | ${g.signups} | ${pct(g.rate)} | ${g.sessions < minSessions ? "low sample" : ""} |`);
  return lines.join("\n");
};

/** Winners and laggards among rows with enough sessions to judge. */
export function rankChannels(groups, minSessions) {
  const judged = groups.filter((g) => g.sessions >= minSessions && g.rate !== null);
  const byRate = [...judged].sort((a, b) => b.rate - a.rate);
  return {
    top: byRate.slice(0, 3),
    bottom: byRate.slice(-3).reverse().filter((g) => !byRate.slice(0, 3).includes(g)),
    // Plenty of traffic, nothing coming of it: the clearest place to fix something.
    leaks: judged.filter((g) => g.signups === 0 || g.rate < 0.5 * (groups.reduce((s, x) => s + x.signups, 0) / Math.max(1, groups.reduce((s, x) => s + x.sessions, 0)))).sort((a, b) => b.sessions - a.sessions).slice(0, 3),
    unjudged: groups.filter((g) => g.sessions < minSessions).length,
  };
}

export function buildReport(text, { campaign, minSessions = 30 } = {}) {
  const { headers, rows: raw } = parseCsv(text);
  const cols = detectColumns(headers);
  const rows = normalise(raw, cols, campaign);
  if (!rows.length) throw new Error(campaign ? `No rows for campaign "${campaign}".` : "No data rows in the file.");
  const sessions = rows.reduce((s, r) => s + r.sessions, 0);
  const signups = rows.reduce((s, r) => s + r.signups, 0);
  const notSet = rows.filter((r) => r.content === "(not set)" || r.source === "(not set)").reduce((s, r) => s + r.sessions, 0);

  const out = [];
  out.push(`# Campaign report${campaign ? `: ${campaign}` : ""}`, "");
  out.push(`**Overall:** ${sessions} sessions, ${signups} sign-ups, ${pct(sessions ? signups / sessions : null)} conversion.`);
  if (notSet) out.push(`${notSet} sessions (${pct(notSet / sessions)}) have a missing source or content tag, so they cannot be credited to a person or ad.`);
  out.push("");
  const bySource = group(rows, (r) => r.source);
  const bySM = group(rows, (r) => `${r.source} / ${r.medium}`);
  out.push("## 1. By source and medium", "", table("By source", bySource, minSessions), "", table("By source / medium", bySM, minSessions), "");

  const contentRows = group(rows, (r) => `${r.content}`).map((g) => {
    const any = rows.find((r) => r.content === g.key);
    return { ...g, kind: contentKind(g.key, any?.source ?? "") };
  });
  out.push("## 2. By person and ad (utm_content)", "");
  for (const [kind, title] of [["team", "Team and company page"], ["ad", "Ads"], ["other", "Other (groups, referrals, offline)"]]) {
    const g = contentRows.filter((x) => x.kind === kind);
    if (g.length) out.push(table(title, g, minSessions), "");
  }

  const r = rankChannels(bySM, minSessions);
  out.push("## 3. Best and weakest (source / medium, at least " + minSessions + " sessions)", "");
  out.push(r.top.length ? `**Best conversion:** ${r.top.map((g) => `${g.key} (${pct(g.rate)}, ${g.signups} sign-ups)`).join("; ")}` : "Nothing has enough sessions to judge yet.");
  out.push(r.bottom.length ? `**Weakest conversion:** ${r.bottom.map((g) => `${g.key} (${pct(g.rate)} on ${g.sessions} sessions)`).join("; ")}` : "");
  out.push(r.leaks.length ? `**Traffic that is not converting:** ${r.leaks.map((g) => `${g.key} (${g.sessions} sessions, ${g.signups} sign-ups)`).join("; ")}` : "");
  if (r.unjudged) out.push(`${r.unjudged} source / medium rows have under ${minSessions} sessions and are not ranked.`);
  return { text: out.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"), totals: { sessions, signups }, bySource, bySM, contentRows, ranking: r };
}

/* ── command line ────────────────────────────────────────── */

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!file) {
    console.error("Usage: node scripts/ga4-campaign-report.mjs export.csv [--campaign launch-oct26] [--min-sessions 30]");
    process.exit(2);
  }
  try {
    console.log(buildReport(readFileSync(file, "utf8"), { campaign: flag("--campaign"), minSessions: Number(flag("--min-sessions")) || 30 }).text);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
