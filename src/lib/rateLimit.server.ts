/**
 * Rate limiting for every API action.
 *
 * Algorithm: sliding-window counter. Each bucket keeps a count for the current
 * and the previous window; the weighted sum (previous × time left in the
 * current window + current) is compared to the limit. That stops the 2× burst
 * at window edges that a plain fixed window allows, and costs one round trip.
 *
 * Store (shared by every server instance, so limits are real at any scale):
 *   1. Upstash Redis, when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 *   2. Otherwise Postgres, through the rate_limit_hit() function.
 *   3. If the store is down, a per-instance in-memory counter takes over, so a
 *      store outage never takes the product down and never leaves it unprotected.
 *
 * RATE_LIMIT_DISABLED=1 switches everything off (local debugging only).
 */

export interface Policy {
  /** Short name; part of the bucket key and shown in logs. */
  name: string;
  limit: number;
  windowSec: number;
}

/** Named policies. Tune here; every call site refers to these by name. */
export const POLICIES = {
  /** Every server-function call from one network address. */
  sfnIp: { name: "sfn_ip", limit: 600, windowSec: 60 },
  /** Every server-function call from one signed-in user. */
  sfnUser: { name: "sfn_user", limit: 300, windowSec: 60 },
  /** One server function, one user: stops a runaway loop on a single action. */
  sfnUserFn: { name: "sfn_user_fn", limit: 120, windowSec: 60 },
  /** Public API routes, per address. */
  publicIp: { name: "public_ip", limit: 120, windowSec: 60 },
  /** Provider webhooks (Meta, Razorpay) share addresses across many firms. */
  webhookIp: { name: "webhook_ip", limit: 3000, windowSec: 60 },
  /** WhatsApp sign-up codes: one per 30 seconds and 3 a day per number, 15 an hour per address, 8 tries per 10 minutes. */
  otpGap: { name: "otp_gap", limit: 1, windowSec: 30 },
  otpPhone: { name: "otp_phone", limit: 3, windowSec: 86400 },
  otpIp: { name: "otp_ip", limit: 15, windowSec: 3600 },
  otpVerify: { name: "otp_verify", limit: 8, windowSec: 600 },
  /** Anonymous forms (waitlist, callbacks), per address. */
  anonForm: { name: "anon_form", limit: 20, windowSec: 3600 },
  /** Tries at a locked file's password: per firm and document, so a password cannot be guessed. */
  passwordTry: { name: "password_try", limit: 12, windowSec: 3600 },
  /** No-login upload links: per address and per link. */
  uploadIp: { name: "upload_ip", limit: 60, windowSec: 600 },
  uploadToken: { name: "upload_token", limit: 40, windowSec: 600 },
  /** Tally connector uploads, per connector token. */
  connector: { name: "connector", limit: 600, windowSec: 3600 },
  connectorHello: { name: "connector_hello", limit: 180, windowSec: 3600 },
} as const satisfies Record<string, Policy>;

export interface Decision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a retry can succeed. */
  retryAfterSec: number;
  /** Which store answered. */
  store: "redis" | "postgres" | "memory";
}

export class RateLimitedError extends Error {
  readonly statusCode = 429;
  constructor(public readonly decision: Decision, message = "Too many requests. Please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitedError";
  }
}

/* ── pure maths (tested) ─────────────────────────────────────── */

/** Weighted request count over the last full window. */
export function slidingCount(current: number, previous: number, windowSec: number, nowMs: number): number {
  const elapsed = (nowMs / 1000) % windowSec;
  return current + previous * (1 - elapsed / windowSec);
}

export function decide(
  current: number,
  previous: number,
  policy: Policy,
  nowMs: number,
  store: Decision["store"],
): Decision {
  const used = slidingCount(current, previous, policy.windowSec, nowMs);
  const allowed = used <= policy.limit;
  const elapsed = (nowMs / 1000) % policy.windowSec;
  const left = policy.windowSec - elapsed;
  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, Math.floor(policy.limit - used)),
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil(Math.min(left, policy.windowSec))),
    store,
  };
}

/* ── stores ──────────────────────────────────────────────────── */

type Counts = { current: number; previous: number };

const memory = new Map<string, number>();
let lastSweep = 0;
function memoryHit(bucket: string, windowSec: number, nowMs: number, cost: number): Counts {
  const w = Math.floor(nowMs / 1000 / windowSec);
  if (nowMs - lastSweep > 60_000) {
    lastSweep = nowMs;
    for (const k of memory.keys()) {
      const win = Number(k.slice(k.lastIndexOf("@") + 1));
      if (win < w - 1 && memory.size > 0) memory.delete(k);
    }
    if (memory.size > 50_000) memory.clear(); // hard ceiling on memory
  }
  const key = `${bucket}@${w}`;
  const current = (memory.get(key) ?? 0) + cost;
  memory.set(key, current);
  return { current, previous: memory.get(`${bucket}@${w - 1}`) ?? 0 };
}

