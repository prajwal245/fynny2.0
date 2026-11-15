// COPY of src/lib/practice/aiPricing.ts for edge functions (they cannot import from src).
// tests/unit/aiPricingEdge.test.ts fails if the two tables disagree. Change both together.
export type Rate = readonly [input: number, output: number];

interface Window {
  /** First day this rate applies (UTC, YYYY-MM-DD), or open. */
  from?: string;
  /** Last day this rate applies, or open. */
  to?: string;
  rate: Rate;
  /** Prompts above 200k tokens are billed at this rate instead (Pro models). */
  long?: Rate;
}

interface Entry {
  /** Matched as a substring of the model name, lower case, most specific first. */
  match: string;
  windows: Window[];
  /** From this day the model's requests are billed as another model (Google retires it and routes it on). */
  routedFrom?: { day: string; as: string };
}

const FLASH_38: Window[] = [
  { to: "2026-12-31", rate: [0.75, 3.75] },
  { from: "2027-01-01", rate: [1.5, 7.5] },
];
const FRONTIER: Window[] = [
  { to: "2026-11-30", rate: [2, 10] },
  { from: "2026-12-01", rate: [4, 20] },
];

/**
 * First match wins. The "-latest" names are aliases that Google points at its newest model of the kind: `gemini-flash-latest` is
 * priced as Gemini 3.8 Flash and `gemini-flash-lite-latest` as Gemini 3.5 Flash-Lite, because those are the newest of each on the
 * Nov 2026 price list. Pin GEMINI_MODEL / GEMINI_FALLBACK_MODEL to a version in Vercel so an alias moving cannot move the bill.
 */
const DEFAULT_RATES: Entry[] = [
  { match: "gemini-4-carbon", windows: FRONTIER },
  { match: "gemini-4-argon", windows: FRONTIER },
  { match: "gemini-4-hydrogen", windows: [{ rate: [1.5, 7.5] }] },
  { match: "gemini-3.8-flash", windows: FLASH_38 },
  { match: "gemini-3.6-flash", windows: FLASH_38 },
  { match: "gemini-3.5-flash-lite", windows: [{ rate: [0.3, 2.5] }] },
  { match: "gemini-3.1-flash-lite", windows: [{ rate: [0.25, 1.5] }] },
  { match: "gemini-3.1-pro", windows: [{ rate: [2, 12], long: [4, 18] }] },
  { match: "gemini-3-flash", windows: [{ rate: [0.5, 3] }] },
  // Retired models: from 1 Dec 2026 Google bills their requests at the rate of the model it routes them to.
  { match: "gemini-2.5-pro", windows: [{ to: "2026-11-30", rate: [1.25, 10], long: [2.5, 15] }], routedFrom: { day: "2026-12-01", as: "gemini-3.8-flash" } },
  { match: "gemini-2.5-flash-lite", windows: [{ rate: [0.1, 0.4] }] },
  { match: "gemini-2.5-flash", windows: [{ rate: [0.3, 2.5] }], routedFrom: { day: "2026-12-01", as: "gemini-3.5-flash-lite" } },
  { match: "gemini-flash-lite-latest", windows: [{ rate: [0.3, 2.5] }] },
  { match: "gemini-flash-latest", windows: FLASH_38 },
  { match: "llama-3.3-70b", windows: [{ rate: [0.59, 0.79] }] },
  { match: "llama", windows: [{ rate: [0.2, 0.2] }] },
];

/** A model we do not know is priced high rather than low: an estimate that is too small hides spend. */
const FALLBACK: Rate = [0.75, 3.75];

function overrides(): Entry[] {
  const raw = Deno.env.get("AI_PRICING_JSON");
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(o).flatMap(([k, v]): Entry[] =>
      Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && n >= 0) ? [{ match: k.toLowerCase(), windows: [{ rate: [v[0], v[1]] as Rate }] }] : [],
    );
  } catch {
    return [];
  }
}

const day = (at: Date) => at.toISOString().slice(0, 10);
const clean = (model: string | null | undefined) => (model ?? "").toLowerCase().replace(/^models\//, "").replace(/^google\//, "").trim();

function windowFor(entries: Entry[], model: string, at: Date): { rate: Rate; long?: Rate } | null {
  const d = day(at);
  for (const e of entries) {
    if (!model.includes(e.match)) continue;
    if (e.routedFrom && d >= e.routedFrom.day) return windowFor(entries, e.routedFrom.as, at);
    const w = e.windows.find((x) => (!x.from || d >= x.from) && (!x.to || d <= x.to)) ?? e.windows[e.windows.length - 1]!;
    return { rate: w.rate, ...(w.long ? { long: w.long } : {}) };
  }
  return null;
}

/** The [input, output] rate for a model on a day. `inputTokens` picks the long-prompt rate on Pro models. */
export function rateFor(model: string | null | undefined, at: Date = new Date(), inputTokens?: number | null): Rate {
  const m = clean(model);
  const w = windowFor([...overrides(), ...DEFAULT_RATES], m, at);
  if (!w) return FALLBACK;
  return w.long && (inputTokens ?? 0) > 200_000 ? w.long : w.rate;
}

/** True when the model is on the price list (or overridden); false means the FALLBACK rate was used. */
export function rateKnown(model: string | null | undefined, at: Date = new Date()): boolean {
  return windowFor([...overrides(), ...DEFAULT_RATES], clean(model), at) !== null;
}

/** USD for one call, rounded to 6 places. Null when the provider reported no tokens. */
export function tokenCostUsd(model: string | null | undefined, inputTokens: number | null | undefined, outputTokens: number | null | undefined, at: Date = new Date()): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  const [pin, pout] = rateFor(model, at, inputTokens);
  const usd = ((inputTokens ?? 0) * pin + (outputTokens ?? 0) * pout) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * The output tokens Google bills for a call. The OpenAI-style `completion_tokens` leaves out the model's thinking tokens, which are
 * billed as output; `total_tokens` includes them, so the billed output is total minus prompt whenever that is larger.
 */
export function billedOutputTokens(u: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } | null } | null | undefined): number | null {
  if (!u) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const prompt = num(u.prompt_tokens);
  const completion = num(u.completion_tokens);
  const total = num(u.total_tokens);
  const reasoning = num(u.completion_tokens_details?.reasoning_tokens);
  if (prompt !== null && total !== null && total - prompt >= (completion ?? 0)) return total - prompt;
  if (completion !== null) return completion + (reasoning ?? 0);
  return null;
}


export function usdInr(): number {
  const n = Number(Deno.env.get("USD_INR_RATE") ?? "");
  return Number.isFinite(n) && n > 10 && n < 500 ? n : 88;
}

/** Cost of a call when only the total is known (chat logs): assume 80% input, 20% output. Marked as an estimate by the caller. */
export function costFromTotal(model: string | null | undefined, total: number | null | undefined): number | null {
  if (total == null) return null;
  return tokenCostUsd(model, Math.round(total * 0.8), Math.round(total * 0.2));
}
