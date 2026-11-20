/**
 * AI client for the practice agents (server only).
 *
 * Provider order for text: Groq → Lovable AI Gateway → Google Gemini.
 * Files (scanned PDFs, photos) need a vision model: Lovable Gateway → Gemini.
 * If none of those keys is visible to this runtime, calls are proxied through
 * the `practice-ai` edge function, which has the Lovable Cloud AI key.
 * Rate limits and 5xx errors are retried with backoff, then the next provider
 * is tried. The caller logs every call (see ca_ai_calls).
 */
import type {
  LlmClient,
  LlmJsonRequest,
  LlmJsonResult,
} from "./extract/pipeline";
import { billedOutputTokens } from "./aiPricing";
import { AiUnavailableError, BilledError, billedFrom, type Billed } from "./aiBilled";

interface Provider {
  name: string;
  url: string;
  key: string;
  model: string;
  vision: boolean;
}

function env(name: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

const supabaseUrl = () =>
  env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL") ?? import.meta.env.VITE_SUPABASE_URL;

/** The Gemini key, under the names it is commonly saved as. */
function geminiKey(): string | undefined {
  return env("GEMINI_API_KEY") ?? env("GOOGLE_API_KEY") ?? env("GOOGLE_GENERATIVE_AI_API_KEY") ?? env("GEMINI_KEY");
}

/** What this deployment can reach, without any key value: for the owner's "check the AI reader" button. */
export async function checkAiProviders(): Promise<{ configured: string[]; edge: boolean; results: { provider: string; ok: boolean; ms: number; detail: string }[] }> {
  const list = providers();
  const edge = Boolean(supabaseUrl() && env("SUPABASE_SERVICE_ROLE_KEY")) && env("PRACTICE_AI_DISABLED") !== "1" && !residencyIndiaOnly();
  const results: { provider: string; ok: boolean; ms: number; detail: string }[] = [];
  for (const p of list) {
    const t0 = Date.now();
    try {
      const r = await callProvider(p, { purpose: "ai_check", system: "Reply with JSON only.", user: 'Return {"ok": true}.' } as LlmJsonRequest, 15_000);
      results.push({ provider: `${p.name} (${p.model})`, ok: true, ms: Date.now() - t0, detail: r.raw.slice(0, 40) });
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).replace(/(AIza[0-9A-Za-z_-]{10,}|sk-[0-9A-Za-z_-]{10,}|key=[^&\s]+)/g, "[key]");
      results.push({ provider: `${p.name} (${p.model})`, ok: false, ms: Date.now() - t0, detail: m.slice(0, 200) });
    }
  }
  // In India-only mode say so, so an empty list reads as a decision and not as a fault.
  if (residencyIndiaOnly()) results.unshift({ provider: "India-only mode", ok: true, ms: 0, detail: list.length ? `AI limited to: ${indiaAiHosts().join(", ")}` : "AI reading is off: no Indian AI endpoint is configured, so documents are read by rules only." });
  return { configured: list.map((p) => p.name), edge, results };
}

/**
 * Indian data residency. With PRACTICE_DATA_RESIDENCY=india no client document text or image leaves India for an AI model: only an
 * endpoint whose host is on the allow-list (PRACTICE_AI_INDIA_HOSTS, default Google Vertex AI in Mumbai) may be used, and the shared
 * edge function and every other provider are switched off. With none allowed, reading falls back to rules and nothing is sent anywhere.
 */
export const residencyIndiaOnly = () => (env("PRACTICE_DATA_RESIDENCY") ?? "").toLowerCase() === "india";
export const indiaAiHosts = () => (env("PRACTICE_AI_INDIA_HOSTS") ?? "asia-south1-aiplatform.googleapis.com").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
export const allowedByResidency = (url: string) => {
  if (!residencyIndiaOnly()) return true;
  try { return indiaAiHosts().includes(new URL(url).hostname.toLowerCase()); } catch { return false; }
};

function providers(): Provider[] {
  return rawProviders().filter((p) => allowedByResidency(p.url));
}

