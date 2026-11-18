#!/usr/bin/env node
// Runs the real-file regression gate. Usage: REAL_STATEMENTS=/folder node scripts/real-gate.mjs   (add GATE_UPDATE=1 to record new baselines)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const dir = process.env.REAL_STATEMENTS;
if (!dir || !existsSync(dir)) {
  console.error("Set REAL_STATEMENTS to the folder holding the real client files, for example:\n  REAL_STATEMENTS=/path/to/real-files npm run real:gate");
  process.exit(2);
}
const r = spawnSync("npx", ["vitest", "run", "tests/unit/practice/real-gate.test.ts", "--reporter=verbose"], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
