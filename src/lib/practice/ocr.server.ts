/**
 * OCR for scanned PDFs and photos, via OCR.space (free tier: 1 MB per file,
 * 3 PDF pages). Set OCR_SPACE_API_KEY to turn it on. The text it returns goes
 * through the same checks as a text PDF: statement rows must reconcile to the
 * printed running balance, and every amount must appear in the text.
 */

const ENDPOINT = "https://api.ocr.space/parse/image";
const TIMEOUT_MS = 45_000;

type OcrSpaceResponse = {
  ParsedResults?: { ParsedText?: string; ErrorMessage?: string }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
};

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function ocrConfigured(): boolean {
  return Boolean(process.env["OCR_SPACE_API_KEY"]?.trim());
}

/** Reads the text of a scan. Throws with OCR.space's own reason when it cannot. */
export async function ocrSpaceText(
  bytes: Uint8Array,
  mime: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = process.env["OCR_SPACE_API_KEY"]?.trim();
  if (!key) throw new Error("OCR is not configured");
  const form = new FormData();
  form.append("base64Image", `data:${mime};base64,${toBase64(bytes)}`);
  // Engine 2 reads numbers and tables better; isTable keeps statement columns on one line.
  form.append("OCREngine", "2");
  form.append("isTable", "true");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  if (mime === "application/pdf") form.append("filetype", "PDF");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { apikey: key },
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`OCR service answered ${res.status}`);
    const data = (await res.json()) as OcrSpaceResponse;
    if (data.IsErroredOnProcessing) {
      const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
      throw new Error(`OCR could not read the file: ${msg ?? "unknown reason"}`);
    }
    return (data.ParsedResults ?? [])
      .map((p) => p.ParsedText ?? "")
      .join("\n")
      .replace(/\r\n/g, "\n")
      .trim();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("OCR timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** The dependency the Extract pipeline takes, or null when OCR is off. */
export function practiceOcr(): ((bytes: Uint8Array, mime: string) => Promise<string>) | null {
  return ocrConfigured() ? (bytes, mime) => ocrSpaceText(bytes, mime) : null;
}