function rawProviders(): Provider[] {
  const list: Provider[] = [];
  const groq = env("GROQ_API_KEY");
  if (groq)
    list.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: groq,
      model: env("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
      vision: false,
    });
  const lovable = env("LOVABLE_API_KEY");
  if (lovable)
    list.push({
      name: "lovable",
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovable,
      model: env("LOVABLE_AI_MODEL") ?? "google/gemini-2.5-flash",
      vision: true,
    });
  const gemini = geminiKey();
  if (gemini)
    list.push({
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: gemini,
      // A rolling alias: pinned versions get retired for new keys (2.5 Flash already is).
      model: env("GEMINI_MODEL") ?? "gemini-flash-latest",
      vision: true,
    });
  // Flash is often "experiencing high demand" (503); Flash-Lite usually is not.
  if (gemini)
    list.push({
      name: "gemini-lite",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: gemini,
      model: env("GEMINI_FALLBACK_MODEL") ?? "gemini-flash-lite-latest",
      vision: true,
    });
  return list;
}

export function parseJsonLoose(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("AI response was not JSON");
}

class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildMessages(req: LlmJsonRequest) {
  const user = req.attachment
    ? [
        { type: "text", text: req.user },
        {
          type: "image_url",
          image_url: {
            url: `data:${req.attachment.mime};base64,${req.attachment.base64}`,
          },
        },
      ]
    : req.user;
  return [
    { role: "system", content: req.system },
    { role: "user", content: user },
  ];
}

