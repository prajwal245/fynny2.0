import { describe, expect, it, vi } from "vitest";
import {
  STRICT_OCR_PROMPT,
  assessOcr,
  buildOpenRouterRequest,
  composeOcr,
  markdownToLayoutText,
  openRouterFallback,
  openRouterOcr,
  readOpenRouterConfig,
  type OcrResult,
} from "@/lib/practice/ocrFallback.server";

const bytes = new Uint8Array([1, 2, 3, 4]);
const cfg = readOpenRouterConfig({
  OPENROUTER_API_KEY: "sk-or-secretsecretsecret",
})!;
const ok =
  (content: string, extra: object = {}) =>
  async () =>
    new Response(
      JSON.stringify({
        model: "mistralai/mistral-ocr-latest",
        choices: [{ message: { content } }],
        usage: { cost: 0.002 },
        ...extra,
      }),
      { status: 200 },
    );
const STATEMENT = [
  "| Date | Narration | Debit | Credit | Balance |",
  "| --- | --- | --- | --- | --- |",
  "| 02/03/2026 | NEFT ONE | 1,000.00 | | 9,000.00 |",
  "| 03/03/2026 | NEFT TWO | | 500.00 | 9,500.00 |",
  "| 04/03/2026 | NEFT THREE | 2,500.00 | | 7,000.00 |",
].join("\n");

describe("the request", () => {
  it("is deterministic, chains Mistral OCR then Pixtral, and gives a PDF the Mistral OCR parser", () => {
    const body = buildOpenRouterRequest(bytes, "application/pdf", cfg);
    expect(body).toMatchObject({
      temperature: 0,
      route: "fallback",
      models: ["mistralai/mistral-ocr-latest", "mistralai/pixtral-large-2411"],
      plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
    });
    expect(body.messages[0]).toEqual({
      role: "system",
      content: STRICT_OCR_PROMPT,
    });
    expect(JSON.stringify(body.messages[1])).toContain(
      "data:application/pdf;base64,AQIDBA==",
    );
  });
  it("sends a photo as an image and without the PDF plugin", () => {
    const body = buildOpenRouterRequest(bytes, "image/jpeg", cfg);
    expect(body).not.toHaveProperty("plugins");
    expect(JSON.stringify(body.messages[1])).toContain("image_url");
  });
  it("carries the strict instruction verbatim", () => {
    for (const rule of [
      "Transcribe text, amounts, dates, account numbers, and IDs exactly as they appear",
      "Mark unreadable text strictly as [ILLEGIBLE]",
      "Output ONLY the extracted content with zero introductory or closing remarks",
    ])
      expect(STRICT_OCR_PROMPT).toContain(rule);
  });
  it("reads models from the environment when set", () => {
    expect(
      readOpenRouterConfig({
        OPENROUTER_API_KEY: "k",
        OPENROUTER_OCR_MODELS: "a/b, c/d",
      })!.models,
    ).toEqual(["a/b", "c/d"]);
  });
});

describe("when it is available", () => {
  it("is off without a key, when disabled, and in India-only mode", () => {
    expect(openRouterFallback({})).toBeNull();
    expect(
      openRouterFallback({
        OPENROUTER_API_KEY: "k",
        OPENROUTER_OCR_DISABLED: "1",
      }),
    ).toBeNull();
    expect(
      openRouterFallback({
        OPENROUTER_API_KEY: "k",
        PRACTICE_DATA_RESIDENCY: "india",
      }),
    ).toBeNull();
    expect(openRouterFallback({ OPENROUTER_API_KEY: "k" })).not.toBeNull();
  });
  it("changes nothing when there is no fallback: the primary reader is returned as it was", () => {
    const primary = async () => "text";
    expect(composeOcr(primary, null)).toBe(primary);
    expect(composeOcr(null, null)).toBeNull();
  });
});

