/**
 * Where a model helps the agents, and only as a proposal. Each function tries the deterministic rules first, asks the model only
 * when the rules are unsure, checks the answer against the facts, and falls back to the rules on any failure.
 */
import { z } from "zod";
import type { LlmClient } from "../extract/pipeline";
import {
  UNTRUSTED_NOTE,
  createCache,
  guardedJson,
  redact,
  wrapUntrusted,
} from "./ai";
import { interpretReply, type ReplyProposal } from "./queryLoop";

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const replySchema = z.object({
  kind: z.enum(["stop", "promise", "answer", "unclear"]),
  promisedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1),
});

export type ReplyProposalAi = ReplyProposal & { source: "rules" | "ai" };
const replyCache = createCache<ReplyProposalAi>();

/** Reads a client's reply. Rules decide when sure; the model helps with free wording; a stop request is never downgraded. */
export async function interpretReplyAi(
  text: string,
  now: Date,
  llm: LlmClient | null,
): Promise<ReplyProposalAi> {
  const rules = interpretReply(text, now);
  const fromRules: ReplyProposalAi = { ...rules, source: "rules" };
  if (rules.kind === "stop" || rules.confidence >= 0.8 || !text.trim())
    return fromRules;
  const key = `${isoDay(now)}|${text.trim().toLowerCase()}`;
  const hit = replyCache.get(key);
  if (hit) return hit;
  const res = await guardedJson(
    llm,
    {
      purpose: "agent.reply",
      system: `You read a client's reply to an accounting firm's request for documents. ${UNTRUSTED_NOTE} Answer JSON only: {"kind":"stop|promise|answer|unclear","promisedDate":"YYYY-MM-DD or null","confidence":0..1}. "stop" = they ask not to be messaged. "promise" = they say when they will send it (give the date; today is ${isoDay(now)}). "answer" = they explain or send something. Otherwise "unclear".`,
      user: wrapUntrusted(redact(text).slice(0, 800)),
      maxTokens: 800,
    },
    replySchema,
  );
  if (!res.ok) return fromRules;
  const d = res.data;
  let kind = d.kind;
  let promisedDate = d.promisedDate ?? null;
  if (kind === "promise") {
    const t = promisedDate ? Date.parse(`${promisedDate}T00:00:00Z`) : NaN;
    const today = Date.parse(`${isoDay(now)}T00:00:00Z`);
    // A date in the past or months away is the model guessing: treat it as an answer for a person to read.
    if (!Number.isFinite(t) || t < today || t > today + 90 * DAY_MS) {
      kind = "answer";
      promisedDate = null;
    }
  } else promisedDate = null;
  const out: ReplyProposalAi = {
    ...rules,
    kind,
    promisedDate,
    confidence: Math.min(d.confidence, 0.9),
    source: "ai",
  };
  replyCache.set(key, out);
  return out;
}

const ledgerSchema = z.object({
  ledger: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200).optional(),
});
export interface LedgerProposal {
  ledger: string | null;
  confidence: number;
  reason: string;
  source: "ai";
  requiresConfirmation: true;
}

/** Suggests which of the firm's own ledgers a bank line belongs to. It can only pick from the list it is given. */
export async function aiSuggestLedger(
  narration: string,
  ledgers: readonly string[],
  llm: LlmClient | null,
): Promise<LedgerProposal | null> {
  const list = [...new Set(ledgers.map((l) => l.trim()).filter(Boolean))].slice(
    0,
    200,
  );
  if (!list.length || !narration.trim()) return null;
  const res = await guardedJson(
    llm,
    {
      purpose: "agent.ledger",
      system: `You help an accountant classify a bank statement line to one of the firm's ledgers. ${UNTRUSTED_NOTE} Pick exactly one name from the list, or null if none clearly fits. Answer JSON only: {"ledger":string|null,"confidence":0..1,"reason":"short"}.\nLedgers:\n${list.join("\n")}`,
      user: wrapUntrusted(redact(narration).slice(0, 300)),
      maxTokens: 800,
    },
    ledgerSchema,
  );
  if (!res.ok) return null;
  const chosen = res.data.ledger
    ? list.find(
        (l) => l.toLowerCase() === res.data.ledger!.trim().toLowerCase(),
      )
    : undefined;
  return {
    ledger: chosen ?? null,
    confidence: chosen ? Math.min(res.data.confidence, 0.85) : 0,
    reason: chosen ? (res.data.reason ?? "") : "No ledger clearly fits.",
    source: "ai",
    requiresConfirmation: true,
  };
}
