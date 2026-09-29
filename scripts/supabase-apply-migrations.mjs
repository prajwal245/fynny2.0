#!/usr/bin/env node
// Applies supabase/migrations/*.sql to a hosted project through the Supabase
// Management API, so only a personal access token is needed (no DB password).
// Applied versions are recorded in supabase_migrations.schema_migrations, the
// same table `supabase db push` uses, so the CLI stays in sync afterwards.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/supabase-apply-migrations.mjs qfowcjyueonpwmxzthmz [--dry-run]
import fs from "node:fs";
import path from "node:path";

const ref = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
// Tolerate a secret pasted with spaces, a newline, or the token twice over.
const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").match(/sbp_[0-9a-f]{40}/)?.[0] ?? process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!ref || !token) {
  console.error("usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/supabase-apply-migrations.mjs <project-ref> [--dry-run]");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : [];
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

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
for (const file of pending) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  try {
    // One request per file, wrapped so a failure leaves nothing half-applied.
    await query(`begin;\n${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values (${lit(version)}, ${lit(rest.join("_"))});\ncommit;`);
    done++;
    process.stdout.write(`\r  applied ${done}/${pending.length}  ${file.slice(0, 60)}`.padEnd(100));
  } catch (e) {
    console.error(`\n\nFailed at ${file}:\n${e.message}`);
    console.error(`${done} applied before the failure. Fix the migration and run again; it resumes here.`);
    process.exit(1);
  }
}
console.log(`\nDone. ${done} migrations applied.`);
