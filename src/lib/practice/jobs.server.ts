/**
 * Once-per-period background jobs. The cron tick runs every 15 minutes and
 * can overlap; the first tick to claim a (job, key) row does the work.
 */
import type { Db } from "./db.server";

/** Now in India time, as "2026-10-17T09" (hour precision) and parts. */
export function istParts(now: Date = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const iso = ist.toISOString();
  return { hourKey: iso.slice(0, 13), date: iso.slice(0, 10), month: iso.slice(0, 7), day: ist.getUTCDate(), hour: ist.getUTCHours() };
}

export async function claimJob(db: Db, job: string, key: string): Promise<boolean> {
  const { error } = await db.from("ca_job_runs").insert({ job, key });
  if (!error) return true;
  if (error.code !== "23505") console.error(`[jobs] could not claim ${job}/${key}: ${error.message}`);
  return false;
}

export async function recordJob(db: Db, job: string, key: string, result: unknown): Promise<void> {
  await db.from("ca_job_runs").update({ result }).eq("job", job).eq("key", key);
}
