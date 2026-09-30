import { afterEach, describe, expect, it } from "vitest";
import { runExtract, type LlmClient } from "@/lib/practice/extract/pipeline";
import { ocrSpaceText } from "@/lib/practice/ocr.server";

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

// What OCR.space returns for a photographed statement page.
const OCR_STATEMENT = [
  "HDFC BANK STATEMENT",
  "Opening Balance 4,00,000.00",
  "01/09/2026 NEFT CR SUNDARA TEXTILES 1,25,000.00 5,25,000.00",
  "03/09/2026 UPI AMAZON PAY 2,499.00 5,22,501.00",
  "05/09/2026 SMS CHGS 17.70 5,22,483.30",
  "Closing Balance 5,22,483.30",
].join("\n");

const photo = (mime = "image/jpeg") => ({
  bytes,
  filename: "statement_photo.jpg",
  mime,
  side: "bank" as const,
  businessId: "b1",
});

describe("scans and photos through OCR", () => {
  it("reads a photographed statement without any AI, with balances verified", async () => {
    const out = await runExtract(photo(), { llm: null, ocr: async () => OCR_STATEMENT });
    expect(out.error).toBeNull();
    expect(out.rows.map((r) => [r.direction, r.amount])).toEqual([
      ["in", 125000],
      ["out", 2499],
      ["out", 17.7],
    ]);
    // Read from a scan: never more than 0.8 sure, even when balances verify.
    expect(Math.max(...out.rows.map((r) => r.confidence))).toBeLessThanOrEqual(0.8);
    expect(out.aiCalls.map((c) => c.purpose)).toEqual(["extract_ocr"]);
  });

  it("lets the text AI read OCR text that is not a statement, grounded in that text", async () => {
    const seen: string[] = [];
    const llm: LlmClient = {
      async json(req) {
        seen.push(req.purpose);
        if (req.purpose === "extract_read_ocr") {
          expect(req.attachment).toBeUndefined();
          return {
            data: {
              document_kind: "invoice",
              rows: [
                { date: "2026-09-12", amount: 11800, direction: "out", description: "Invoice 1042 Northline Logistics", source_text: "Total 11,800.00", confidence: 0.9 },
                { date: "2026-09-12", amount: 99999, direction: "out", description: "Invented line", source_text: "", confidence: 0.9 },
              ],
            },
            provider: "groq",
            model: "llama",
            latency_ms: 5,
            raw: "{}",
          };
        }
        return { data: { rows: [] }, provider: "groq", model: "llama", latency_ms: 1, raw: "{}" };
      },
    };
    const out = await runExtract(photo(), {
      llm,
      ocr: async () => "NORTHLINE LOGISTICS\nTax invoice 1042 dated 12/09/2026\nFreight charges 10,000.00\nGST 1,800.00\nTotal 11,800.00",
    });
    expect(seen[0]).toBe("extract_read_ocr");
    const invented = out.rows.find((r) => r.amount === 99999);
    // An amount the OCR text does not contain never passes as a transaction.
    expect(invented?.route).toBe("review");
    expect(out.rows.find((r) => r.amount === 11800)).toBeTruthy();
  });

  it("falls back to the vision reader when OCR reads nothing", async () => {
    const seen: { purpose: string; attached: boolean }[] = [];
    const llm: LlmClient = {
      async json(req) {
        seen.push({ purpose: req.purpose, attached: Boolean(req.attachment) });
        return { data: { rows: [] }, provider: "gemini", model: "g", latency_ms: 1, raw: "{}" };
      },
    };
    await runExtract(photo(), { llm, ocr: async () => "  " });
    expect(seen[0]).toEqual({ purpose: "extract_read_image", attached: true });
  });

  it("explains what to configure when neither OCR nor vision is available", async () => {
    const out = await runExtract(photo(), { llm: null, ocr: null });
    expect(out.error?.code).toBe("needs_ai");
    expect(out.error?.message).toMatch(/OCR_SPACE_API_KEY/);
  });

  it("uses OCR for scanned PDFs too", async () => {
    const out = await runExtract(
      { ...photo("application/pdf"), bytes: new TextEncoder().encode("%PDF-1.4 scan"), filename: "scan.pdf" },
      { llm: null, pdfText: async () => ({ text: "", pages: 1 }), ocr: async (_b, mime) => (mime === "application/pdf" ? OCR_STATEMENT : "") },
    );
    expect(out.error).toBeNull();
    expect(out.rows).toHaveLength(3);
  });
});

