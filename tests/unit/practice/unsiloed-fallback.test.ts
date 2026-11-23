import { describe, expect, it, vi } from "vitest";
import type { ExtractOutcome } from "@/lib/practice/extract/pipeline";
import { applyHeuristics, scoreRow } from "@/lib/practice/extract/classify";
import {
  withUnsiloedFallback,
  countPdfPages,
} from "@/lib/practice/extract/fallback/orchestrate";
import { readUnsilodConfig } from "@/lib/practice/extract/fallback/config";
import { fallbackReason } from "@/lib/practice/extract/fallback/gate";
import {
  UnsilodHttpError,
  createLimiter,
  memoryLedger,
  withBackoff,
} from "@/lib/practice/extract/fallback/limits";
import {
  markdownTables,
  rowsFromMarkdown,
} from "@/lib/practice/extract/fallback/markdown";
import {
  readResult,
  type UnsilodClient,
} from "@/lib/practice/extract/fallback/client";
import {
  signatureValid,
  readWebhook,
} from "@/lib/practice/extract/fallback/webhook";

const ON = {
  UNSILOED_FALLBACK_ENABLED: "true",
  UNSILOED_API_KEY: "k",
  UNSILOED_BASE_URL: "https://api.example.test",
};
const pdf = (pages: number) =>
  new TextEncoder().encode(
    `%PDF-1.4\n${Array.from({ length: pages }, () => "<< /Type /Page /Parent 1 0 R >>").join("\n")}\n/Type /Pages`,
  );
const quiet = { log: () => undefined, sleep: async () => undefined };

/** A statement as the primary reader would give it: rows read, with the running balance either tying or not. */
type Raw = {
  date: string;
  amount: number;
  direction: "in" | "out";
  balance: number;
};
const outcome = (
  raw: Raw[],
  over: Partial<ExtractOutcome> = {},
): ExtractOutcome => ({
  kind: "pdf",
  rows: raw.map((r, i) =>
    scoreRow(
      applyHeuristics(
        {
          row_index: i + 1,
          raw_text: `row ${i}`,
          date: r.date,
          amount: r.amount,
          direction: r.direction,
          description: `NEFT PARTY ${i}`,
          counterparty: null,
          reference: null,
          category: null,
          currency: "INR",
          balance: r.balance,
          parse_confidence: 0.95,
          parse_issues: [],
        },
        "bank",
      ),
      undefined,
    ),
  ),
  duplicateRows: 0,
  sourceText: "STATEMENT OF ACCOUNT ".repeat(40),
  aiCalls: [],
  documentKind: "bank_statement",
  error: null,
  ...over,
});
const GOOD: Raw[] = [
  { date: "2026-03-02", amount: 1000, direction: "out", balance: 9000 },
  { date: "2026-03-03", amount: 500, direction: "in", balance: 9500 },
  { date: "2026-03-04", amount: 2500, direction: "out", balance: 7000 },
  { date: "2026-03-05", amount: 700, direction: "out", balance: 6300 },
  { date: "2026-03-06", amount: 4000, direction: "in", balance: 10300 },
];
const BROKEN = GOOD.map((r, i) => (i === 2 ? { ...r, balance: 7777 } : r));
const table = (rows: Raw[]) =>
  [
    "| Date | Narration | Withdrawal | Deposit | Balance |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r, i) =>
        `| ${r.date.slice(8)}/${r.date.slice(5, 7)}/${r.date.slice(0, 4)} | NEFT PARTY ${i} | ${r.direction === "out" ? r.amount.toFixed(2) : ""} | ${r.direction === "in" ? r.amount.toFixed(2) : ""} | ${r.balance.toFixed(2)} |`,
    ),
  ].join("\n");
const fake = (
  answers: (string | Error | { pending: string })[],
): UnsilodClient & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async parse({ tier }) {
      calls.push(tier);
      const a = answers.shift();
      if (a instanceof Error) throw a;
      if (a && typeof a === "object")
        return {
          markdown: null,
          jobId: a.pending,
          creditsUsed: null,
          pages: null,
          pending: true,
        };
      return {
        markdown: a ?? null,
        jobId: "j1",
        creditsUsed: null,
        pages: null,
        pending: false,
      };
    },
    async fetchJob() {
      return {
        markdown: null,
        jobId: null,
        creditsUsed: null,
        pages: null,
        pending: true,
      };
    },
  };
};
const ctx = (pages = 2, extra = {}) => ({
  bytes: pdf(pages),
  filename: "CA statement.pdf",
  side: "bank",
  ledger: memoryLedger(),
  ...extra,
});

