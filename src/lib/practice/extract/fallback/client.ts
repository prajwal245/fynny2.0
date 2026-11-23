/**
 * The HTTP side of the fallback reader. One small interface so the rest can be tested with a fake. Field names are read tolerantly
 * and the paths come from configuration; none of it has been checked against the vendor's documentation (see config.ts).
 */
import type { Tier, UnsilodConfig } from "./config";
import { UnsilodHttpError } from "./limits";

export interface ParseRequest {
  bytes: Uint8Array;
  filename: string;
  tier: Tier;
}
export interface ParseResult {
  /** Structured text with the statement's tables, or null while the job is still running. */
  markdown: string | null;
  jobId: string | null;
  creditsUsed: number | null;
  pages: number | null;
  pending: boolean;
}
export interface UnsilodClient {
  parse(req: ParseRequest): Promise<ParseResult>;
  /** Reads a job that was left running (used by the webhook). */
  fetchJob(jobId: string): Promise<ParseResult>;
}

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null =>
  v && typeof v === "object" ? (v as Json) : null;
const firstString = (...v: unknown[]) =>
  v.find((x): x is string => typeof x === "string" && x.length > 0) ?? null;
const firstNumber = (...v: unknown[]) =>
  v.find((x): x is number => typeof x === "number" && Number.isFinite(x)) ??
  null;

/** Reads the answer whatever its exact shape: a markdown field, a result or output object, or a list of chunks. */
export function readResult(j: Json): ParseResult {
  const result =
    asObj(j["result"]) ?? asObj(j["output"]) ?? asObj(j["data"]) ?? {};
  const chunks = (
    Array.isArray(j["chunks"])
      ? j["chunks"]
      : Array.isArray(result["chunks"])
        ? result["chunks"]
        : []
  ) as unknown[];
  const fromChunks = chunks
    .map((c) =>
      firstString(
        asObj(c)?.["markdown"],
        asObj(c)?.["content"],
        asObj(c)?.["text"],
      ),
    )
    .filter(Boolean)
    .join("\n\n");
  const markdown = firstString(
    j["markdown"],
    result["markdown"],
    j["content"],
    result["content"],
    fromChunks || null,
  );
  const status = String(j["status"] ?? result["status"] ?? "").toLowerCase();
  const done =
    /^(done|completed|complete|succeeded|success|finished)$/.test(status) ||
    (!status && markdown !== null);
  const usage = asObj(j["usage"]) ?? {};
  return {
    markdown: done ? markdown : null,
    jobId: firstString(j["job_id"], j["jobId"], j["id"], result["job_id"]),
    creditsUsed: firstNumber(
      j["credits_used"],
      j["creditsUsed"],
      usage["credits"],
      usage["credits_used"],
    ),
    pages: firstNumber(j["pages"], j["page_count"], usage["pages"]),
    pending: !done,
  };
}

export function createHttpClient(
  cfg: UnsilodConfig,
  fetchImpl: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): UnsilodClient {
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    Accept: "application/json",
  };
  const call = async (url: string, init: RequestInit): Promise<Json> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: ctl.signal,
        headers: { ...headers, ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        const ra = Number(res.headers.get("retry-after"));
        throw new UnsilodHttpError(
          res.status,
          `Unsiloed answered ${res.status}`,
          Number.isFinite(ra) && ra > 0 ? ra * 1000 : null,
        );
      }
      return (await res.json()) as Json;
    } finally {
      clearTimeout(timer);
    }
  };
  const poll = async (first: ParseResult): Promise<ParseResult> => {
    let r = first;
    const until = Date.now() + cfg.maxPollMs;
    while (r.pending && r.jobId && Date.now() < until) {
      await sleep(cfg.pollMs);
      r = readResult(
        await call(
          `${cfg.baseUrl}${cfg.parsePath}/${encodeURIComponent(r.jobId)}`,
          { method: "GET" },
        ),
      );
    }
    return r;
  };
  return {
    async parse(req) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([req.bytes as BlobPart], { type: "application/pdf" }),
        req.filename,
      );
      form.append("mode", cfg.modeNames[req.tier]);
      if (cfg.webhookUrl) form.append("webhook_url", cfg.webhookUrl);
      return poll(
        readResult(
          await call(`${cfg.baseUrl}${cfg.parsePath}`, {
            method: "POST",
            body: form,
          }),
        ),
      );
    },
    async fetchJob(jobId) {
      return readResult(
        await call(
          `${cfg.baseUrl}${cfg.parsePath}/${encodeURIComponent(jobId)}`,
          { method: "GET" },
        ),
      );
    },
  };
}
