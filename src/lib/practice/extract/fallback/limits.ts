/** Concurrency cap, exponential backoff on rate limits, and a credit ledger. No I/O of their own. */

/** Runs at most `max` jobs at once; the rest wait their turn in order. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((res) => waiting.push(res));
    active += 1;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export class UnsilodHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "UnsilodHttpError";
  }
}

export interface BackoffOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Retries only on a rate limit (429) or a brief outage (503), waiting longer each time and honouring Retry-After. Anything else throws at once. */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  o: BackoffOptions = {},
): Promise<T> {
  const retries = o.retries ?? 3;
  const base = o.baseMs ?? 500;
  const cap = o.maxMs ?? 8_000;
  const sleep =
    o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable =
        e instanceof UnsilodHttpError && (e.status === 429 || e.status === 503);
      if (!retryable || attempt >= retries) throw e;
      const wait = Math.min(
        cap,
        (e as UnsilodHttpError).retryAfterMs ?? base * 2 ** attempt,
      );
      await sleep(wait);
    }
  }
}

export interface CreditLedger {
  /** Credits used today and this month (UTC). A ledger that cannot be read must throw, and the fallback then does not run. */
  used(now: Date): Promise<{ day: number; month: number }>;
  record(credits: number, now: Date): Promise<void>;
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Process-local ledger, for tests and as a floor when no shared one is available. */
export function memoryLedger(): CreditLedger {
  const byDay = new Map<string, number>();
  return {
    async used(now) {
      const day = dayKey(now);
      let month = 0;
      for (const [k, v] of byDay)
        if (k.slice(0, 7) === day.slice(0, 7)) month += v;
      return { day: byDay.get(day) ?? 0, month };
    },
    async record(credits, now) {
      byDay.set(dayKey(now), (byDay.get(dayKey(now)) ?? 0) + credits);
    },
  };
}

export function withinBudget(
  used: { day: number; month: number },
  cost: number,
  cfg: { dailyCredits: number; monthlyCredits: number },
) {
  return (
    used.day + cost <= cfg.dailyCredits &&
    used.month + cost <= cfg.monthlyCredits
  );
}