async function redisHit(bucket: string, windowSec: number, nowMs: number, cost: number): Promise<Counts> {
  const url = process.env["UPSTASH_REDIS_REST_URL"]!.replace(/\/$/, "");
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"]!;
  const w = Math.floor(nowMs / 1000 / windowSec);
  const cur = `rl:${bucket}:${w}`;
  const prev = `rl:${bucket}:${w - 1}`;
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify([["INCRBY", cur, cost], ["EXPIRE", cur, windowSec * 2 + 5], ["GET", prev]]),
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  if (out[0]?.error) throw new Error(out[0].error);
  return { current: Number(out[0]?.result ?? cost), previous: Number(out[2]?.result ?? 0) || 0 };
}

async function postgresHit(bucket: string, windowSec: number, cost: number): Promise<Counts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The generated types do not list this function yet.
  const rpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: { o_current: number; o_previous: number }[] | null; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabaseAdmin, "rate_limit_hit", { p_bucket: bucket, p_window: windowSec, p_cost: cost });
  if (error || !data?.[0]) throw new Error(error?.message ?? "no answer");
  return { current: data[0].o_current, previous: data[0].o_previous };
}

function storeConfigured(): "redis" | "postgres" | null {
  if (process.env["UPSTASH_REDIS_REST_URL"] && process.env["UPSTASH_REDIS_REST_TOKEN"]) return "redis";
  const hasDb =
    Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]) &&
    Boolean(process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"]);
  return hasDb ? "postgres" : null;
}

/* ── public API ──────────────────────────────────────────────── */

const off = () => process.env["RATE_LIMIT_DISABLED"] === "1";
let lastWarn = 0;

/** Counts one hit against `policy` for `subject` and says whether it may proceed. */
export async function checkRateLimit(policy: Policy, subject: string, cost = 1): Promise<Decision> {
  if (off() || !subject) return { allowed: true, limit: policy.limit, remaining: policy.limit, retryAfterSec: 0, store: "memory" };
  const bucket = `${policy.name}:${subject.slice(0, 200)}`;
  const now = Date.now();
  const store = storeConfigured();
  if (store) {
    try {
      const counts = store === "redis" ? await redisHit(bucket, policy.windowSec, now, cost) : await postgresHit(bucket, policy.windowSec, cost);
      return decide(counts.current, counts.previous, policy, now, store);
    } catch (e) {
      if (now - lastWarn > 60_000) {
        lastWarn = now;
        console.warn(`[rate-limit] ${store} store unavailable, using in-memory counters:`, (e as Error).message);
      }
    }
  }
  const c = memoryHit(bucket, policy.windowSec, now, cost);
  return decide(c.current, c.previous, policy, now, "memory");
}

/** Standard headers for a decision. */
export function rateLimitHeaders(d: Decision): Record<string, string> {
  const h: Record<string, string> = {
    "ratelimit-limit": String(d.limit),
    "ratelimit-remaining": String(d.remaining),
  };
  if (!d.allowed) h["retry-after"] = String(d.retryAfterSec);
  return h;
}

/** A ready 429 answer for a route handler. */
export function tooManyResponse(d: Decision, message = "Too many requests. Please wait a moment and try again."): Response {
  return new Response(JSON.stringify({ ok: false, reason: "rate_limited", error: message, message, retryAfterSec: d.retryAfterSec }), {
    status: 429,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...rateLimitHeaders(d) },
  });
}

/** For route handlers: returns a 429 Response when over the limit, otherwise null. */
export async function limitRequest(policy: Policy, subject: string, message?: string): Promise<Response | null> {
  const d = await checkRateLimit(policy, subject);
  return d.allowed ? null : tooManyResponse(d, message);
}

/** For server code: throws RateLimitedError when over the limit. */
export async function enforceRateLimit(policy: Policy, subject: string, message?: string, cost = 1): Promise<Decision> {
  const d = await checkRateLimit(policy, subject, cost);
  if (!d.allowed) throw new RateLimitedError(d, message);
  return d;
}

/** The caller's network address, using the platform's trusted headers first. */
export function requestIp(req: Request): string {
  const first = (v: string | null) => (v ?? "").split(",")[0]?.trim() ?? "";
  const ip = first(req.headers.get("x-vercel-forwarded-for")) || first(req.headers.get("x-real-ip")) || first(req.headers.get("x-forwarded-for"));
  return ip.replace(/^::ffff:/, "") || "unknown";
}

/** Drops counters older than two days. Called from the daily tick. */
export async function pruneRateLimits(): Promise<number> {
  if (storeConfigured() !== "postgres") return 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rpc = supabaseAdmin.rpc as unknown as (fn: string) => Promise<{ data: number | null }>;
    const { data } = await rpc.call(supabaseAdmin, "rate_limit_prune");
    return data ?? 0;
  } catch {
    return 0;
  }
}
