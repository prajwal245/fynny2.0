#!/usr/bin/env node
/**
 * Supabase database linter gate.
 *
 * Calls the Supabase Management API for the project's `database/lint` endpoint,
 * compares findings against `.github/security/lint-baseline.json`, and exits
 * with code 1 if any new finding is detected.
 *
 * Required env vars:
 *   SUPABASE_ACCESS_TOKEN   Personal access token (Settings → Access tokens)
 *   SUPABASE_PROJECT_REF    Project ref (e.g. ukmtzflxtcoqnwujvrqh)
 *
 * Usage:
 *   node scripts/check-supabase-lint.mjs
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(
  __dirname,
  "..",
  ".github",
  "security",
  "lint-baseline.json",
);

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !PROJECT_REF) {
  console.error(
    "✘ SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set.",
  );
  process.exit(2);
}

const FAIL_LEVELS = new Set(["ERROR", "WARN"]);

/**
 * Match findings to allowlist by (name, level, schema, object name).
 * `object` falls back to extracting the last identifier from `metadata.name`
 * or `cache_key` so we tolerate slight payload differences.
 */
function findingKey(f) {
  const name = (f.name || "").toLowerCase();
  const level = (f.level || "").toUpperCase();
  const schema = f.metadata?.schema || f.metadata?.table_schema || "";
  const object =
    f.metadata?.name ||
    f.metadata?.table ||
    f.metadata?.function ||
    f.metadata?.policy ||
    null;
  return { name, level, schema, object };
}

function isAllowed(finding, allowlist) {
  const k = findingKey(finding);
  return allowlist.some(
    (a) =>
      a.name.toLowerCase() === k.name &&
      a.level.toUpperCase() === k.level &&
      (a.schema || "") === k.schema &&
      (a.object == null || a.object === k.object),
  );
}

async function fetchLintFindings() {
  // Current endpoint first; the older database/lint path was removed.
  const paths = ["advisors/security", "database/lint"];
  let last = "";
  for (const path of paths) {
    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.status === 404) {
      last = `${path}: 404`;
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Supabase API ${res.status} ${res.statusText}: ${body.slice(0, 400)}`,
      );
    }
    const body = await res.json();
    // advisors/security returns { lints: [...] }; database/lint returned an array.
    return Array.isArray(body) ? body : (body.lints ?? []);
  }
  throw new Error(`No linter endpoint found (${last})`);
}

function formatFinding(f) {
  const k = findingKey(f);
  const target = k.object ? `${k.schema}.${k.object}` : k.schema || "—";
  return `  • [${k.level}] ${k.name}  (${target})`;
}

(async () => {
  const baselineRaw = await readFile(BASELINE_PATH, "utf8");
  const baseline = JSON.parse(baselineRaw);
  const allowlist = baseline.allowed || [];

  const findings = await fetchLintFindings();
  const gating = findings.filter((f) =>
    FAIL_LEVELS.has((f.level || "").toUpperCase()),
  );

  const newFindings = gating.filter((f) => !isAllowed(f, allowlist));
  const allowedHits = gating.filter((f) => isAllowed(f, allowlist));

  console.log(
    `Supabase linter: ${gating.length} gated finding(s), ` +
      `${allowedHits.length} allowlisted, ${newFindings.length} new.`,
  );

  if (allowedHits.length) {
    console.log("\nAllowlisted (still present, not failing):");
    allowedHits.forEach((f) => console.log(formatFinding(f)));
  }

  if (newFindings.length) {
    console.error("\n✘ NEW Supabase security findings detected:");
    newFindings.forEach((f) => console.error(formatFinding(f)));
    console.error(
      "\nFix the issue, or add an explicit entry to " +
        ".github/security/lint-baseline.json after review.",
    );
    process.exit(1);
  }

  console.log("\n✓ No new Supabase security findings.");
})().catch((err) => {
  console.error("✘ Linter check failed:", err.message);
  process.exit(2);
});
