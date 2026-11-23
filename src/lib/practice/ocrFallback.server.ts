/**
 * OCR fallback through OpenRouter: a strict, verbatim transcription by Mistral OCR, with Pixtral as the next model.
 *
 * Used when the primary scan reader (OCR.space) fails, returns nothing, leaves "[ILLEGIBLE]" tags, or returns a statement whose fields
 * look wrong; or as the only reader when OCR.space is not configured. The text it returns is not trusted on its own: it goes through
 * the same checks as every other reading (amounts must appear in the text, statement rows must reconcile to the printed balance).
 *
 * Off unless OPENROUTER_API_KEY is set. Never used in India-only data-residency mode. Nothing here logs file content or the key.
 */
import { residencyIndiaOnly } from "./llm.server";

/** The instruction every strict read is given, verbatim. */
export const STRICT_OCR_PROMPT = `You are a high-precision OCR and document extraction engine for financial and document processing. Transcribe all visible text, numbers, tables, and structured fields from the provided image or document with 100% verbatim accuracy.

Strict Rules:

1. Verbatim Extraction: Transcribe text, amounts, dates, account numbers, and IDs exactly as they appear. Do not auto-correct typos or normalize formatting.
2. Layout and Tables: Preserve spatial structure. Format multi-column data, line items, or statements using clean Markdown tables. Maintain top-to-bottom, left-to-right reading order.
3. Zero Hallucination: Never guess, infer, or autocomplete blurred or cut-off digits/characters. Mark unreadable text strictly as [ILLEGIBLE].
4. No Commentary: Output ONLY the extracted content with zero introductory or closing remarks.`;

export interface OpenRouterOcrConfig {
  key: string;
  endpoint: string;
  /** Tried in this order: OpenRouter moves on to the next when one is unavailable. */
  models: string[];
  timeoutMs: number;
  maxBytes: number;
}

export interface OcrResult {
  text: string;
  provider: string;
  model: string | null;
  cost_usd: number | null;
  /** Why the fallback was used, for the activity log. */
  note?: string;
}
export type OcrFn = (
  bytes: Uint8Array,
  mime: string,
) => Promise<string | OcrResult>;

const DEFAULT_MODELS = [
  "mistralai/mistral-ocr-latest",
  "mistralai/pixtral-large-2411",
];

export function readOpenRouterConfig(
  env: Record<string, string | undefined> = process.env,
): OpenRouterOcrConfig | null {
  const key = (env["OPENROUTER_API_KEY"] ?? "").trim();
  if (!key || env["OPENROUTER_OCR_DISABLED"] === "1") return null;
  const models = (env["OPENROUTER_OCR_MODELS"] ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const n = (v: string | undefined, d: number) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d;
  return {
    key,
    endpoint:
      (env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1").replace(
        /\/+$/,
        "",
      ) + "/chat/completions",
    models: models.length ? models : DEFAULT_MODELS,
    timeoutMs: n(env["OPENROUTER_OCR_TIMEOUT_MS"], 55_000),
    maxBytes: n(env["OPENROUTER_OCR_MAX_BYTES"], 12_000_000),
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The request body: temperature 0, a fallback chain of models, and, for a PDF, the file-parser plugin with the Mistral OCR engine. */
export function buildOpenRouterRequest(
  bytes: Uint8Array,
  mime: string,
  cfg: Pick<OpenRouterOcrConfig, "models">,
) {
  const dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
  const isPdf = mime === "application/pdf";
  const part = isPdf
    ? { type: "file", file: { filename: "document.pdf", file_data: dataUrl } }
    : { type: "image_url", image_url: { url: dataUrl } };
  return {
    model: cfg.models[0],
    models: cfg.models,
    route: "fallback",
    temperature: 0,
    messages: [
      { role: "system", content: STRICT_OCR_PROMPT },
      {
        role: "user",
        content: [{ type: "text", text: "Transcribe this document." }, part],
      },
    ],
    ...(isPdf
      ? { plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }] }
      : {}),
  };
}

/** Pipes of a Markdown table become column gaps, so the statement readers see the same layout they read in a text PDF. Separator rows go. */
export function markdownToLayoutText(md: string): string {
  return md
    .split(/\r?\n/)
    .filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l))
    .map((l) =>
      /^\s*\|.*\|\s*$/.test(l)
        ? l
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim())
            .join("   ")
        : l,
    )
    .join("\n")
    .trim();
}

const redact = (s: string, key: string) =>
  s
    .split(key)
    .join("[key]")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[key]");

