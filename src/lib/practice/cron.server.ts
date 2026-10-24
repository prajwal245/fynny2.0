/**
 * Background work for the practice agents, driven by cron:
 *   - check connected Gmail inboxes for client documents (gmailIntake.server)
 *   - extract queued documents (Gmail / WhatsApp arrivals) and retry ones that
 *     failed for a temporary reason, with backoff
 *   - send chaser follow-ups that are due and escalate unanswered ones
 *   - open the "missing bank statement" chase after each firm's chase day
 *   - bill last month's extra clients and document overage (hourly at most)
 *   - send trial, usage and retention emails (hourly, 9 am to 8 pm IST)
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
  const renewals = await import("./billing.server")
    .then(async (b) => b.sendRenewalReminders(await (await import("./db.server")).adminDb(), now))
    .catch((e) => ({ sent: 0, error: (e as Error).message }));
  const db = await (await import("./db.server")).adminDb();
  const { claimJob, istParts } = await import("./jobs.server");
  // Extras are billed before the usage summary emails that describe them.
  const arrears = await claimJob(db, "arrears", istParts(now).hourKey)
    .then(async (mine) => (mine ? (await import("./billing/arrears.server")).runArrearsBilling(db, now) : { skipped: "already ran this hour" }))
    .catch((e) => ({ error: (e as Error).message }));
  // Once a day: drop WhatsApp reply-window rows older than a week.
  await claimJob(db, "wa_contacts_prune", istParts(now).date)
    .then(async (mine) => mine && (await import("./whatsappSend.server")).pruneWhatsappContacts(db, now))
    .catch(() => undefined);
  const lifecycle = await import("./lifecycle/lifecycle.server")
    .then((m) => m.runLifecycle(db, now))
    .then((r) => ({ ...r, sent: r.sent.length }))
    .catch((e) => ({ error: (e as Error).message }));
  return { gmail, queue, autoChase, chaser, renewals, arrears, lifecycle, ms: Date.now() - started };
}
