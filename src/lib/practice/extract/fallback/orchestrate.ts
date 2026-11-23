/**
 * The optional Unsiloed fallback. It runs only AFTER the primary reader, only when the feature is switched on, and only when the
 * primary result is visibly wrong. Its output is never trusted on its own: the tables it returns go back through our own table
 * reader and the running-balance check, and the result is used only if that check passes. Every failure returns the primary
 * result untouched, so an upload is never blocked or failed by this layer.
 */
import type { ExtractOutcome } from "../pipeline";
import { applyHeuristics, scoreRow } from "../classify";
import { checkStatement } from "../statementCheck";
import { readUnsilodConfig, type Tier, type UnsilodConfig } from "./config";
import { createHttpClient, type UnsilodClient } from "./client";
import { fallbackReason, type FallbackReason } from "./gate";
import {
  createLimiter,
  memoryLedger,
  withBackoff,
  withinBudget,
  type CreditLedger,
} from "./limits";
import { rowsFromMarkdown } from "./markdown";

export interface FallbackRecord {
  parser_source: "unsiloed_fast" | "unsiloed_lite";
  reason: FallbackReason;
  credit_used: number;
  pages: number;
  tiers_tried: Tier[];
  job_id: string | null;
  at: string;
  day: string;
}
export interface FallbackPending {
  job_id: string;
  tier: Tier;
  reason: FallbackReason;
  credits_estimate: number;
  pages: number;
  at: string;
  day: string;
}
/** Set on the outcome when the fallback changed something, or left a job running. */
export interface FallbackOutcome {
  record?: FallbackRecord;
  pending?: FallbackPending;
}
export interface StoredResult {
  tier: Tier;
  markdown: string;
  credits_used: number | null;
  pages: number | null;
  job_id: string | null;
}

export interface FallbackContext {
  bytes: Uint8Array;
  filename: string;
  side: string;
  /** A finished job the webhook stored for this document: used instead of calling the vendor again. */
  stored?: StoredResult | null;
  /** A ledger, or a function that makes one. The function is called only once a document actually qualifies, so a disabled or unneeded fallback costs nothing. */
  ledger?: CreditLedger | (() => CreditLedger);
}
export interface FallbackDeps {
  env?: Record<string, string | undefined>;
  client?: UnsilodClient;
  now?: () => Date;
  log?: (event: Record<string, unknown>) => void;
  /** For tests: replaces the real wait between retries. */
  sleep?: (ms: number) => Promise<void>;
}

const limiters = new Map<number, ReturnType<typeof createLimiter>>();
const limiterFor = (n: number) =>
  limiters.get(n) ?? limiters.set(n, createLimiter(n)).get(n)!;
const sharedLedger = memoryLedger();

/** Counts the pages of a PDF from its page objects. 0 when it cannot tell, and the fallback then does not run. */
export function countPdfPages(bytes: Uint8Array): number {
  if (bytes.length > 15 * 1024 * 1024) return 0;
  const text = new TextDecoder("latin1").decode(bytes);
  const n = (text.match(/\/Type\s*\/Page(?![\w])/g) ?? []).length;
  return n;
}

const usable = (rows: ExtractOutcome["rows"]) =>
  rows.filter(
    (r) =>
      r.route === "transaction" && r.date && r.amount != null && r.direction,
  );

export async function withUnsiloedFallback(
  primary: ExtractOutcome,
  ctx: FallbackContext,
  deps: FallbackDeps = {},
): Promise<ExtractOutcome> {
  const cfg = readUnsilodConfig(deps.env);
  if (!cfg.enabled) return primary;
  const log =
    deps.log ??
    ((e: Record<string, unknown>) =>
      console.log(JSON.stringify({ fn: "unsiloed_fallback", ...e })));
  try {
    return await run(primary, ctx, cfg, deps, log);
  } catch (e) {
    log({
      event: "failed_open",
      error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    });
    return primary;
  }
}

