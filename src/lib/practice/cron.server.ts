/**
 * Background work for the practice agents, driven by cron:
 *   - extract queued documents (Gmail / WhatsApp arrivals) and retry ones that
 *     failed for a temporary reason, with backoff
 *   - send chaser follow-ups that are due and escalate unanswered ones
 *   - open the "missing bank statement" chase after each firm's chase day
 * Extract chains into Recon by itself (see orchestrator.server).
 */
import { runDueFollowups } from "./chaser.server";
import { processQueue } from "./documents.server";
import { runAutoChases } from "./orchestrator.server";

export async function practiceTick(
  opts: { queueLimit?: number; now?: Date } = {},
) {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const queue = await processQueue(opts.queueLimit ?? 5).catch((e) => ({
    processed: 0,
    error: (e as Error).message,
  }));
  const autoChase = await runAutoChases(now).catch((e) => ({
    created: 0,
    error: (e as Error).message,
  }));
  const chaser = await runDueFollowups(now).catch((e) => ({
    error: (e as Error).message,
  }));
  return { queue, autoChase, chaser, ms: Date.now() - started };
}
