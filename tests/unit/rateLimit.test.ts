import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, decide, requestIp, slidingCount, type Policy } from "@/lib/rateLimit.server";

const P: Policy = { name: "t", limit: 3, windowSec: 60 };

describe("sliding window maths", () => {
  it("weighs the previous window by the time left", () => {
    // 15s into a 60s window: 75% of the previous window still counts
    expect(slidingCount(2, 4, 60, 15_000)).toBeCloseTo(2 + 4 * 0.75);
    expect(slidingCount(2, 4, 60, 0)).toBe(6);
  });
  it("allows up to the limit and blocks beyond it", () => {
    expect(decide(3, 0, P, 30_000, "memory").allowed).toBe(true);
    const d = decide(4, 0, P, 30_000, "memory");
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(d.retryAfterSec).toBeLessThanOrEqual(60);
  });
  it("does not allow a double burst across a window edge", () => {
    // 3 used just before the edge, 3 more right after: 3 + 3*~1 > 3
    expect(decide(3, 3, P, 1_000, "memory").allowed).toBe(false);
  });
});

describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("RATE_LIMIT_DISABLED", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("blocks the 4th call and keeps subjects separate", async () => {
    const subject = `s-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect((await checkRateLimit(P, subject)).allowed).toBe(true);
    const blocked = await checkRateLimit(P, subject);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect((await checkRateLimit(P, `other-${Math.random()}`)).allowed).toBe(true);
  });
  it("can be switched off", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    const subject = `off-${Math.random()}`;
    for (let i = 0; i < 10; i++) expect((await checkRateLimit(P, subject)).allowed).toBe(true);
  });
});

describe("requestIp", () => {
  it("prefers the platform header over a spoofable one", () => {
    const req = new Request("https://x.test", { headers: { "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" } });
    expect(requestIp(req)).toBe("1.2.3.4");
  });
});