async function run(
  primary: ExtractOutcome,
  ctx: FallbackContext,
  cfg: UnsilodConfig,
  deps: FallbackDeps,
  log: (e: Record<string, unknown>) => void,
): Promise<ExtractOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const ok = usable(primary.rows);
  const check = ok.length
    ? checkStatement(
        ok.map((r) => ({
          index: r.row_index,
          date: r.date!,
          amount: r.amount!,
          direction: r.direction!,
          balance: r.balance ?? null,
        })),
      )
    : null;
  const reason = fallbackReason({
    kind: primary.kind,
    side: ctx.side,
    documentKind: primary.documentKind,
    filename: ctx.filename,
    hasRegister: Boolean(primary.register),
    errorCode: primary.error?.code ?? null,
    sourceTextLength: primary.sourceText.length,
    rows: primary.rows,
    check,
  });
  if (!reason) return primary;

  const pages = countPdfPages(ctx.bytes);
  if (pages < 1 || pages > cfg.maxPagesPerCall) {
    log({
      event: "skipped",
      why: pages < 1 ? "pages_unknown" : "too_many_pages",
      pages,
    });
    return primary;
  }

  const tiers: Tier[] = cfg.maxTier === "fast" ? ["fast"] : ["fast", "lite"];
  const client = deps.client ?? createHttpClient(cfg);
  const ledger =
    typeof ctx.ledger === "function"
      ? ctx.ledger()
      : (ctx.ledger ?? sharedLedger);
  const tried: Tier[] = [];
  let spent = 0;

  const accept = (
    tier: Tier,
    markdown: string,
    creditsUsed: number | null,
    jobId: string | null,
  ): ExtractOutcome | null => {
    const parsed = rowsFromMarkdown(markdown, "bank");
    if (!parsed) return null;
    const scored = parsed.map((r) => {
      const s = scoreRow(applyHeuristics(r, "bank"), undefined);
      return { ...s, raw_text: `[parser:unsiloed_${tier}] ${s.raw_text}` };
    });
    const good = usable(scored);
    if (good.length < 3) return null;
    const verdict = checkStatement(
      good.map((r) => ({
        index: r.row_index,
        date: r.date!,
        amount: r.amount!,
        direction: r.direction!,
        balance: r.balance ?? null,
      })),
    );
    // Used only if the running balance ties on nearly every line; otherwise it is no better than what we had.
    if (
      verdict.breaks.length > 0 ||
      verdict.status === "fail" ||
      verdict.withBalance < good.length * 0.8
    )
      return null;
    const credit = spent || creditsUsed || 0; // all tiers tried, not just the last
    return {
      ...primary,
      rows: scored,
      duplicateRows: 0,
      error: null,
      note: `${primary.note ?? ""} Read by the fallback reader (${tier}) because the primary reader's result did not tie.`.trim(),
      fallback: {
        record: {
          parser_source: `unsiloed_${tier}`,
          reason,
          credit_used: credit,
          pages,
          tiers_tried: [...tried],
          job_id: jobId,
          at: now.toISOString(),
          day: now.toISOString().slice(0, 10),
        },
      },
    };
  };

  // A job the webhook finished earlier: no new call, no new credits.
  if (ctx.stored) {
    const out = accept(
      ctx.stored.tier,
      ctx.stored.markdown,
      ctx.stored.credits_used,
      ctx.stored.job_id,
    );
    if (out) {
      tried.push(ctx.stored.tier);
      return out;
    }
  }

  for (const tier of tiers) {
    const cost = pages * cfg.creditsPerPage[tier];
    const used = await ledger.used(now);
    if (!withinBudget(used, cost, cfg)) {
      log({ event: "budget_stop", tier, cost, used });
      break;
    }
    tried.push(tier);
    await ledger.record(cost, now);
    spent += cost;
    const res = await limiterFor(cfg.concurrency)(() =>
      withBackoff(
        () => client.parse({ bytes: ctx.bytes, filename: ctx.filename, tier }),
        { sleep: deps.sleep },
      ),
    );
    if (res.creditsUsed != null && res.creditsUsed !== cost) {
      await ledger.record(res.creditsUsed - cost, now);
      spent += res.creditsUsed - cost;
    }
    log({
      event: "parsed",
      tier,
      reason,
      pages,
      credit_used: spent,
      pending: res.pending,
      job_id: res.jobId,
    });
    if (res.pending) {
      // Still running: leave the primary result in place and let the webhook finish it.
      if (!res.jobId) return primary;
      return {
        ...primary,
        fallback: {
          pending: {
            job_id: res.jobId,
            tier,
            reason,
            credits_estimate: cost,
            pages,
            at: now.toISOString(),
            day: now.toISOString().slice(0, 10),
          },
        },
      };
    }
    const out = res.markdown
      ? accept(tier, res.markdown, res.creditsUsed, res.jobId)
      : null;
    if (out) return out;
    log({ event: "did_not_tie", tier });
  }
  return primary;
}
