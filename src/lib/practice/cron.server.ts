/**
 * Background work for the practice agents, driven by cron:
 *   - extract queued documents (Gmail / WhatsApp arrivals, retries)
 *   - send chaser follow-ups that are due and escalate unanswered ones
 */
import { runDueFollowups } from "./chaser.server";
import { processQueue } from "./documents.server";

export async function practiceTick(opts: { queueLimit?: number; now?: Date } = {}) {
  const started = Date.now();
  const queue = await processQueue(opts.queueLimit ?? 5).catch((e) => ({ processed: 0, error: (e as Error).message }));
  const chaser = await runDueFollowups(opts.now ?? new Date()).catch((e) => ({ error: (e as Error).message }));
  return { queue, chaser, ms: Date.now() - started };
}
