/**
 * Settings for the optional Unsiloed fallback reader. Everything is read from the environment, and the feature is OFF unless
 * UNSILOED_FALLBACK_ENABLED is exactly "true" AND UNSILOED_API_KEY and UNSILOED_BASE_URL are set. When it is off nothing else runs.
 *
 * NOTE: the vendor's request and response field names are configurable below and have NOT been checked against their documentation
 * (their site could not be reached from the build environment). Confirm them before switching the feature on.
 */
export type Tier = "fast" | "lite";

export interface UnsilodConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  /** Path that accepts a PDF to parse. Jobs are read back from `${parsePath}/${jobId}`. */
  parsePath: string;
  /** Value sent for each tier in the mode field. */
  modeNames: Record<Tier, string>;
  maxTier: Tier;
  /** A document with more pages than this is not sent. */
  maxPagesPerCall: number;
  /** Credits per page, per tier. */
  creditsPerPage: Record<Tier, number>;
  dailyCredits: number;
  monthlyCredits: number;
  /** At most this many jobs in flight; the vendor allows 5 on the Standard tier. */
  concurrency: number;
  timeoutMs: number;
  pollMs: number;
  maxPollMs: number;
  webhookSecret: string | null;
  signatureHeader: string;
  webhookUrl: string | null;
}

const num = (v: string | undefined, d: number, min = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && v !== undefined && v !== "" ? n : d;
};

export function readUnsilodConfig(
  env: Record<string, string | undefined> = process.env,
): UnsilodConfig {
  const key = (env["UNSILOED_API_KEY"] ?? "").trim();
  const base = (env["UNSILOED_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const enabled =
    env["UNSILOED_FALLBACK_ENABLED"] === "true" &&
    key.length > 0 &&
    /^https:\/\//.test(base);
  return {
    enabled,
    apiKey: key,
    baseUrl: base,
    parsePath: env["UNSILOED_PARSE_PATH"] ?? "/parse",
    modeNames: {
      fast: env["UNSILOED_MODE_FAST"] ?? "fast",
      lite: env["UNSILOED_MODE_LITE"] ?? "agentic_lite",
    },
    maxTier: env["UNSILOED_MAX_TIER"] === "fast" ? "fast" : "lite",
    maxPagesPerCall: Math.min(num(env["UNSILOED_MAX_PAGES"], 15, 1), 15),
    creditsPerPage: { fast: 5, lite: 15 },
    dailyCredits: num(env["UNSILOED_DAILY_CREDITS"], 250),
    monthlyCredits: Math.min(num(env["UNSILOED_MONTHLY_CREDITS"], 1800), 1900),
    concurrency: Math.min(
      Math.max(1, Math.floor(num(env["UNSILOED_CONCURRENCY"], 4, 1))),
      4,
    ),
    timeoutMs: num(env["UNSILOED_TIMEOUT_MS"], 20_000, 1000),
    pollMs: num(env["UNSILOED_POLL_MS"], 2_000, 200),
    maxPollMs: num(env["UNSILOED_MAX_POLL_MS"], 40_000, 1000),
    webhookSecret: (env["UNSILOED_WEBHOOK_SECRET"] ?? "").trim() || null,
    signatureHeader: (
      env["UNSILOED_SIGNATURE_HEADER"] ?? "x-unsiloed-signature"
    ).toLowerCase(),
    webhookUrl: (env["UNSILOED_WEBHOOK_URL"] ?? "").trim() || null,
  };
}