describe("reading", () => {
  it("returns the text with table pipes turned into column gaps, and the model that answered", async () => {
    const r = await openRouterOcr(
      bytes,
      "application/pdf",
      cfg,
      ok("```markdown\n" + STATEMENT + "\n```") as unknown as typeof fetch,
    );
    expect(r.text).toContain("02/03/2026   NEFT ONE   1,000.00");
    expect(r.text).not.toContain("| ---");
    expect(r).toMatchObject({
      provider: "openrouter",
      model: "mistralai/mistral-ocr-latest",
      cost_usd: 0.002,
    });
  });
  it("keeps [ILLEGIBLE] exactly as returned", async () => {
    const r = await openRouterOcr(
      bytes,
      "image/png",
      cfg,
      ok("Total 1,2[ILLEGIBLE].00") as unknown as typeof fetch,
    );
    expect(r.text).toBe("Total 1,2[ILLEGIBLE].00");
  });
  it("fails with a reason that never contains the key", async () => {
    const f = (async () => {
      throw new Error("connect failed for Bearer sk-or-secretsecretsecret");
    }) as unknown as typeof fetch;
    await expect(
      openRouterOcr(bytes, "application/pdf", cfg, f),
    ).rejects.toThrow(/\[key\]/);
    await expect(
      openRouterOcr(bytes, "application/pdf", cfg, f),
    ).rejects.not.toThrow(/secretsecret/);
    await expect(
      openRouterOcr(
        bytes,
        "application/pdf",
        cfg,
        (async () =>
          new Response("x", { status: 429 })) as unknown as typeof fetch,
      ),
    ).rejects.toThrow("answered 429");
    await expect(
      openRouterOcr(
        bytes,
        "application/pdf",
        cfg,
        ok("") as unknown as typeof fetch,
      ),
    ).rejects.toThrow("nothing");
  });
  it("refuses a file over the size limit without calling out", async () => {
    const f = vi.fn();
    await expect(
      openRouterOcr(
        new Uint8Array(20),
        "application/pdf",
        { ...cfg, maxBytes: 10 },
        f as unknown as typeof fetch,
      ),
    ).rejects.toThrow("size limit");
    expect(f).not.toHaveBeenCalled();
  });
  it("converts only table rows", () => {
    expect(markdownToLayoutText("Title\n| a | b |\n|---|---|\n| 1 | 2 |")).toBe(
      "Title\na   b\n1   2",
    );
  });
});

describe("the quality trigger", () => {
  it("flags illegible text, empty text, and a statement with too few dates or amounts", () => {
    expect(assessOcr("").why).toBe("empty");
    expect(assessOcr("Balance 1,2[ILLEGIBLE].00").why).toBe("illegible");
    expect(assessOcr("Date Debit Credit Balance\n02/03/2026 5.00").why).toBe(
      "fields",
    );
    expect(assessOcr("Invoice total payable").ok).toBe(true);
    expect(assessOcr(markdownToLayoutText(STATEMENT)).ok).toBe(true);
  });
  const good = async (): Promise<OcrResult> => ({
    text: markdownToLayoutText(STATEMENT),
    provider: "openrouter",
    model: "m",
    cost_usd: 0,
  });
  it("does not call the fallback when the primary text is fine", async () => {
    const fb = vi.fn(good);
    const out = await composeOcr(
      async () => markdownToLayoutText(STATEMENT),
      fb,
    )!(bytes, "application/pdf");
    expect(fb).not.toHaveBeenCalled();
    expect(typeof out === "string" ? out : out.provider).not.toBe("openrouter");
  });
  it("uses the fallback when the primary has [ILLEGIBLE], fails, or reads nothing", async () => {
    for (const primary of [
      async () => "Balance 1,2[ILLEGIBLE].00",
      async () => {
        throw new Error("OCR timed out");
      },
      async () => "",
    ]) {
      const out = (await composeOcr(primary, good)!(
        bytes,
        "application/pdf",
      )) as OcrResult;
      expect(out.provider).toBe("openrouter");
      expect(out.note).toMatch(/primary reader/);
    }
  });
  it("keeps readable primary text when the fallback fails, and raises the primary error when there is none", async () => {
    const bad = async (): Promise<OcrResult> => {
      throw new Error("down");
    };
    const kept = await composeOcr(
      async () => "Date Debit Credit Balance\n02/03/2026 5.00",
      bad,
    )!(bytes, "application/pdf");
    expect(typeof kept === "string" ? kept : kept.text).toContain("02/03/2026");
    await expect(
      composeOcr(async () => {
        throw new Error("OCR timed out");
      }, bad)!(bytes, "application/pdf"),
    ).rejects.toThrow("OCR timed out");
  });
  it("is the only reader when there is no primary", async () => {
    expect(
      ((await composeOcr(null, good)!(bytes, "image/jpeg")) as OcrResult)
        .provider,
    ).toBe("openrouter");
  });
});
