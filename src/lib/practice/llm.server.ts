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

function providers(): Provider[] {
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
  const gemini = env("GEMINI_API_KEY");
  if (gemini)
    list.push({
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: gemini,
      // A rolling alias: pinned versions get retired for new keys (2.5 Flash already is).
      model: env("GEMINI_MODEL") ?? "gemini-flash-latest",
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
    const res = await fetch(p.url, {
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
      }),
    });
    if (res.status === 429 || res.status >= 500)
      throw new RetryableError(`${p.name} ${res.status}`);
    if (!res.ok)
      throw new Error(
        `${p.name} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`,
      );
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    return {
      data: parseJsonLoose(raw),
      provider: p.name,
      model: p.model,
      latency_ms: Date.now() - started,
      raw,
    };
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new RetryableError(`${p.name} timed out`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function viaEdgeFunction(req: LlmJsonRequest): Promise<LlmJsonResult> {
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
  });
  if (res.status === 429 || res.status >= 500)
    throw new RetryableError(`practice-ai ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as {
    content?: string;
    provider?: string;
    model?: string;
    error?: string;
  };
  if (!res.ok || !body.content)
    throw new Error(body.error ?? `practice-ai ${res.status}`);
  return {
    data: parseJsonLoose(body.content),
    provider: body.provider ?? "edge",
    model: body.model ?? "unknown",
    latency_ms: Date.now() - started,
    raw: body.content,
  };
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
  opts: { timeoutMs?: number } = {},
): LlmClient | null {
  const list = providers();
  const edgeAvailable =
    Boolean(supabaseUrl() && env("SUPABASE_SERVICE_ROLE_KEY")) &&
    env("PRACTICE_AI_DISABLED") !== "1";
  if (!list.length && !edgeAvailable) return null;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  return {
    async json(req) {
      const usable = list.filter((p) => !req.attachment || p.vision);
      const errors: string[] = [];
      for (const p of usable) {
        try {
          return await withRetries(() => callProvider(p, req, timeoutMs));
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      if (edgeAvailable) {
        try {
          return await withRetries(() => viaEdgeFunction(req), 2);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      throw new Error(`AI unavailable: ${errors.join(" | ") || "no provider"}`);
    },
  };
}