describe("the fallback is off unless it is fully configured", () => {
  const bad = outcome(BROKEN);
  for (const [name, env] of [
    ["by default", {}],
    ["flag false", { ...ON, UNSILOED_FALLBACK_ENABLED: "false" }],
    ["no key", { ...ON, UNSILOED_API_KEY: "" }],
    ["no base url", { ...ON, UNSILOED_BASE_URL: "" }],
    ["plain http url", { ...ON, UNSILOED_BASE_URL: "http://insecure.test" }],
  ] as const)
    it(`never calls the vendor ${name}, and returns the primary result itself`, async () => {
      const client = fake([table(GOOD)]);
      const res = await withUnsiloedFallback(bad, ctx(), {
        env: env as Record<string, string>,
        client,
        ...quiet,
      });
      expect(res).toBe(bad);
      expect(client.calls).toEqual([]);
    });
});

describe("it runs only when the primary result is visibly wrong", () => {
  it("does not call the vendor when the running balance ties", async () => {
    const client = fake([table(GOOD)]);
    const primary = outcome(GOOD);
    expect(
      await withUnsiloedFallback(primary, ctx(), { env: ON, client, ...quiet }),
    ).toBe(primary);
    expect(client.calls).toEqual([]);
  });
  it("skips tax and return files, loans, books and non-PDFs", () => {
    const base = {
      kind: "pdf",
      side: "bank",
      documentKind: "bank_statement",
      filename: "CA.pdf",
      hasRegister: false,
      errorCode: null,
      sourceTextLength: 5000,
      rows: [],
      check: null,
    };
    expect(fallbackReason(base)).toBe("no_rows");
    for (const f of [
      "26AS FY24.pdf",
      "AIS part 1.pdf",
      "ITR-6.pdf",
      "Form 3CD.pdf",
      "GSTR-3B Mar.pdf",
    ])
      expect(fallbackReason({ ...base, filename: f }), f).toBeNull();
    expect(
      fallbackReason({ ...base, documentKind: "loan_statement" }),
    ).toBeNull();
    expect(fallbackReason({ ...base, side: "books" })).toBeNull();
    expect(fallbackReason({ ...base, kind: "xlsx" })).toBeNull();
    expect(
      fallbackReason({ ...base, errorCode: "password_needed" }),
    ).toBeNull();
    expect(fallbackReason({ ...base, sourceTextLength: 10 })).toBeNull();
  });
  it("names the three triggers", () => {
    const row = {
      date: "2026-03-02",
      amount: 5,
      direction: "out",
      route: "transaction",
    };
    const base = {
      kind: "pdf",
      side: "bank",
      documentKind: "bank_statement",
      filename: "a.pdf",
      hasRegister: false,
      errorCode: null,
      sourceTextLength: 5000,
    };
    expect(fallbackReason({ ...base, rows: [], check: null })).toBe("no_rows");
    expect(
      fallbackReason({
        ...base,
        rows: [row, { ...row, date: null }],
        check: null,
      }),
    ).toBe("missing_fields");
    expect(
      fallbackReason({
        ...base,
        rows: [row],
        check: { status: "fail", breaks: [] },
      }),
    ).toBe("balance_mismatch");
    expect(
      fallbackReason({
        ...base,
        rows: [row],
        check: { status: "pass", breaks: [] },
      }),
    ).toBeNull();
  });
  it("respects the page cap", async () => {
    const client = fake([table(GOOD)]);
    const primary = outcome(BROKEN);
    expect(
      await withUnsiloedFallback(primary, ctx(16), {
        env: ON,
        client,
        ...quiet,
      }),
    ).toBe(primary);
    expect(client.calls).toEqual([]);
  });
});

