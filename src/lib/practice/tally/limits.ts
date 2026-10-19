/** Small pure helpers for protecting the agent endpoint and spotting old agents. */

/** Fixed-window attempt limiter. `hit` returns false once a key is over its limit. */
export function createLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const seen = new Map<string, { n: number; reset: number }>();
  return {
    hit(key: string, now = Date.now()): boolean {
      // keep the map small: drop expired windows when it grows
      if (seen.size > 5000) for (const [k, v] of seen) if (v.reset <= now) seen.delete(k);
      const cur = seen.get(key);
      if (!cur || cur.reset <= now) {
        seen.set(key, { n: 1, reset: now + windowMs });
        return true;
      }
      cur.n += 1;
      return cur.n <= max;
    },
  };
}

/** The newest agent FynHelp ships. Must match AGENT_VERSION in tools/tally-agent/lib.mjs (a test checks). */
export const LATEST_AGENT_VERSION = "0.2.0";

/** True when version `a` is older than `b`. Unknown or malformed versions count as old. */
export function isOlder(a: string | null | undefined, b: string): boolean {
  const parse = (v: string) => v.split(".").map((x) => Number.parseInt(x, 10));
  if (!a || !/^\d+\.\d+\.\d+$/.test(a)) return true;
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}