/** One strict read. Throws with a short reason that never contains the key. */
export async function openRouterOcr(
  bytes: Uint8Array,
  mime: string,
  cfg: OpenRouterOcrConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<OcrResult> {
  if (bytes.length > cfg.maxBytes)
    throw new Error(
      `File is over the fallback reader's size limit (${Math.round(cfg.maxBytes / 1_000_000)} MB)`,
    );
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(cfg.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        "X-Title": "FynHelp",
      },
      body: JSON.stringify(buildOpenRouterRequest(bytes, mime, cfg)),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Fallback reader answered ${res.status}`);
    const j = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string | { text?: string }[] } }[];
      usage?: { cost?: number };
      error?: { message?: string };
    };
    if (j.error)
      throw new Error(
        `Fallback reader: ${String(j.error.message ?? "error").slice(0, 160)}`,
      );
    const c = j.choices?.[0]?.message?.content;
    const raw =
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c.map((p) => p.text ?? "").join("\n")
          : "";
    const text = markdownToLayoutText(
      raw.replace(/^```(?:markdown|md)?\s*\n?|\n?```\s*$/g, ""),
    ).trim();
    if (!text) throw new Error("Fallback reader returned nothing");
    return {
      text,
      provider: "openrouter",
      model: j.model ?? cfg.models[0] ?? null,
      cost_usd: typeof j.usage?.cost === "number" ? j.usage.cost : null,
    };
  } catch (e) {
    const name = (e as Error).name;
    if (name === "AbortError") throw new Error("Fallback reader timed out");
    throw new Error(redact((e as Error).message, cfg.key));
  } finally {
    clearTimeout(timer);
  }
}

const DATE =
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}[ -](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -]\d{2,4}\b/gi;
const AMOUNT = /\b\d{1,3}(?:,\d{2,3})*\.\d{2}\b/g;

/** Whether the text is usable. A tag for unreadable text, or a statement with almost no dates and amounts, is not. */
export function assessOcr(text: string): { ok: boolean; why: string | null } {
  if (!text.trim()) return { ok: false, why: "empty" };
  if (/\[ILLEGIBLE\]/i.test(text)) return { ok: false, why: "illegible" };
  const looksLikeStatement =
    /\b(balance|debit|credit|withdrawal|deposit|narration|particulars)\b/i.test(
      text,
    );
  if (
    looksLikeStatement &&
    ((text.match(DATE) ?? []).length < 3 ||
      (text.match(AMOUNT) ?? []).length < 3)
  )
    return { ok: false, why: "fields" };
  return { ok: true, why: null };
}

const asResult = (r: string | OcrResult, provider: string): OcrResult =>
  typeof r === "string"
    ? { text: r, provider, model: null, cost_usd: null }
    : r;

/**
 * The primary reader first. The fallback is used when the primary fails, reads nothing, or reads text that fails assess().
 * If the fallback also fails, the primary's text is kept; if there is none, the error is raised as before.
 */
export function composeOcr(
  primary: OcrFn | null,
  fallback: ((bytes: Uint8Array, mime: string) => Promise<OcrResult>) | null,
): OcrFn | null {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;
  return async (bytes, mime) => {
    let first: OcrResult | null = null;
    let firstError: unknown = null;
    try {
      first = asResult(await primary(bytes, mime), "ocr.space");
    } catch (e) {
      firstError = e;
    }
    const verdict = first ? assessOcr(first.text) : { ok: false, why: "error" };
    if (first && verdict.ok) return first;
    try {
      const second = await fallback(bytes, mime);
      const secondOk = assessOcr(second.text).ok;
      // Keep the primary's text if it was at least readable and the fallback is no better.
      if (first && first.text.trim() && !secondOk && verdict.why !== "empty")
        return first;
      return {
        ...second,
        note: `used because the primary reader ${verdict.why === "error" ? "failed" : `gave ${verdict.why} text`}`,
      };
    } catch (e) {
      if (first && first.text.trim()) return first;
      throw firstError ?? e;
    }
  };
}

/** The fallback reader, or null when it is not configured or the deployment keeps documents in India. */
export function openRouterFallback(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): ((bytes: Uint8Array, mime: string) => Promise<OcrResult>) | null {
  if (
    (env["PRACTICE_DATA_RESIDENCY"] ?? "").toLowerCase() === "india" ||
    residencyIndiaOnly()
  )
    return null;
  const cfg = readOpenRouterConfig(env);
  return cfg
    ? (bytes, mime) => openRouterOcr(bytes, mime, cfg, fetchImpl)
    : null;
}
