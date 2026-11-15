/**
 * A model answer that was billed but could not be used (the JSON did not parse, the answer was cut off) still cost money. The
 * token counts travel with the error so the call is logged with its real cost instead of vanishing from the totals.
 * Pure: shared by the model client, the extraction pipeline and the MIS narration.
 */
import type { AiCallRecord } from "./extract/pipeline";
import { tokenCostUsd } from "./aiPricing";

export interface Billed {
  provider: string;
  model: string;
  latency_ms: number;
  usage: { input_tokens: number | null; output_tokens: number | null };
}

/** The provider answered (and charged), but what it said could not be used. */
export class BilledError extends Error {
  constructor(
    message: string,
    public readonly billed: Billed,
  ) {
    super(message);
    this.name = "BilledError";
  }
}

/** No provider produced a usable answer. Carries every answer that was billed on the way. */
export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly billed: Billed[],
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Every billed-but-unusable answer behind an error. */
export function billedFrom(e: unknown): Billed[] {
  if (e instanceof BilledError) return [e.billed];
  if (e instanceof AiUnavailableError) return e.billed;
  // Errors that crossed a boundary lose their class: read the shape.
  const b = (e as { billed?: unknown } | null)?.billed;
  if (Array.isArray(b)) return b as Billed[];
  if (b && typeof b === "object") return [b as Billed];
  return [];
}

/**
 * The log rows for a failed AI call: one per answer that was billed, each with its tokens and cost, or a single empty row when
 * nothing was billed (a timeout, a refusal, a rate limit).
 */
export function failureRecords(purpose: string, input: string, startedAt: number, e: unknown): AiCallRecord[] {
  const message = e instanceof Error ? e.message : String(e);
  const billed = billedFrom(e);
  if (!billed.length)
    return [{ purpose, provider: null, model: null, input, output: null, latency_ms: Date.now() - startedAt, status: "error", error: message }];
  return billed.map((b) => ({
    purpose,
    provider: b.provider,
    model: b.model,
    input,
    output: null,
    latency_ms: b.latency_ms,
    status: "error" as const,
    error: `Billed but not usable: ${message}`.slice(0, 500),
    input_tokens: b.usage.input_tokens,
    output_tokens: b.usage.output_tokens,
    cost_usd: tokenCostUsd(b.model, b.usage.input_tokens, b.usage.output_tokens),
  }));
}
