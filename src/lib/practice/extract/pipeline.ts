/**
 * Extract agent pipeline: file bytes → scored rows ready to be written as
 * transactions (high confidence) or review items (low confidence).
 *
 *   detect type → deterministic parse (CSV / Excel / Tally XML / PDF text)
 *   → AI only where the file has no structure (scanned PDF, photo)
 *   → rules + optional AI classification → confidence → route
 *
 * All I/O is injected so the pipeline is testable and replayable.
 */
import { dedupeKey, type ExtractedRow, type Side } from "../core";
import {
  CLASSIFY_SYSTEM_PROMPT,
  CONFIDENCE_THRESHOLD,
  READ_SYSTEM_PROMPT,
  applyHeuristics,
  classifyUserPrompt,
  rowsFromAiRead,
  scoreRow,
  type AiReadRow,
  type AiRowVerdict,
  type ScoredRow,
} from "./classify";
import {
  looksLikeSpreadsheetBinary,
  parseDelimited,
  rowsFromTable,
} from "./table";
import { isTallyXml, rowsFromTally } from "./tally";
import { rowsFromStatementText } from "./textStatement";

export type FileKind =
  "csv" | "xlsx" | "tally_xml" | "pdf" | "image" | "unsupported";

export interface LlmJsonRequest {
  purpose: string;
  system: string;
  user: string;
  /** Base64 file for vision models (scanned PDFs, photos). */
  attachment?: { mime: string; base64: string };
}

export interface LlmJsonResult {
  data: unknown;
  provider: string;
  model: string;
  latency_ms: number;
  raw: string;
}

export interface LlmClient {
  /** Returns parsed JSON or throws. Implementations handle retries and fallback. */
  json(req: LlmJsonRequest): Promise<LlmJsonResult>;
}

export interface AiCallRecord {
  purpose: string;
  provider: string | null;
  model: string | null;
  input: string;
  output: string | null;
  latency_ms: number | null;
  status: "success" | "error";
  error: string | null;
}

export interface ExtractDeps {
  llm: LlmClient | null;
  /** Text layer of a PDF. Throws `PdfPasswordError` for protected files. */
  pdfText?: (bytes: Uint8Array) => Promise<{ text: string; pages: number }>;
  /** Rows of the first sheet with data in an Excel workbook. */
  sheetRows?: (bytes: Uint8Array) => string[][];
  /** Text of a scanned PDF or photo (OCR.space). Null when OCR is not configured. */
  ocr?: ((bytes: Uint8Array, mime: string) => Promise<string>) | null;
  threshold?: number;
  /** Rows sent to the AI classifier per document; the rest use rules only. */
  maxAiRows?: number;
}

export interface ExtractInput {
  bytes: Uint8Array;
  filename: string;
  mime: string | null;
  side: Side;
  businessId: string | null;
  /** The client whose books these are: tells the AI which way money moves. */
  clientName?: string | null;
}

export interface ExtractOutcome {
  kind: FileKind;
  rows: ScoredRow[];
  /** Rows identical to an earlier row in the same file (sent to review). */
  duplicateRows: number;
  sourceText: string;
  aiCalls: AiCallRecord[];
  documentKind: string | null;
  error: { code: string; message: string } | null;
}

export class PdfPasswordError extends Error {
  constructor() {
    super("PDF is password protected");
    this.name = "PdfPasswordError";
  }
}

const BATCH = 12;
const MAX_TEXT_CHARS = 60_000;

export function detectKind(
  bytes: Uint8Array,
  filename: string,
  mime: string | null,
): FileKind {
  const name = filename.toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, 2048)).trimStart();
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
    return "pdf"; // %PDF
  if (
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e)
  )
    return "image";
  if (/\.(jpe?g|png|webp|heic)$/.test(name) || mime?.startsWith("image/"))
    return "image";
  // Word, PowerPoint and similar share Excel's zip container: name them before sniffing.
  if (/\.(docx?|pptx?|odt|pages|rtf|zip|rar|7z)$/.test(name)) return "unsupported";
  if (looksLikeSpreadsheetBinary(bytes)) return "xlsx"; // includes Excel renamed to .csv
  if (
    head.startsWith("<") &&
    isTallyXml(new TextDecoder().decode(bytes.slice(0, 8192)))
  )
    return "tally_xml";
  if (/\.(xml)$/.test(name)) return "tally_xml";
  if (
    /\.(csv|tsv|txt)$/.test(name) ||
    mime?.includes("csv") ||
    mime?.startsWith("text/")
  )
    return "csv";
  return "unsupported";
}

