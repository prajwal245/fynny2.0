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

/**
 * Reads a parse job. Documented shape: `status` (Starting, Queued, Processing, Succeeded, Failed, Cancelled), `chunks[].embed` (the
 * chunk as Markdown, tables included), `credit_used`, `page_count`, `job_id`. Other shapes are read tolerantly.
 */
export function readResult(j: Json): ParseResult {
  const status = String(j["status"] ?? "").toLowerCase();
  if (/^(failed|cancelled|canceled)$/.test(status))
    throw new Error(`Unsiloed job ${status}`);
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
        asObj(c)?.["embed"],
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
    fromChunks || null,
    j["content"],
    result["content"],
  );
  const done =
    /^(succeeded|done|completed|complete|success|finished)$/.test(status) ||
    (!status && markdown !== null);
  const usage = asObj(j["usage"]) ?? {};
  return {
    markdown: done ? markdown : null,
    jobId: firstString(j["job_id"], j["jobId"], j["id"], result["job_id"]),
    creditsUsed: firstNumber(
      j["credit_used"],
      j["credits_used"],
      j["creditsUsed"],
      usage["credits"],
      usage["credits_used"],
    ),
    pages: firstNumber(j["page_count"], j["pages"], usage["pages"]),
    pending: !done,
  };
}

export function createHttpClient(
  cfg: UnsilodConfig,
  fetchImpl: typeof fetch = fetch,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): UnsilodClient {
  const headers = { [cfg.authHeader]: cfg.apiKey, Accept: "application/json" };
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
      // The vendor asks for a poll every 3 to 5 seconds, with jitter.
      await sleep(cfg.pollMs + Math.floor(Math.random() * 800));
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
      // A statement's table runs over several pages; ask for it stitched into one.
      form.append("merge_tables", "true");
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
