/**
 * Background work for the practice agents, driven by cron:
 *   - check connected Gmail inboxes for client documents (gmailIntake.server)
 *   - extract queued documents (Gmail / WhatsApp arrivals) and retry ones that
 *     failed for a temporary reason, with backoff
 *   - send chaser follow-ups that are due and escalate unanswered ones
 *   - open the "missing bank statement" chase after each firm's chase day
 * Extract chains into Recon by itself (see orchestrator.server).
 */
import { runDueFollowups } from "./chaser.server";
import { processQueue } from "./documents.server";
import { runAutoChases } from "./orchestrator.server";
import { pollGmailInboxes } from "./gmailIntake.server";

export async function practiceTick(
  opts: { queueLimit?: number; now?: Date; gmailBudgetMs?: number } = {},
) {
  const started = Date.now();
  const now = opts.now ?? new Date();
  // Gmail first, so documents that just arrived are read in this same run.
  const gmail = await pollGmailInboxes({ budgetMs: opts.gmailBudgetMs ?? 20_000 })
    .then((g) => ({ inboxes: g.inboxes.length, documents: g.documents, errors: g.inboxes.filter((i) => i.error).length }))
    .catch((e) => ({ inboxes: 0, documents: 0, error: (e as Error).message }));
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
  return { gmail, queue, autoChase, chaser, ms: Date.now() - started };
}