describe("recovery and escalation", () => {
  it("recovers a messy statement with the fast tier, only when the balance then ties", async () => {
    const client = fake([table(GOOD)]);
    const primary = outcome(BROKEN);
    const res = await withUnsiloedFallback(primary, ctx(2), {
      env: ON,
      client,
      ...quiet,
    });
    expect(client.calls).toEqual(["fast"]);
    expect(res.rows).toHaveLength(5);
    expect(res.fallback?.record).toMatchObject({
      parser_source: "unsiloed_fast",
      reason: "balance_mismatch",
      credit_used: 10,
      pages: 2,
      tiers_tried: ["fast"],
    });
    expect(
      res.rows.every((r) => r.raw_text.startsWith("[parser:unsiloed_fast]")),
    ).toBe(true);
    expect(res.rows.map((r) => r.balance)).toEqual(GOOD.map((r) => r.balance));
  });
  it("recovers a statement the primary read as nothing", async () => {
    const res = await withUnsiloedFallback(
      outcome([], { error: { code: "layout_unreadable", message: "x" } }),
      ctx(1),
      { env: ON, client: fake([table(GOOD)]), ...quiet },
    );
    expect(res.rows).toHaveLength(5);
    expect(res.error).toBeNull();
    expect(res.fallback?.record?.reason).toBe("no_rows");
  });
  it("escalates once to lite when fast does not tie, and counts both tiers' credits", async () => {
    const client = fake([table(BROKEN), table(GOOD)]);
    const res = await withUnsiloedFallback(outcome(BROKEN), ctx(2), {
      env: ON,
      client,
      ...quiet,
    });
    expect(client.calls).toEqual(["fast", "lite"]);
    expect(res.fallback?.record).toMatchObject({
      parser_source: "unsiloed_lite",
      credit_used: 2 * 5 + 2 * 15,
      tiers_tried: ["fast", "lite"],
    });
  });
  it("stops at fast when the max tier is fast, and never goes beyond lite", async () => {
    const client = fake([table(BROKEN), table(GOOD)]);
    const primary = outcome(BROKEN);
    expect(
      await withUnsiloedFallback(primary, ctx(2), {
        env: { ...ON, UNSILOED_MAX_TIER: "fast" },
        client,
        ...quiet,
      }),
    ).toBe(primary);
    expect(client.calls).toEqual(["fast"]);
    const c2 = fake([table(BROKEN), table(BROKEN), table(GOOD)]);
    await withUnsiloedFallback(primary, ctx(2), {
      env: ON,
      client: c2,
      ...quiet,
    });
    expect(c2.calls).toEqual(["fast", "lite"]);
  });
  it("keeps the primary result when neither tier ties", async () => {
    const primary = outcome(BROKEN);
    const res = await withUnsiloedFallback(primary, ctx(2), {
      env: ON,
      client: fake([table(BROKEN), table(BROKEN)]),
      ...quiet,
    });
    expect(res).toBe(primary);
  });
});

describe("it fails open", () => {
  const primary = () => outcome(BROKEN);
  it("returns the primary result on a rate limit that does not clear", async () => {
    const client = fake(
      Array.from({ length: 10 }, () => new UnsilodHttpError(429, "slow down")),
    );
    const p = primary();
    expect(
      await withUnsiloedFallback(p, ctx(), { env: ON, client, ...quiet }),
    ).toBe(p);
    expect(client.calls.length).toBe(4); // one try and three retries, then it gives up
  });
  it("returns the primary result on a server error, a timeout or garbage", async () => {
    for (const a of [
      new UnsilodHttpError(500, "boom"),
      new Error("aborted"),
      "not a table at all",
    ]) {
      const p = primary();
      expect(
        await withUnsiloedFallback(p, ctx(), {
          env: ON,
          client: fake([a, a]),
          ...quiet,
        }),
      ).toBe(p);
    }
  });
  it("does not spend past the daily budget", async () => {
    const ledger = memoryLedger();
    await ledger.record(250, new Date());
    const client = fake([table(GOOD)]);
    const p = primary();
    expect(
      await withUnsiloedFallback(p, ctx(2, { ledger }), {
        env: ON,
        client,
        ...quiet,
      }),
    ).toBe(p);
    expect(client.calls).toEqual([]);
  });
  it("fails open when the credit ledger cannot be read", async () => {
    const ledger = {
      used: async () => {
        throw new Error("db down");
      },
      record: async () => undefined,
    };
    const client = fake([table(GOOD)]);
    const p = primary();
    expect(
      await withUnsiloedFallback(p, ctx(2, { ledger }), {
        env: ON,
        client,
        ...quiet,
      }),
    ).toBe(p);
    expect(client.calls).toEqual([]);
  });
  it("leaves a still-running job for the webhook, keeping the primary rows", async () => {
    const p = primary();
    const res = await withUnsiloedFallback(p, ctx(2), {
      env: ON,
      client: fake([{ pending: "job-9" }]),
      ...quiet,
    });
    expect(res.rows).toBe(p.rows);
    expect(res.fallback?.pending).toMatchObject({
      job_id: "job-9",
      tier: "fast",
      credits_estimate: 10,
    });
  });
  it("uses a job the webhook stored without calling the vendor", async () => {
    const client = fake([]);
    const res = await withUnsiloedFallback(
      primary(),
      ctx(2, {
        stored: {
          tier: "fast",
          markdown: table(GOOD),
          credits_used: 10,
          pages: 2,
          job_id: "job-9",
        },
      }),
      { env: ON, client, ...quiet },
    );
    expect(client.calls).toEqual([]);
    expect(res.fallback?.record?.parser_source).toBe("unsiloed_fast");
  });
});

