/**
 * What an AI or OCR call cost, worked out from the token counts the provider
 * returns. Rates are USD per 1 million tokens and are ESTIMATES (list prices
 * change, and the Lovable gateway bills its own way): the admin screen labels
 * the totals "est." Override any rate without a deploy by setting
 * AI_PRICING_JSON, for example {"flash-lite":[0.1,0.4],"llama":[0.59,0.79]}
 * (substring of the model name → [input, output]).
 */
export type Rate = readonly [input: number, output: number];

/** First match wins, so the more specific names come first. */
const DEFAULT_RATES: [string, Rate][] = [
  ["flash-lite", [0.1, 0.4]],
  ["flash", [0.3, 2.5]],
  ["llama-3.3-70b", [0.59, 0.79]],
  ["llama", [0.2, 0.2]],
];
const FALLBACK: Rate = [0.3, 2.5];

function overrides(): [string, Rate][] {
  const raw = typeof process !== "undefined" ? process.env["AI_PRICING_JSON"] : undefined;
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(o).flatMap(([k, v]): [string, Rate][] =>
      Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && n >= 0) ? [[k.toLowerCase(), [v[0], v[1]] as Rate]] : [],
    );
  } catch {
    return [];
  }
}

export function rateFor(model: string | null | undefined): Rate {
  const m = (model ?? "").toLowerCase();
  for (const [k, r] of [...overrides(), ...DEFAULT_RATES]) if (m.includes(k)) return r;
  return FALLBACK;
}

/** USD for one call, rounded to 6 places. Null when the provider reported no tokens. */
export function tokenCostUsd(model: string | null | undefined, inputTokens: number | null | undefined, outputTokens: number | null | undefined): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  const [pin, pout] = rateFor(model);
  const usd = ((inputTokens ?? 0) * pin + (outputTokens ?? 0) * pout) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** OCR.space is free on the free plan; set OCR_SPACE_COST_USD_PER_CALL when on a paid plan. */
export function ocrCostUsd(): number {
  const n = Number(typeof process !== "undefined" ? process.env["OCR_SPACE_COST_USD_PER_CALL"] : "");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Fields to add to an ai-call log row from a provider answer. */
export function usageFields(res: { model?: string | null; usage?: { input_tokens: number | null; output_tokens: number | null } | null }) {
  const input_tokens = res.usage?.input_tokens ?? null;
  const output_tokens = res.usage?.output_tokens ?? null;
  return { input_tokens, output_tokens, cost_usd: tokenCostUsd(res.model, input_tokens, output_tokens) };
}