/**
 * Which side of the reconciliation a document belongs to when the uploader
 * did not say: Tally and invoices are books; statements are bank.
 */
export function inferSide(filename: string, kind: FileKind): Side {
  const n = filename.toLowerCase();
  if (kind === "tally_xml") return "books";
  if (
    /(statement|stmt|bank|passbook|account|a\/c|hdfc|icici|sbi|axis|kotak)/.test(
      n,
    )
  )
    return "bank";
  if (
    /(invoice|inv|bill|purchase|sales|ledger|daybook|day book|tally|books|voucher|receipt)/.test(
      n,
    )
  )
    return "books";
  return kind === "csv" || kind === "xlsx" ? "bank" : "books";
}

function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // UTF-16 exports (some Tally versions) show up full of NULs.
  if (utf8.split(String.fromCharCode(0)).length - 1 > utf8.length / 4)
    return new TextDecoder("utf-16le").decode(bytes);
  return utf8;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function aiRead(
  deps: ExtractDeps,
  calls: AiCallRecord[],
  req: LlmJsonRequest,
): Promise<{ rows: AiReadRow[]; kind: string | null } | null> {
  if (!deps.llm) return null;
  const started = Date.now();
  try {
    const res = await deps.llm.json(req);
    const data = (res.data ?? {}) as {
      rows?: AiReadRow[];
      document_kind?: string;
    };
    calls.push({
      purpose: req.purpose,
      provider: res.provider,
      model: res.model,
      input: req.user.slice(0, 20_000),
      output: res.raw.slice(0, 20_000),
      latency_ms: res.latency_ms,
      status: "success",
      error: null,
    });
    return {
      rows: Array.isArray(data.rows) ? data.rows : [],
      kind: data.document_kind ?? null,
    };
  } catch (e) {
    calls.push({
      purpose: req.purpose,
      provider: null,
      model: null,
      input: req.user.slice(0, 20_000),
      output: null,
      latency_ms: Date.now() - started,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function aiClassify(
  deps: ExtractDeps,
  calls: AiCallRecord[],
  rows: ExtractedRow[],
  side: Side,
): Promise<Map<number, AiRowVerdict>> {
  const verdicts = new Map<number, AiRowVerdict>();
  if (!deps.llm || rows.length === 0) return verdicts;
  const limit = deps.maxAiRows ?? 240;
  const eligible = rows.filter((r) => r.amount && r.date).slice(0, limit);
  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH);
    const user = classifyUserPrompt(batch, side);
    const started = Date.now();
    try {
      const res = await deps.llm.json({
        purpose: "extract_classify",
        system: CLASSIFY_SYSTEM_PROMPT,
        user,
      });
      const list = ((res.data ?? {}) as { rows?: AiRowVerdict[] }).rows ?? [];
      for (const v of list)
        if (typeof v?.index === "number") verdicts.set(v.index, v);
      calls.push({
        purpose: "extract_classify",
        provider: res.provider,
        model: res.model,
        input: user,
        output: res.raw.slice(0, 20_000),
        latency_ms: res.latency_ms,
        status: "success",
        error: null,
      });
    } catch (e) {
      // Rate limited or down: rules-only for this batch, and stop asking.
      calls.push({
        purpose: "extract_classify",
        provider: null,
        model: null,
        input: user,
        output: null,
        latency_ms: Date.now() - started,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      break;
    }
  }
  return verdicts;
}

function fail(
  kind: FileKind,
  code: string,
  message: string,
  calls: AiCallRecord[] = [],
): ExtractOutcome {
  return {
    kind,
    rows: [],
    duplicateRows: 0,
    sourceText: "",
    aiCalls: calls,
    documentKind: null,
    error: { code, message },
  };
}


/** OCR text must carry at least this much before it is worth reading. */
const MIN_OCR_CHARS = 40;
/** Lines read from a scan never outrank a person's glance unless the balances verify. */
const OCR_CONFIDENCE_CAP = 0.8;

/**
 * Scans and photos: OCR first, then the same grounded text route as a text
 * PDF (statement parser with running-balance checks, then the AI reading the
 * OCR text). Amounts stay tied to the printed text. Returns null when OCR is
 * not configured or read nothing, so the caller can fall back to vision.
 */
async function readViaOcr(
  deps: ExtractDeps,
  calls: AiCallRecord[],
  bytes: Uint8Array,
  mime: string,
): Promise<{ text: string; rows: ExtractedRow[]; kind: string | null; ai: boolean } | null> {
  if (!deps.ocr) return null;
  let text = "";
  const started = Date.now();
  try {
    text = (await deps.ocr(bytes, mime)).slice(0, MAX_TEXT_CHARS);
    calls.push({ purpose: "extract_ocr", provider: "ocr.space", model: null, input: mime, output: text.slice(0, 2000), latency_ms: Date.now() - started, status: "success", error: null });
  } catch (e) {
    calls.push({ purpose: "extract_ocr", provider: "ocr.space", model: null, input: mime, output: null, latency_ms: Date.now() - started, status: "error", error: e instanceof Error ? e.message : String(e) });
    return null;
  }
  if (text.replace(/\s/g, "").length < MIN_OCR_CHARS) return null;
  const statement = rowsFromStatementText(text);
  if (statement.rows.length >= 3 && statement.verifiedShare >= 0.7)
    return {
      text,
      rows: statement.rows.map((r) => ({ ...r, parse_confidence: Math.min(r.parse_confidence, OCR_CONFIDENCE_CAP) })),
      kind: "bank_statement",
      ai: false,
    };
  const read = await aiRead(deps, calls, {
    purpose: "extract_read_ocr",
    system: READ_SYSTEM_PROMPT,
    user: `Text read by OCR from a scanned document. OCR can confuse similar characters (0/O, 1/l, 5/S); lower confidence where a value is doubtful.\n\n${text}`,
  });
  if (!read) return null;
  return { text, rows: rowsFromAiRead(read.rows, text), kind: read.kind, ai: true };
}

const LEGAL = /\b(pvt|private|ltd|limited|llp|llc|inc|co|company|the|and)\b/g;
function partyTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(LEGAL, " ").split(/\s+/).filter((t) => t.length > 1);
}
/** True when two names refer to the same business ("Sundara Textiles" vs "SUNDARA TEXTILES PVT LTD"). */
export function sameParty(a: string, b: string): boolean {
  const x = partyTokens(a);
  const y = partyTokens(b);
  if (!x.length || !y.length) return false;
  const common = x.filter((t) => y.includes(t)).length;
  return common / Math.min(x.length, y.length) >= 0.8;
}

export async function runExtract(
  input: ExtractInput,
  deps: ExtractDeps,
): Promise<ExtractOutcome> {
  const threshold = deps.threshold ?? CONFIDENCE_THRESHOLD;
  const calls: AiCallRecord[] = [];
  // Every AI read knows whose books these are, so "in" and "out" are from the
  // client's side and the client is never its own counterparty.
  const client = input.clientName?.trim();
  if (client && deps.llm) {
    const base = deps.llm;
    const who = `These are the books of the client "${client}". Direction is from the client's side: money the client receives is "in"; money the client pays, including bills and invoices addressed to the client, is "out". The counterparty is always the other party, never "${client}".\n\n`;
    deps = { ...deps, llm: { json: (req) => base.json({ ...req, user: who + req.user }) } };
  }
  const kind = detectKind(input.bytes, input.filename, input.mime);
  let parsed: ExtractedRow[] | null = null;
  let sourceText = "";
  let documentKind: string | null = null;
  let aiReadUsed = false;

  if (kind === "unsupported") {
    return fail(
      kind,
      "unsupported_type",
      /\.(docx?|odt|pages|rtf)$/i.test(input.filename)
        ? "Word documents are not read. Upload the bank statement or ledger as PDF, CSV or Excel, or the Tally XML export."
        : "Only CSV, Excel, Tally XML, PDF and image files can be read.",
    );
  }

  if (kind === "csv") {
    sourceText = decodeText(input.bytes);
    parsed = rowsFromTable(parseDelimited(sourceText));
    documentKind = input.side === "bank" ? "bank_statement" : "ledger_export";
  } else if (kind === "xlsx") {
    if (!deps.sheetRows)
      return fail(
        kind,
        "unsupported_type",
        "Excel reading is not available on this server.",
      );
    let rows: string[][];
    try {
      rows = deps.sheetRows(input.bytes);
    } catch {
      return fail(
        kind,
        "unreadable",
        "The Excel file could not be opened. It may be password protected or damaged.",
      );
    }
    sourceText = rows
      .slice(0, 2000)
      .map((r) => r.join(", "))
      .join("\n");
    parsed = rowsFromTable(rows);
    documentKind = input.side === "bank" ? "bank_statement" : "ledger_export";
  } else if (kind === "tally_xml") {
    sourceText = decodeText(input.bytes);
    try {
      parsed = rowsFromTally(sourceText);
    } catch (e) {
      return fail(
        kind,
        "unreadable",
        `Tally XML could not be read: ${e instanceof Error ? e.message : e}`,
      );
    }
    documentKind = "tally_export";
  } else if (kind === "pdf") {
    let pdf: { text: string; pages: number } | null = null;
    if (deps.pdfText) {
      try {
        pdf = await deps.pdfText(input.bytes);
      } catch (e) {
        if (e instanceof PdfPasswordError)
          return fail(
            kind,
            "password_protected",
            "This PDF is password protected. Ask the client for an unlocked copy or the password.",
          );
        pdf = null;
      }
    }
    const text = pdf?.text ?? "";
    const textRich = pdf
      ? text.replace(/\s/g, "").length >=
        80 * Math.max(1, Math.min(pdf.pages, 3))
      : false;
    if (textRich) {
      sourceText = text.slice(0, MAX_TEXT_CHARS);
      const statement = rowsFromStatementText(sourceText);
      if (statement.rows.length >= 3 && statement.verifiedShare >= 0.7) {
        parsed = statement.rows;
        documentKind = "bank_statement";
      } else {
        const read = await aiRead(deps, calls, {
          purpose: "extract_read_text",
          system: READ_SYSTEM_PROMPT,
          user: `Document text:\n${sourceText}`,
        });
        if (read) {
          aiReadUsed = true;
          parsed = rowsFromAiRead(read.rows, sourceText);
          documentKind = read.kind;
        } else if (statement.rows.length) {
          parsed = statement.rows.map((r) => ({
            ...r,
            parse_confidence: Math.min(r.parse_confidence, 0.6),
          }));
          documentKind = "bank_statement";
        } else {
          return fail(
            kind,
            "needs_ai",
            "The PDF has text but no statement layout was recognised, and the AI reader is not configured.",
            calls,
          );
        }
      }
    } else {
      if (input.bytes.length > 15_000_000)
        return fail(
          kind,
          "too_large",
          "Scanned PDFs larger than 15 MB must be split before upload.",
        );
      const ocr = await readViaOcr(deps, calls, input.bytes, "application/pdf");
      if (ocr) {
        sourceText = ocr.text;
        parsed = ocr.rows;
        documentKind = ocr.kind;
        aiReadUsed = ocr.ai;
      }
      const read = parsed ? null : await aiRead(deps, calls, {
        purpose: "extract_read_scan",
        system: READ_SYSTEM_PROMPT,
        user: "This is a scanned document. Read it carefully.",
        attachment: { mime: "application/pdf", base64: toBase64(input.bytes) },
      });
      if (!parsed && !read)
        return fail(
          kind,
          "needs_ai",
          "This PDF is scanned (no text layer). Configure OCR (OCR_SPACE_API_KEY) or a vision reader (GEMINI_API_KEY) to read scanned files.",
          calls,
        );
      if (read) {
        aiReadUsed = true;
        parsed = rowsFromAiRead(read.rows, "");
        documentKind = read.kind;
      }
    }
  } else if (kind === "image") {
    if (input.bytes.length > 10_000_000)
      return fail(
        kind,
        "too_large",
        "Images larger than 10 MB cannot be read.",
      );
    const imageMime = input.mime?.startsWith("image/") ? input.mime : "image/jpeg";
    const ocr = await readViaOcr(deps, calls, input.bytes, imageMime);
    if (ocr) {
      sourceText = ocr.text;
      parsed = ocr.rows;
      documentKind = ocr.kind;
      aiReadUsed = ocr.ai;
    }
    const read = parsed ? null : await aiRead(deps, calls, {
      purpose: "extract_read_image",
      system: READ_SYSTEM_PROMPT,
      user: "This is a photo of a financial document. Read it carefully; photos may be blurred or tilted.",
      attachment: {
        mime: input.mime?.startsWith("image/") ? input.mime : "image/jpeg",
        base64: toBase64(input.bytes),
      },
    });
    if (!parsed && !read)
      return fail(
        kind,
        "needs_ai",
        "Photos need OCR (OCR_SPACE_API_KEY) or a vision reader (GEMINI_API_KEY).",
        calls,
      );
    if (read) {
      aiReadUsed = true;
      parsed = rowsFromAiRead(read.rows, "");
      documentKind = read.kind;
    }
  }

  if (parsed === null) {
    // Table without a recognisable header: let the AI read the text, if available.
    const read = sourceText
      ? await aiRead(deps, calls, {
          purpose: "extract_read_text",
          system: READ_SYSTEM_PROMPT,
          user: `Document text:\n${sourceText.slice(0, MAX_TEXT_CHARS)}`,
        })
      : null;
    if (!read)
      return fail(
        kind,
        "no_header",
        "No date and amount columns were found in this file.",
        calls,
      );
    aiReadUsed = true;
    parsed = rowsFromAiRead(read.rows, sourceText);
    documentKind = read.kind;
  }

  const withRules = parsed.map((r) => applyHeuristics(r, input.side));
  // Rows the AI already read carry its confidence; only parser rows get a second AI opinion.
  const verdicts = aiReadUsed
    ? new Map<number, AiRowVerdict>()
    : await aiClassify(deps, calls, withRules, input.side);
  const scored = withRules.map((r) =>
    scoreRow(r, verdicts.get(r.row_index), threshold),
  );

  // Identical rows inside one file: keep the first, send the rest to a person.
  const seen = new Map<string, number>();
  let duplicateRows = 0;
  const rows = scored.map((r) => {
    if (!r.date || !r.amount || !r.direction) return r;
    const key = dedupeKey({
      business_id: input.businessId,
      side: input.side,
      date: r.date,
      direction: r.direction,
      amount: r.amount,
      reference: r.reference,
      description: r.description,
    });
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, r.row_index);
      return r;
    }
    duplicateRows++;
    return {
      ...r,
      route: "review" as const,
      confidence: Math.min(r.confidence, 0.5),
      reason: `Identical to row ${first + 1} in the same file. Confirm only if it is a genuine second transaction.`,
    };
  }).map((r) => {
    // An AI-read line naming the client as its own counterparty has its direction
    // backwards or is misread. (Statements read in code keep own-account transfers.)
    if (!aiReadUsed || !client || !r.counterparty || !sameParty(r.counterparty, client)) return r;
    return {
      ...r,
      counterparty: null,
      route: "review" as const,
      confidence: Math.min(r.confidence, 0.5),
      reason: [r.reason, "The reader named the client as the other party, so money in/out may be reversed"].filter(Boolean).join("; "),
    };
  });

  return {
    kind,
    rows,
    duplicateRows,
    sourceText: sourceText.slice(0, 200_000),
    aiCalls: calls,
    documentKind,
    error: null,
  };
}