describe("limits", () => {
  it("never runs more than the cap at once", async () => {
    const run = createLimiter(4);
    let live = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 12 }, () =>
        run(async () => {
          live++;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, 5));
          live--;
        }),
      ),
    );
    expect(peak).toBe(4);
  });
  it("caps configured concurrency at 4 and pages at 15", () => {
    const c = readUnsilodConfig({
      ...ON,
      UNSILOED_CONCURRENCY: "9",
      UNSILOED_MAX_PAGES: "40",
      UNSILOED_MONTHLY_CREDITS: "5000",
    });
    expect(c.concurrency).toBe(4);
    expect(c.maxPagesPerCall).toBe(15);
    expect(c.monthlyCredits).toBeLessThan(2000);
  });
  it("backs off exponentially, honours Retry-After, and does not retry other errors", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    let n = 0;
    const out = await withBackoff(
      async () => {
        if (++n < 4)
          throw new UnsilodHttpError(429, "x", n === 2 ? 3000 : null);
        return "ok";
      },
      { sleep },
    );
    expect(out).toBe("ok");
    expect(waits).toEqual([500, 3000, 2000]);
    const fn = vi.fn(async () => {
      throw new UnsilodHttpError(401, "no");
    });
    await expect(withBackoff(fn, { sleep })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("reading what comes back", () => {
  it("reads a statement split across pages, with the header missing on the second", () => {
    const [a, b] = [
      table(GOOD.slice(0, 3)),
      table(GOOD.slice(3)).split("\n").slice(2).join("\n"),
    ];
    expect(markdownTables(`${a}\n\nPage 2\n\n${b}`)).toHaveLength(2);
    const rows = rowsFromMarkdown(`${a}\n\nPage 2\n\n${b}`)!;
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.balance)).toEqual(GOOD.map((r) => r.balance));
  });
  it("reads the answer whatever its shape", () => {
    expect(
      readResult({
        status: "completed",
        markdown: "x",
        credits_used: 10,
        job_id: "a",
      }),
    ).toMatchObject({ markdown: "x", creditsUsed: 10, pending: false });
    expect(readResult({ job_id: "a", status: "running" })).toMatchObject({
      markdown: null,
      pending: true,
      jobId: "a",
    });
    expect(
      readResult({
        status: "done",
        result: { chunks: [{ content: "a" }, { content: "b" }] },
      }).markdown,
    ).toBe("a\n\nb");
  });
  it("counts PDF pages", () => {
    expect(countPdfPages(pdf(3))).toBe(3);
    expect(countPdfPages(new Uint8Array([1, 2, 3]))).toBe(0);
  });
});

describe("webhook signature", () => {
  const sign = async (raw: string, secret: string) => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  };
  it("accepts only a correct signature", async () => {
    const raw = JSON.stringify({ job_id: "j", status: "completed" });
    const good = await sign(raw, "s3cret");
    expect(await signatureValid(raw, good, "s3cret")).toBe(true);
    expect(await signatureValid(raw, `sha256=${good}`, "s3cret")).toBe(true);
    expect(await signatureValid(raw + " ", good, "s3cret")).toBe(false);
    expect(await signatureValid(raw, good, "other")).toBe(false);
    expect(await signatureValid(raw, null, "s3cret")).toBe(false);
    expect(await signatureValid(raw, good, null)).toBe(false);
  });
  it("reads the job id and whether it finished", () => {
    expect(readWebhook({ job_id: "j", status: "completed" })).toEqual({
      jobId: "j",
      finished: true,
    });
    expect(readWebhook({ data: { id: "k", status: "running" } })).toEqual({
      jobId: "k",
      finished: false,
    });
    expect(readWebhook(null)).toEqual({ jobId: null, finished: false });
  });
});
