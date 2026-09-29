#!/usr/bin/env node
// Applies supabase/migrations/*.sql to a hosted project through the Supabase
// Management API, so only a personal access token is needed (no DB password).
// Applied versions are recorded in supabase_migrations.schema_migrations, the
// same table `supabase db push` uses, so the CLI stays in sync afterwards.
//
// A project may already hold part of the schema without the matching history
// (for example one first set up by Lovable). When a whole file fails only
// because something already exists, the file is re-run statement by statement
// and those statements are skipped.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/supabase-apply-migrations.mjs <project-ref> [--dry-run]
//   PG_URL=postgres://... node scripts/supabase-apply-migrations.mjs local      (test against a local database)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ref = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
// Tolerate a secret pasted with spaces, a newline, or the token twice over.
const token =
  (process.env.SUPABASE_ACCESS_TOKEN ?? "").match(/sbp_[0-9a-f]{40}/)?.[0] ?? process.env.SUPABASE_ACCESS_TOKEN?.trim();
const pgUrl = process.env.PG_URL;
if (!ref || (!token && !pgUrl)) {
  console.error("usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/supabase-apply-migrations.mjs <project-ref> [--dry-run]");
  process.exit(1);
}

class SqlError extends Error {
  constructor(message) {
    super(message);
    this.code = message.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? null;
  }
}

async function query(sql) {
  if (pgUrl) {
    try {
      const out = execFileSync("psql", [pgUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", "-"], {
        input: `\\set VERBOSITY verbose\n${sql}`,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
      return out.trim() ? out.trim().split("\n").map((version) => ({ version })) : [];
    } catch (e) {
      throw new SqlError(String(e.stderr ?? e.message));
    }
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new SqlError(`${res.status} ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : [];
}

// "Already exists" errors: duplicate object/table/column/function/schema, and
// unique violations from seed rows that are already there.
const ALREADY_EXISTS = new Set(["42710", "42P07", "42701", "42723", "42P06", "42P16", "23505"]);
// Inside a file that is already partly applied, a statement can also refer to
// something a later migration has since renamed or dropped. The database is
// ahead of that statement (0A000: e.g. a column type change a later policy
// now depends on), so it is skipped too. The final check below makes
// sure everything the app needs is really there.
const ALREADY_AHEAD = new Set([...ALREADY_EXISTS, "42703", "42704", "42P01", "42883", "2BP01", "23502", "23503", "42P10", "0A000", "42P13"]);

/** Splits SQL into statements, respecting quotes, dollar quotes and comments. */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end + 1;
      buf += sql.slice(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
    } else if (c === "'" || c === '"') {
      const escaped = c === "'" && /[eE]$/.test(buf) && !/[A-Za-z0-9_][eE]$/.test(buf);
      let j = i + 1;
      while (j < sql.length) {
        if (escaped && sql[j] === "\\") j += 2;
        else if (sql[j] === c && sql[j + 1] === c) j += 2;
        else if (sql[j] === c) break;
        else j++;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "$") {
      const tag = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag && !/[A-Za-z0-9_]$/.test(buf)) {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
      } else {
        buf += c;
        i++;
      }
    } else if (c === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      i++;
    } else {
      buf += c;
      i++;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  // Drop pieces that are only comments.
  return out.filter((s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").trim());
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const record = (version, name) =>
  `insert into supabase_migrations.schema_migrations (version, name) values (${lit(version)}, ${lit(name)}) on conflict (version) do nothing;`;

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  );`);
const applied = new Set((await query("select version from supabase_migrations.schema_migrations")).map((r) => r.version));

const pending = files.filter((f) => !applied.has(f.split("_")[0]));
console.log(`${files.length} migrations, ${applied.size} already applied, ${pending.length} pending`);
if (dryRun) {
  pending.forEach((f) => console.log(`  would apply ${f}`));
  process.exit(0);
}

let done = 0;
let totalSkipped = 0;
for (const file of pending) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  try {
    // One request per file, wrapped so a failure leaves nothing half-applied.
    await query(`begin;\n${sql}\n;\n${record(version, name)}\ncommit;`);
  } catch (e) {
    // Most often part of this file is already in the database (or a later
    // migration has already moved past it): apply it piece by piece instead.
    console.log(`\n  ${file}: whole-file apply failed (${e.code ?? "?"}), retrying statement by statement`);
    const skipped = [];
    for (const stmt of splitStatements(sql)) {
      try {
        await query(stmt);
      } catch (err) {
        if (ALREADY_AHEAD.has(err.code)) {
          skipped.push(`${err.code} ${stmt.split("\n")[0].slice(0, 90)}`);
          continue;
        }
        console.error(`\n\nFailed at ${file} (statement by statement):\n${stmt.slice(0, 400)}\n${err.message}`);
        console.error(`${done} applied before the failure. Fix the migration and run again; it resumes here.`);
        process.exit(1);
      }
    }
    await query(record(version, name));
    totalSkipped += skipped.length;
    console.log(`  ${file}: ${skipped.length} statement(s) already present or superseded, skipped`);
    skipped.forEach((line) => console.log(`      skip ${line}`));
  }
  done++;
  process.stdout.write(`\r  applied ${done}/${pending.length}  ${file.slice(0, 60)}`.padEnd(100));
}
console.log(`\nDone. ${done} migrations applied${totalSkipped ? `, ${totalSkipped} existing statement(s) skipped` : ""}.`);

// Final check: every table and column the practice app reads or writes exists.
const expected = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "practice-schema.json"), "utf8"));
const tables = Object.keys(expected).map(lit).join(",");
const rows = await query(
  `select table_name || '.' || column_name as version from information_schema.columns where table_schema = 'public' and table_name in (${tables})`,
);
const have = new Set(rows.map((r) => r.version));
const missing = Object.entries(expected).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`)).filter((tc) => !have.has(tc));
const extras = await query(
  `select 'bucket ' || id as version from storage.buckets where id = 'ca-client-documents'
   union all select 'function ' || proname from pg_proc where proname = 'user_in_ca_firm'`,
);
if (!extras.some((r) => r.version === "bucket ca-client-documents")) missing.push("storage bucket ca-client-documents");
if (!extras.some((r) => r.version === "function user_in_ca_firm")) missing.push("function public.user_in_ca_firm");
if (missing.length) {
  console.error(`\nSchema check failed. Missing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(`Schema check passed: ${Object.keys(expected).length} tables and ${have.size} columns the app uses are present.`);