async function callProvider(
  p: Provider,
  req: LlmJsonRequest,
  timeoutMs: number,
): Promise<LlmJsonResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Reading a statement is transcription, not reasoning: Gemini's default thinking makes a page take 40 seconds or more and bills
    // for the thinking. A low effort keeps the answer and cuts the time. A provider that refuses the field is asked again without it.
    const effort = p.name.startsWith("gemini") ? (env("GEMINI_REASONING_EFFORT") ?? "low") : null;
    const send = (withEffort: boolean) =>
      fetch(p.url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${p.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: p.model,
          messages: buildMessages(req),
          temperature: 0.1,
          response_format: { type: "json_object" },
          max_tokens: req.maxTokens ?? (Number(env("PRACTICE_AI_MAX_OUTPUT_TOKENS") ?? "") || 16_000),
          ...(withEffort && effort && effort !== "default" ? { reasoning_effort: effort } : {}),
        }),
      });
    let res = await send(true);
    if (res.status === 400 && effort) {
      const text = await res.clone().text().catch(() => "");
      if (/reasoning|effort|thinking/i.test(text)) res = await send(false);
    }
    if (res.status === 429 || res.status >= 500)
      throw new RetryableError(`${p.name} ${res.status}`);
    if (!res.ok)
      throw new Error(
        `${p.name} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`,
      );
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } | null };
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    // Output as Google bills it: the answer plus the model's thinking tokens.
    const usage = {
      input_tokens: typeof body.usage?.prompt_tokens === "number" ? body.usage.prompt_tokens : null,
      output_tokens: billedOutputTokens(body.usage),
    };
    let data: unknown;
    try {
      data = parseJsonLoose(raw);
    } catch (e) {
      // The answer was billed. Keep its tokens with the error, so the cost is logged rather than lost.
      throw new BilledError((e as Error).message, { provider: p.name, model: p.model, latency_ms: Date.now() - started, usage });
    }
    return { data, provider: p.name, model: p.model, latency_ms: Date.now() - started, raw, usage };
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new RetryableError(`${p.name} timed out`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function viaEdgeFunction(req: LlmJsonRequest, timeoutMs = 30_000): Promise<LlmJsonResult> {
  const url = supabaseUrl();
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("No AI provider configured");
  const started = Date.now();
  const res = await fetch(`${url}/functions/v1/practice-ai`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: Error) => {
    if (e.name === "TimeoutError" || e.name === "AbortError") throw new RetryableError("practice-ai timed out");
    throw e;
  });
  if (res.status === 429 || res.status >= 500)
    throw new RetryableError(`practice-ai ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as {
    content?: string;
    provider?: string;
    model?: string;
    error?: string;
    usage?: { input_tokens?: number | null; output_tokens?: number | null };
  };
  if (!res.ok || !body.content)
    throw new Error(body.error ?? `practice-ai ${res.status}`);
  const usage = { input_tokens: body.usage?.input_tokens ?? null, output_tokens: body.usage?.output_tokens ?? null };
  let data: unknown;
  try {
    data = parseJsonLoose(body.content);
  } catch (e) {
    throw new BilledError((e as Error).message, { provider: body.provider ?? "edge", model: body.model ?? "unknown", latency_ms: Date.now() - started, usage });
  }
  return { data, provider: body.provider ?? "edge", model: body.model ?? "unknown", latency_ms: Date.now() - started, raw: body.content, usage };
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof RetryableError)) throw e;
      await sleep(800 * 2 ** i);
    }
  }
  throw last;
}

export function practiceLlm(
  opts: { timeoutMs?: number; budgetMs?: number } = {},
): LlmClient | null {
  const list = providers();
  const edgeAvailable =
    Boolean(supabaseUrl() && env("SUPABASE_SERVICE_ROLE_KEY")) &&
    env("PRACTICE_AI_DISABLED") !== "1" &&
    // The shared edge function may run outside India, so it is not used in India-only mode.
    !residencyIndiaOnly();
  if (!list.length && !edgeAvailable) return null;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  // The whole server call is cut off at 60 s, so every AI call made with this
  // client (all reads, providers and retries together) gives up well before that.
  const deadline = Date.now() + (opts.budgetMs ?? 35_000);
  return {
    async json(req) {
      const left = () => {
        const ms = deadline - Date.now();
        if (ms < 3_000) throw new Error("AI took too long");
        return Math.min(timeoutMs, ms);
      };
      const usable = list.filter((p) => !req.attachment || p.vision);
      const errors: string[] = [];
      // Answers that were billed but unusable, across every provider tried.
      const billed: Billed[] = [];
      for (const [i, p] of usable.entries()) {
        // Move on quickly when another provider can answer instead.
        const attempts = i < usable.length - 1 || edgeAvailable ? 2 : 3;
        try {
          return await withRetries(() => callProvider(p, req, left()), attempts);
        } catch (e) {
          billed.push(...billedFrom(e));
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      if (edgeAvailable) {
        try {
          return await withRetries(() => viaEdgeFunction(req, left()), 2);
        } catch (e) {
          billed.push(...billedFrom(e));
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      throw new AiUnavailableError(`AI unavailable: ${errors.join(" | ") || "no provider"}`, billed);
    },
  };
}

/**
 * Safety valve, not a limit: a firm's AI calls in the last 24 hours (PRACTICE_AI_DAILY_CAP, default 100,000). It exists only so a
 * runaway loop cannot run up the AI bill; normal use, including reading every page of long statements, never meets it. Past it,
 * reading and the MIS carry on with the rule-based path. Set a lower PRACTICE_AI_DAILY_CAP in the environment to restore a limit.
 */
export async function withinAiCap(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  firmId: string,
): Promise<boolean> {
  const cap = Number(env("PRACTICE_AI_DAILY_CAP") ?? "") || 100_000;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await db.from("ca_ai_calls").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).gte("created_at", since);
  if (error) return true;
  if ((count ?? 0) >= cap) {
    console.warn(`[ai] firm ${firmId} reached the daily AI cap (${cap}); using rules only`);
    return false;
  }
  // Token budget as well as call count: a few very large calls cost more than many small ones. Checked only for a firm with real volume,
  // so an ordinary day costs one count query and nothing more.
  if ((count ?? 0) >= 300) {
    const tokenCap = Number(env("PRACTICE_AI_DAILY_TOKENS") ?? "") || 40_000_000;
    const { data } = await db.from("ca_ai_calls").select("input_tokens, output_tokens").eq("ca_firm_id", firmId).gte("created_at", since).limit(5000);
    const used = ((data ?? []) as { input_tokens: number | null; output_tokens: number | null }[]).reduce((n, r) => n + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
    if (used >= tokenCap) {
      console.warn(`[ai] firm ${firmId} used ${used} AI tokens in 24 hours (limit ${tokenCap}); using rules only`);
      return false;
    }
  }
  return true;
}