describe("OCR.space client", () => {
  const saved = process.env.OCR_SPACE_API_KEY;
  afterEach(() => {
    process.env.OCR_SPACE_API_KEY = saved;
  });

  it("sends the file with the table engine and joins the parsed pages", async () => {
    process.env.OCR_SPACE_API_KEY = "k-123";
    let sent: { url: string; key: string | null; engine: FormDataEntryValue | null; table: FormDataEntryValue | null; filetype: FormDataEntryValue | null } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      sent = {
        url,
        key: new Headers(init.headers).get("apikey"),
        engine: form.get("OCREngine"),
        table: form.get("isTable"),
        filetype: form.get("filetype"),
      };
      return new Response(JSON.stringify({ ParsedResults: [{ ParsedText: "page one\r\n" }, { ParsedText: "page two" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const text = await ocrSpaceText(bytes, "application/pdf", fake);
    expect(text).toBe("page one\n\npage two");
    expect(sent).toMatchObject({ url: "https://api.ocr.space/parse/image", key: "k-123", engine: "2", table: "true", filetype: "PDF" });
  });

  it("surfaces OCR.space's own reason when it cannot read", async () => {
    process.env.OCR_SPACE_API_KEY = "k-123";
    const fake = (async () =>
      new Response(JSON.stringify({ IsErroredOnProcessing: true, ErrorMessage: ["File size exceeds the maximum permissible file size limit of 1024 KB"] }), { status: 200 })) as unknown as typeof fetch;
    await expect(ocrSpaceText(bytes, "image/png", fake)).rejects.toThrow(/1024 KB/);
  });

  it("refuses to run without a key", async () => {
    delete process.env.OCR_SPACE_API_KEY;
    await expect(ocrSpaceText(bytes, "image/png")).rejects.toThrow(/not configured/);
  });
});

describe("the AI knows whose books these are", () => {
  const invoice = new TextEncoder().encode("NORTHLINE LOGISTICS\nTax invoice 1042 dated 12/09/2026\nBill to: Sundara Textiles Pvt Ltd\nTotal 11,800.00");
  const reader = (row: Record<string, unknown>, seen: string[]): LlmClient => ({
    async json(req) {
      seen.push(req.user);
      return { data: { document_kind: "invoice", rows: [{ date: "2026-09-12", amount: 11800, source_text: "Total 11,800.00", confidence: 0.9, description: "Invoice 1042", ...row }] }, provider: "t", model: "m", latency_ms: 1, raw: "{}" };
    },
  });

  it("tells the reader the client's name and which way money moves", async () => {
    const seen: string[] = [];
    await runExtract(
      { bytes: invoice, filename: "inv.txt", mime: "text/plain", side: "books", businessId: "b1", clientName: "Sundara Textiles Pvt Ltd" },
      { llm: reader({ direction: "out", counterparty: "Northline Logistics" }, seen) },
    );
    expect(seen[0]).toMatch(/books of the client "Sundara Textiles Pvt Ltd"/);
    expect(seen[0]).toMatch(/invoices addressed to the client, is "out"/);
  });

  it("sends a line that names the client as its own counterparty to review", async () => {
    const out = await runExtract(
      { bytes: invoice, filename: "inv.txt", mime: "text/plain", side: "books", businessId: "b1", clientName: "Sundara Textiles Pvt Ltd" },
      { llm: reader({ direction: "in", counterparty: "SUNDARA TEXTILES" }, []) },
    );
    expect(out.rows[0].route).toBe("review");
    expect(out.rows[0].counterparty).toBeNull();
    expect(out.rows[0].reason).toMatch(/money in\/out may be reversed/);
  });
});
