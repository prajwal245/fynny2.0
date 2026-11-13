/**
 * Extract agent — server side: registering documents from any channel,
 * running the pipeline, writing transactions / review items, and the review
 * queue decisions. Every document, whatever its channel, goes through
 * `processExtraction`.
 */
import { judgeOwnership } from "./extract/statementOwner";
import { checkStatement, findOverlap, overlapSentence, type Overlap, type StatementCheck } from "./extract/statementCheck";
import {
  PracticeError,
  dedupeKey,
  parseDate,
  round2,
  sha256Hex,
  type Side,
} from "./core";
import {
  adminDb,
  chaserEvent,
  fetchAll,
  logActivity,
  type Db,
  type FirmContext,
} from "./db.server";
import {
  detectKind,
  inferSide,
  runExtract,
  type AiCallRecord,
} from "./extract/pipeline";
import { loadSheetReader, loadSheetsReader, pdfText, unlockWorkbook } from "./files.server";
import { PdfPasswordError } from "./extract/pipeline";
import { reconStatusFor } from "./reconScope";
import { passwordNeededMessage, passwordWrongMessage } from "./passwordFile";
import { practiceLlm, withinAiCap } from "./llm.server";
import { practiceOcr } from "./ocr.server";
import { applyMemory } from "./memory";
import {
  isRetryable,
  MAX_EXTRACT_ATTEMPTS,
  nextAttemptAt,
  periodsOf,
} from "./orchestrate";
import {
  afterExtraction,
  finishRun,
  loadMemories,
  markMemoriesApplied,
  startRun,
  teachFromReview,
  type RunTrigger,
} from "./orchestrator.server";

export const BUCKET = "ca-client-documents";
const MAX_BYTES = 25 * 1024 * 1024;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

export type Channel = "Manual" | "Gmail" | "WhatsApp" | "Upload link" | "Zoho Books" | "Tally";

interface ExtractionRow {
  id: string;
  ca_firm_id: string;
  business_id: string | null;
  original_filename: string | null;
  storage_path: string | null;
  side: Side | null;
  extract_status: string | null;
  extract_started_at: string | null;
  request_id: string | null;
  source_type: string;
  extracted: Record<string, unknown> | null;
  uploaded_by: string | null;
}

async function download(db: Db, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data)
    throw new PracticeError(
      "storage",
      `Could not read the stored file: ${error?.message ?? "missing"}`,
    );
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Registers a file that is already in storage (browser upload, Gmail
 * attachment, WhatsApp media) and extracts it. Idempotent by content hash: the
 * same file arriving twice returns the first document.
 */
export async function registerDocument(
  db: Db,
  ctx: { firmId: string; userId: string | null },
  input: {
    storage_path: string;
    filename: string;
    mime: string | null;
    business_id: string | null;
    side?: Side | null;
    channel: Channel;
    request_id?: string | null;
    source_metadata?: Record<string, unknown>;
    wa_message_id?: string | null;
    process?: boolean;
  },
): Promise<{ extraction_id: string; duplicate: boolean }> {
  if (!input.storage_path.startsWith(`${ctx.firmId}/`))
    throw new PracticeError(
      "forbidden",
      "File is outside your practice folder.",
    );
  const bytes = await download(db, input.storage_path);
  if (bytes.length === 0)
    throw new PracticeError("empty", "The file is empty.");
  if (bytes.length > MAX_BYTES)
    throw new PracticeError(
      "too_large",
      "Files larger than 25 MB cannot be processed.",
    );
  const hash = await sha256Hex(bytes);

  const { data: existing } = await db
    .from("ca_document_extractions")
    .select("id, storage_path")
    .eq("ca_firm_id", ctx.firmId)
    .eq("content_hash", hash)
    .maybeSingle();
  if (existing) {
    if (existing.storage_path !== input.storage_path)
      await db.storage.from(BUCKET).remove([input.storage_path]);
    return { extraction_id: existing.id, duplicate: true };
  }

  // Uploads and Zoho pulls check the trial / plan limits first; documents that
  // arrive on their own (Gmail, WhatsApp) are always taken in.
  const billing = await import("./billing.server");
  if (input.channel === "Manual" || input.channel === "Zoho Books" || input.channel === "Tally")
    await billing.assertWorkRoom(db, ctx.firmId, { businessId: input.business_id, newDocument: true });
  const kind = detectKind(bytes, input.filename, input.mime);
  const side = input.side ?? inferSide(input.filename, kind);
  const { data, error } = await db
    .from("ca_document_extractions")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: input.business_id,
      original_filename: input.filename.slice(0, 250),
      storage_path: input.storage_path,
      classification: side === "bank" ? "bank_statement" : "document",
      confidence: 0,
      extracted: { source: input.channel },
      review_state: "pending",
      source_type:
        input.channel === "Manual" ? "upload" : input.channel.toLowerCase(),
      uploaded_by: ctx.userId,
      request_id: input.request_id ?? null,
      side,
      file_kind: kind,
      content_hash: hash,
      extract_status: "queued",
      source_metadata: input.source_metadata ?? {},
      wa_message_id: input.wa_message_id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // A concurrent arrival of the same file won the race.
    if (/duplicate key/i.test(error.message)) {
      const { data: again } = await db
        .from("ca_document_extractions")
        .select("id")
        .eq("ca_firm_id", ctx.firmId)
        .eq("content_hash", hash)
        .maybeSingle();
      if (again) return { extraction_id: again.id, duplicate: true };
    }
    throw new PracticeError("db_error", error.message);
  }
  await billing.startTrialClock(db, ctx.firmId).catch((e) => console.error(`[billing] trial clock: ${(e as Error).message}`));
  if (input.process !== false)
    await processExtraction(db, data.id, {
      trigger: input.channel === "Manual" ? "user" : "channel",
      userId: ctx.userId,
    });
  return { extraction_id: data.id, duplicate: false };
}

async function logAiCalls(
  db: Db,
  firmId: string,
  extractionId: string,
  calls: AiCallRecord[],
) {
  if (!calls.length) return;
  const rows = calls.map((c) => ({ ...c, ca_firm_id: firmId, extraction_id: extractionId }));
  let { error } = await db.from("ca_ai_calls").insert(rows);
  if (error && /input_tokens|output_tokens|cost_usd|units/.test(error.message)) {
    // The cost columns arrive with a database migration; until it is applied, keep the log without them.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ error } = await db.from("ca_ai_calls").insert(rows.map(({ input_tokens, output_tokens, cost_usd, units, ...rest }) => rest)));
  }
  if (error) console.error(`[practice] ai call log failed: ${error.message}`);
}

/**
 * Runs the Extract pipeline for one document. Safe to re-run: unmatched
 * transactions and open review items from the previous run are replaced,
 * matched transactions are kept, and dedupe keys stop double entries.
 */
export async function processExtraction(
  db: Db,
  extractionId: string,
  opts: { trigger?: RunTrigger; userId?: string | null; /** Opens a locked PDF or Excel file for this one read. Never stored or logged. */ password?: string } = {},
): Promise<{
  status: string;
  txns: number;
  review: number;
  duplicates: number;
  error?: string;
  retry_at?: string | null;
  pipeline?: { period: string; status: string }[];
}> {
  const COLS =
    "id, ca_firm_id, business_id, original_filename, storage_path, side, extract_status, extract_started_at, request_id, source_type, extracted, uploaded_by, extract_attempts";
  const { data: current } = await db
    .from("ca_document_extractions")
    .select(COLS)
    .eq("id", extractionId)
    .maybeSingle();
  if (!current) throw new PracticeError("not_found", "Document not found.");
  const busy =
    current.extract_status === "processing" &&
    current.extract_started_at &&
    Date.parse(current.extract_started_at) > Date.now() - STALE_PROCESSING_MS;
  if (busy) return { status: "processing", txns: 0, review: 0, duplicates: 0 };
  // Claim the row so two workers never process the same document: the update
  // only lands if nobody changed the status since we read it.
  const startedAt = new Date().toISOString();
  let claim = db
    .from("ca_document_extractions")
    .update({
      extract_status: "processing",
      extract_started_at: startedAt,
      extract_attempts: (current.extract_attempts ?? 0) + 1,
    })
    .eq("id", extractionId);
  claim =
    current.extract_status === null
      ? claim.is("extract_status", null)
      : claim.eq("extract_status", current.extract_status);
  if (current.extract_started_at)
    claim = claim.eq("extract_started_at", current.extract_started_at);
  const { data: claimed, error: claimErr } = await claim.select("id");
  if (claimErr) throw new PracticeError("db_error", claimErr.message);
  if (!claimed?.length)
    return { status: "processing", txns: 0, review: 0, duplicates: 0 };
  const doc = current as ExtractionRow & { extract_attempts: number };
  const filename = doc.original_filename ?? "document";
  const attempt = (current.extract_attempts ?? 0) + 1;
  const runStarted = Date.now();
  const runId = await startRun(db, {
    firmId: doc.ca_firm_id,
    businessId: doc.business_id,
    agent: "extract",
    trigger: opts.trigger ?? (attempt > 1 ? "retry" : "user"),
    subjectId: doc.id,
    subjectLabel: filename,
    attempt,
    userId: opts.userId ?? null,
  });

  // A temporary failure (AI provider down, storage hiccup) is retried with
  // backoff by the schedule; a permanent one (password, unsupported file) is not.
  const failWith = async (message: string, code?: string) => {
    const retryAt = isRetryable({ code, message })
      ? nextAttemptAt(attempt)
      : null;
    await db
      .from("ca_document_extractions")
      .update({
        extract_status: "failed",
        review_state: "failed",
        error_message: message,
        extract_finished_at: new Date().toISOString(),
        extract_next_attempt_at: retryAt?.toISOString() ?? null,
      })
      .eq("id", doc.id);
    await logActivity(
      db,
      doc.ca_firm_id,
      doc.business_id,
      "extract",
      `${filename} could not be read: ${message}${retryAt ? ` Trying again automatically (attempt ${attempt + 1} of ${MAX_EXTRACT_ATTEMPTS}).` : ""}`,
    );
    await finishRun(db, runId, runStarted, {
      status: "failed",
      summary: `Could not read ${filename}`,
      error: message,
      detail: { code: code ?? null, retry_at: retryAt?.toISOString() ?? null },
    });
    return {
      status: "failed",
      txns: 0,
      review: 0,
      duplicates: 0,
      error: message,
      retry_at: retryAt?.toISOString() ?? null,
    };
  };

  if (!doc.storage_path) return failWith("No stored file for this document.");
  let bytes: Uint8Array;
  try {
    bytes = await download(db, doc.storage_path);
  } catch (e) {
    return failWith((e as Error).message);
  }

  // Gmail / WhatsApp arrivals are hashed here: the same file through two channels is one document.
  const { data: hashRow } = await db
    .from("ca_document_extractions")
    .select("content_hash")
    .eq("id", doc.id)
    .maybeSingle();
  if (!hashRow?.content_hash) {
    const hash = await sha256Hex(bytes);
    const { error: hashErr } = await db
      .from("ca_document_extractions")
      .update({ content_hash: hash })
      .eq("id", doc.id);
    if (hashErr && /duplicate key/i.test(hashErr.message)) {
      const { data: first } = await db
        .from("ca_document_extractions")
        .select("original_filename, source_type")
        .eq("ca_firm_id", doc.ca_firm_id)
        .eq("content_hash", hash)
        .maybeSingle();
      return failWith(
        `Duplicate: the same file already arrived as "${first?.original_filename ?? "another document"}" (${first?.source_type ?? "upload"}). Nothing was added twice.`,
      );
    }
  }

  const kind = detectKind(bytes, filename, null);
  let side: Side = doc.side ?? inferSide(filename, kind);
  const { data: clientRow } = doc.business_id
    ? await db
        .from("ca_clients")
        .select("client_name, gstin")
        .eq("ca_firm_id", doc.ca_firm_id)
        .eq("business_id", doc.business_id)
        .limit(1)
        .maybeSingle()
    : { data: null };
  // A locked workbook is opened here (the spreadsheet reader cannot decrypt); a locked PDF is opened by pdfText below.
  let readBytes = bytes;
  if (kind === "xlsx") {
    try {
      readBytes = await unlockWorkbook(bytes, opts.password);
    } catch (e) {
      if (e instanceof PdfPasswordError)
        return failWith(e.reason === "wrong" ? passwordWrongMessage(e.what) : passwordNeededMessage(e.what), e.reason === "wrong" ? "password_wrong" : "password_protected");
      throw e;
    }
  }
  // An Excel file with several sheets: remember their names so a person can pick another one, and honour an earlier pick.
  let sheetNames: string[] | undefined;
  if (kind === "xlsx") {
    try {
      const all = (await loadSheetsReader())(readBytes);
      if (all.length > 1) sheetNames = all.map((x) => x.name);
    } catch {
      /* the read below reports an unreadable file */
    }
  }
  const sheetInfo = sheetNames ? { sheet_names: sheetNames } : {};
  const outcome = await runExtract(
    {
      bytes: readBytes,
      filename,
      mime: null,
      sheetName: (doc.extracted as { sheet_name?: string } | null)?.sheet_name ?? null,
      side,
      businessId: doc.business_id,
      clientName: clientRow?.client_name ?? null,
      clientGstin: (clientRow as { gstin?: string | null } | null)?.gstin ?? null,
    },
    {
      llm: (await withinAiCap(db, doc.ca_firm_id)) ? practiceLlm() : null,
      ocr: practiceOcr(),
      pdfText: (b) => pdfText(b, opts.password),
      sheetRows: kind === "xlsx" ? await loadSheetReader() : undefined,
      sheetsAll: kind === "xlsx" ? await loadSheetsReader() : undefined,
    },
  );
  await logAiCalls(db, doc.ca_firm_id, doc.id, outcome.aiCalls);
  if (outcome.error) return failWith(outcome.error.message, outcome.error.code);
  if (outcome.side && outcome.side !== side) {
    // The content decides: a Tally ledger is the books even when its name says "bank".
    side = outcome.side;
    await db.from("ca_document_extractions").update({ side, classification: "document" }).eq("id", doc.id);
    await logActivity(db, doc.ca_firm_id, doc.business_id, "extract", `${filename} has Tally voucher columns, so it was filed as Books.`);
  }
  if (outcome.register) {
    // A register is summarised, not reconciled: no transactions, nothing to review.
    const reg = outcome.register;
    const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const headline = `${reg.label}: ${reg.entries} entr${reg.entries === 1 ? "y" : "ies"}${reg.totals.length ? `, ${reg.totals.map((t) => `${t.label.toLowerCase()} ${money(t.amount)}`).join(", ")}` : ""}.`;
    await db.from("ca_txns").delete().eq("extraction_id", doc.id).neq("match_status", "matched");
    await db.from("ca_review_items").delete().eq("extraction_id", doc.id).eq("status", "open");
    await db
      .from("ca_document_extractions")
      .update({
        extract_status: "parsed",
        review_state: "auto_accepted",
        classification: reg.kind,
        file_kind: outcome.kind,
        confidence: 1,
        row_count: reg.entries,
        txn_count: 0,
        review_count: 0,
        duplicate_count: 0,
        error_message: null,
        extracted: {
          ...(doc.extracted ?? {}),
          source: (doc.extracted as { source?: string } | null)?.source ?? "Manual",
          kind: outcome.kind,
          register: reg,
          text_preview: outcome.sourceText.slice(0, 20_000),
          ...sheetInfo,
        },
        extract_finished_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    const failed = (reg.checks ?? []).filter((c) => !c.ok);
    const checksLine = reg.checks?.length
      ? failed.length
        ? ` Checks under GST/TDS/payroll rules: ${failed.map((c) => `${c.label}: ${c.detail}`).join(" ")}`
        : ` Checks under GST/TDS/payroll rules passed (${reg.checks.map((c) => c.label).join(", ")}).`
      : "";
    await logActivity(db, doc.ca_firm_id, doc.business_id, "extract", `${filename} read as ${headline} ${reg.note}${checksLine}`.slice(0, 1900));
    await finishRun(db, runId, runStarted, { summary: `${filename}: ${headline}`, detail: { register: reg.kind, entries: reg.entries } });
    return { status: "parsed", txns: 0, review: 0, duplicates: 0, pipeline: [] as { period: string; status: string }[] };
  }
  if (outcome.rows.length === 0)
    return failWith(
      "No transactions were found in this file. Check that it is the statement or ledger export itself, not a summary or cover page.",
      "empty",
    );

  // What people taught this client's Extract agent in earlier months.
  const memories = await loadMemories(db, doc.business_id);
  const remembered = applyMemory(outcome.rows, memories);
  const rows = remembered.rows;

  // A Tally sync is the books as they stand in Tally today. An entry deleted or changed in Tally must disappear here too,
  // matched or not, so the next Recon sees what Tally really holds.
  if (side === "books" && /tally/i.test(String((doc.extracted as { source?: string } | null)?.source ?? ""))) await dropSyncedBooks(db, doc.id);

  // Is the statement correct and complete? Checked from its own running balance, and against earlier statements of the account.
  let statementReport: (StatementCheck & { overlap: Overlap | null; hold?: { reason: string; suggested: { id: string; name: string } | null } }) | null = null;
  if (side === "bank" && outcome.documentKind !== "invoice" && rows.length) {
    const usable = rows.filter((r) => r.date && r.amount && r.direction);
    const check = checkStatement(
      usable.map((r) => ({ index: r.row_index, date: r.date!, amount: r.amount!, direction: r.direction!, balance: r.balance ?? null })),
    );
    let overlap: Overlap | null = null;
    if (check.first && check.last) {
      const { data: earlier } = await db
        .from("ca_txns")
        .select("txn_date, amount, direction, balance")
        .eq("ca_firm_id", doc.ca_firm_id)
        .eq("business_id", doc.business_id)
        .eq("side", "bank")
        .neq("extraction_id", doc.id)
        .gte("txn_date", check.first)
        .lte("txn_date", check.last)
        .limit(20000);
      overlap = findOverlap(
        usable.map((r) => ({ date: r.date!, amount: r.amount!, direction: r.direction!, balance: r.balance ?? null })),
        ((earlier ?? []) as { txn_date: string; amount: number | string; direction: "in" | "out"; balance: number | string | null }[]).map((e) => ({
          date: String(e.txn_date),
          amount: Number(e.amount),
          direction: e.direction,
          balance: e.balance === null || e.balance === undefined ? null : Number(e.balance),
        })),
      );
    }
    statementReport = { ...check, overlap };

    // Does the statement belong to this client? The name printed on it is looked for among the firm's clients, and its account number
    // is compared with the client's Tally bank ledgers. A statement for another client is held, not filed.
    try {
      const text = outcome.sourceText ?? "";
      const { data: cl } = await db.from("ca_clients").select("id, client_name").eq("ca_firm_id", doc.ca_firm_id).limit(2000);
      const clients = ((cl ?? []) as { id: string; client_name: string }[]).map((c) => ({ id: c.id, name: c.client_name }));
      const mine = clients.find((c) => c.id === doc.business_id);
      const { data: co } = await db.from("ca_tally_companies").select("id").eq("ca_firm_id", doc.ca_firm_id).eq("business_id", doc.business_id).limit(1);
      let banks: string[] | null = null;
      if ((co ?? [])[0]) {
        const { data: lg } = await db.from("ca_tally_ledgers").select("name, parent").eq("company_id", (co as { id: string }[])[0]!.id);
        banks = ((lg ?? []) as { name: string; parent: string | null }[]).filter((l) => /bank/i.test(l.parent ?? "")).map((l) => l.name);
      }
      const j = judgeOwnership({ text, filename, clientId: doc.business_id ?? "", clientName: mine?.name ?? "", clients, bankLedgers: banks });
      const extra = [
        { ok: j.owner.state === "match" ? true : j.owner.state === "mismatch" ? false : null, label: "Account holder", detail: j.owner.message },
        ...(j.account ? [{ ok: j.account.state === "match" ? true : j.account.state === "mismatch" ? false : null, label: "Account number", detail: j.account.message }] : []),
      ];
      statementReport.checks.push(...extra);
      const confirmed = Boolean((doc.extracted as { owner_confirmed?: boolean } | null)?.owner_confirmed);
      if (extra.some((c) => c.ok === false)) {
        statementReport.status = "fail";
        statementReport.headline = `This statement may belong to another client or account. ${extra.find((c) => c.ok === false)!.detail}`;
      }
      if (j.hold && !confirmed) {
        statementReport.hold = { reason: j.owner.message, suggested: j.suggested };
      }
    } catch (e) {
      console.error(`[practice] owner check for ${doc.id} failed: ${(e as Error).message}`);
    }
  }


  // Another client's statement: nothing is filed. A person moves it to the right client or says it is right. Until then no line of it
  // can reach this client's reconciliation or an approval.
  if (statementReport?.hold) {
    await db.from("ca_txns").delete().eq("extraction_id", doc.id).eq("match_status", "unmatched").eq("created_via", "extract");
    await db.from("ca_review_items").delete().eq("extraction_id", doc.id).eq("status", "open");
    await db
      .from("ca_document_extractions")
      .update({
        extract_status: "needs_review",
        review_state: "needs_review",
        classification: outcome.documentKind ?? "bank_statement",
        file_kind: outcome.kind,
        side,
        row_count: rows.length,
        txn_count: 0,
        review_count: 0,
        duplicate_count: 0,
        error_message: "This statement looks like it belongs to another client. Its lines are held.",
        extracted: { ...(doc.extracted ?? {}), source: (doc.extracted as { source?: string } | null)?.source ?? "Manual", kind: outcome.kind, text_preview: outcome.sourceText.slice(0, 20_000), statement_check: statementReport, ...sheetInfo },
        extract_finished_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    await logActivity(db, doc.ca_firm_id, doc.business_id, "extract", `${filename} was held: ${statementReport.hold.reason} Nothing was filed. Move it to the right client or confirm it belongs here.`.slice(0, 1900));
    await finishRun(db, runId, runStarted, { summary: `${filename}: held, may belong to another client.`, detail: { held: true } });
    return { status: "needs_review", txns: 0, review: 0, duplicates: 0, pipeline: [] as { period: string; status: string }[] };
  }

  // Replace the previous run's unconfirmed output.
  await db
    .from("ca_txns")
    .delete()
    .eq("extraction_id", doc.id)
    // Unmatched lines, and the invoice lines kept out of reconciliation (a re-read replaces them; a line a person ignored stays).
    .or("match_status.eq.unmatched,recon_tag.eq.invoice")
    .eq("created_via", "extract");
  await db
    .from("ca_review_items")
    .delete()
    .eq("extraction_id", doc.id)
    .eq("status", "open");

  const txnRows = rows
    .filter(
      (r) => r.route === "transaction" && r.date && r.amount && r.direction,
    )
    .map((r) => ({
      ca_firm_id: doc.ca_firm_id,
      business_id: doc.business_id,
      extraction_id: doc.id,
      side,
      direction: r.direction!,
      amount: r.amount!,
      currency: r.currency,
      txn_date: r.date!,
      counterparty: r.counterparty,
      reference: r.reference,
      description: r.description || null,
      category: r.category,
      balance: r.balance,
      confidence: r.confidence,
      raw_text: r.raw_text.slice(0, 4000),
      row_index: r.row_index,
      dedupe_key: dedupeKey({
        business_id: doc.business_id,
        side,
        date: r.date!,
        direction: r.direction!,
        amount: r.amount!,
        reference: r.reference,
        description: r.description,
      }),
      created_via: "extract",
      created_by: doc.uploaded_by,
      ...reconStatusFor(outcome.documentKind),
      // A sales invoice or a purchase bill is not a bank movement: its receipt or payment is a separate voucher. Keeping the invoice
      // out of bank reconciliation stops a bank receipt being "matched" to the invoice it settles.
      ...(side === "books" && (r.category === "sales_invoice" || r.category === "purchase_invoice") ? { match_status: "ignored" as const, recon_tag: "invoice" as const } : {}),
    }));

  let inserted = 0;
  for (let i = 0; i < txnRows.length; i += 500) {
    const chunk = txnRows.slice(i, i + 500);
    const { data, error } = await db
      .from("ca_txns")
      .upsert(chunk, {
        onConflict: "ca_firm_id,dedupe_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) return failWith(`Saving transactions failed: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  const crossDocDuplicates = txnRows.length - inserted;

  const reviewRows = rows
    .filter((r) => r.route === "review")
    .map((r) => ({
      ca_firm_id: doc.ca_firm_id,
      business_id: doc.business_id,
      extraction_id: doc.id,
      row_index: r.row_index,
      side,
      raw_text: r.raw_text.slice(0, 4000),
      proposed: {
        date: r.date,
        amount: r.amount,
        direction: r.direction,
        description: r.description,
        counterparty: r.counterparty,
        reference: r.reference,
        category: r.category,
        currency: r.currency,
        balance: r.balance,
      },
      confidence: r.confidence,
      reason: (r.reason ?? "Low confidence").slice(0, 1000),
    }));
  if (reviewRows.length) {
    const { error } = await db.from("ca_review_items").upsert(reviewRows, {
      onConflict: "extraction_id,row_index",
      ignoreDuplicates: true,
    });
    if (error) return failWith(`Saving review items failed: ${error.message}`);
  }
  const { count: openReview } = await db
    .from("ca_review_items")
    .select("id", { count: "exact", head: true })
    .eq("extraction_id", doc.id)
    .eq("status", "open");

  const confidences = rows.map((r) => r.confidence);
  const avg = confidences.length
    ? round2(confidences.reduce((s, c) => s + c, 0) / confidences.length)
    : 0;
  const status = (openReview ?? 0) > 0 ? "needs_review" : "parsed";
  await db
    .from("ca_document_extractions")
    .update({
      extract_status: status,
      review_state: status === "parsed" ? "auto_accepted" : "needs_review",
      classification:
        outcome.documentKind ??
        (side === "bank" ? "bank_statement" : "document"),
      file_kind: outcome.kind,
      side,
      confidence: avg,
      row_count: rows.length,
      txn_count: inserted,
      review_count: openReview ?? 0,
      duplicate_count: outcome.duplicateRows + crossDocDuplicates,
      error_message:
        rows.length === 0
          ? "No transactions were found in this file."
          : null,
      extracted: {
        ...(doc.extracted ?? {}),
        source:
          (doc.extracted as { source?: string } | null)?.source ?? "Manual",
        kind: outcome.kind,
        text_preview: outcome.sourceText.slice(0, 20_000),
        ...(statementReport ? { statement_check: statementReport } : {}),
        ...sheetInfo,
      },
      extract_finished_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  const parts = [
    `${filename} read: ${inserted} transaction${inserted === 1 ? "" : "s"} extracted`,
  ];
  const prefilledByMemory = remembered.applied.length;
  if (prefilledByMemory)
    parts.push(
      `${prefilledByMemory} pre-filled from your earlier corrections, for you to confirm`,
    );
  if (openReview) parts.push(`${openReview} sent to review`);
  if (outcome.duplicateRows + crossDocDuplicates)
    parts.push(
      `${outcome.duplicateRows + crossDocDuplicates} duplicate${outcome.duplicateRows + crossDocDuplicates === 1 ? "" : "s"} skipped or flagged`,
    );
  const overlapLine = statementReport?.overlap ? overlapSentence(statementReport.overlap, rows.length) : null;
  await logActivity(
    db,
    doc.ca_firm_id,
    doc.business_id,
    "extract",
    `${parts.join(", ")}.${outcome.note ? ` ${outcome.note}` : ""}${statementReport ? ` Statement check: ${statementReport.headline}` : ""}${overlapLine ? ` ${overlapLine}` : ""}`.slice(0, 1900),
  );

  if (doc.business_id) await autoResolveChases(db, { ...doc, side }, filename);
  if (remembered.applied.length)
    await markMemoriesApplied(
      db,
      remembered.applied.map((a) => a.memoryId),
    );
  const released = remembered.applied.filter((a) => a.released).length;
  await finishRun(db, runId, runStarted, {
    summary: `${parts.join(", ")}.`,
    detail: {
      txns: inserted,
      review: openReview ?? 0,
      duplicates: outcome.duplicateRows + crossDocDuplicates,
      memory_applied: remembered.applied.length,
      memory_released: released,
    },
  });

  // Chain: once both sides of a month are in, Recon runs by itself.
  let pipeline: { period: string; status: string }[] = [];
  try {
    pipeline = await afterExtraction(db, doc);
  } catch (e) {
    console.error(`[practice] pipeline after ${doc.id} failed: ${(e as Error).message}`);
  }
  return {
    status,
    txns: inserted,
    review: openReview ?? 0,
    duplicates: outcome.duplicateRows + crossDocDuplicates,
    pipeline,
  };
}

/**
 * Removes every line a Tally sync filed for one document, including lines already matched. A bank line that was matched
 * to one of them is un-matched again (the match is kept in the history as reversed), and the exceptions of the removed
 * lines go with them, so a deleted voucher leaves no stale book line and no false exception behind.
 */
export async function dropSyncedBooks(db: Db, extractionId: string): Promise<{ removed: number; reopened: number }> {
  const { data: lines } = await db.from("ca_txns").select("id").eq("extraction_id", extractionId).eq("side", "books").limit(50_000);
  const ids = ((lines ?? []) as { id: string }[]).map((l) => l.id);
  if (!ids.length) return { removed: 0, reopened: 0 };
  const banks = new Set<string>();
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: ms } = await db.from("ca_recon_matches").select("id, bank_txn_id").eq("status", "active").overlaps("book_txn_ids", chunk);
    for (const m of (ms ?? []) as { id: string; bank_txn_id: string }[]) {
      banks.add(m.bank_txn_id);
      await db.from("ca_recon_matches").update({ status: "reversed", reversed_at: now, notes: "The book entry is no longer in Tally." }).eq("id", m.id).eq("status", "active");
    }
  }
  const bankIds = [...banks];
  for (let i = 0; i < bankIds.length; i += 200) await db.from("ca_txns").update({ match_status: "unmatched" }).in("id", bankIds.slice(i, i + 200)).eq("match_status", "matched");
  for (let i = 0; i < ids.length; i += 200) await db.from("ca_txns").delete().in("id", ids.slice(i, i + 200));
  return { removed: ids.length, reopened: bankIds.length };
}

const CHASE_HINTS: { re: RegExp; side: Side | null }[] = [
  { re: /bank/i, side: "bank" },
  { re: /invoice|bill|tally|ledger|books|purchase|sales/i, side: "books" },
];

/** A document arriving for a client closes the chase that was waiting for it. */
async function autoResolveChases(
  db: Db,
  doc: ExtractionRow & { side: Side },
  filename: string,
) {
  const { data: openAll } = await db
    .from("ca_document_requests")
    .select("id, title, doc_types, business_id, period")
    .eq("ca_firm_id", doc.ca_firm_id)
    .eq("business_id", doc.business_id)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (!openAll?.length) return;
  // A chase for a named month closes only when this document covers that month.
  const { data: dates } = await db
    .from("ca_txns")
    .select("txn_date")
    .eq("extraction_id", doc.id)
    .limit(5000);
  const covered = new Set(periodsOf((dates ?? []).map((d) => d.txn_date as string)));
  const open = openAll.filter((r) => {
    if (r.id === doc.request_id) return true;
    if (!r.period) return true;
    return covered.has(r.period);
  });
  if (!open.length) return;
  const linked = doc.request_id
    ? open.find((r) => r.id === doc.request_id)
    : undefined;
  const byType = open.find((r) => {
    const text = `${r.title} ${(r.doc_types ?? []).join(" ")}`;
    return CHASE_HINTS.some((h) => h.re.test(text) && h.side === doc.side);
  });
  const target = linked ?? byType ?? (open.length === 1 ? open[0] : undefined);
  if (!target) return;
  const now = new Date().toISOString();
  const { data: done } = await db
    .from("ca_document_requests")
    .update({
      status: "fulfilled",
      fulfilled_at: now,
      linked_extraction_id: doc.id,
      resolved_reason: "document_received",
      next_follow_up_at: null,
    })
    .eq("id", target.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!done) return;
  const note = `Document received (${filename}). Chase closed automatically.`;
  await chaserEvent(db, {
    chaser_id: target.id,
    ca_firm_id: doc.ca_firm_id,
    business_id: doc.business_id,
    event_type: "auto_resolved",
    note,
    metadata: { extraction_id: doc.id },
  });
  await logActivity(
    db,
    doc.ca_firm_id,
    doc.business_id,
    "chaser",
    `Chase "${target.title}" closed automatically because ${filename} arrived.`,
  );
}

/** Processes documents waiting in the queue (Gmail / WhatsApp arrivals, retries). */
export async function processQueue(
  limit = 5,
): Promise<{ processed: number; results: { id: string; status: string }[] }> {
  const db = await adminDb();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data } = await db
    .from("ca_document_extractions")
    .select("id, extract_status, source_type")
    .or(
      `extract_status.eq.queued,and(extract_status.eq.processing,extract_started_at.lt.${staleBefore}),and(extract_status.eq.failed,extract_next_attempt_at.lte.${now})`,
    )
    .lt("extract_attempts", MAX_EXTRACT_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);
  const results: { id: string; status: string }[] = [];
  for (const row of data ?? []) {
    try {
      const r = await processExtraction(db, row.id, {
        trigger:
          row.extract_status === "queued" && row.source_type !== "upload"
            ? "channel"
            : "retry",
      });
      results.push({ id: row.id, status: r.status });
    } catch (e) {
      console.error(
        `[practice] queue item ${row.id} failed: ${(e as Error).message}`,
      );
      const { data: after } = await db
        .from("ca_document_extractions")
        .select("extract_attempts")
        .eq("id", row.id)
        .maybeSingle();
      // An unexpected error is treated as temporary: retried with backoff.
      const retryAt = nextAttemptAt(after?.extract_attempts ?? MAX_EXTRACT_ATTEMPTS);
      await db
        .from("ca_document_extractions")
        .update({
          extract_status: "failed",
          error_message: (e as Error).message.slice(0, 500),
          extract_next_attempt_at: retryAt?.toISOString() ?? null,
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: "failed" });
    }
  }
  return { processed: results.length, results };
}

/** Assign (or re-assign) a document to a client and re-extract it under that client. */
export async function assignDocument(
  db: Db,
  ctx: FirmContext,
  extractionId: string,
  businessId: string,
  side?: Side,
) {
  const { data: doc } = await db
    .from("ca_document_extractions")
    .select("id, business_id, source_type, gmail_sender_email, gmail_match_method")
    .eq("id", extractionId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!doc) throw new PracticeError("not_found", "Document not found.");
  const { count: matched } = await db
    .from("ca_txns")
    .select("id", { count: "exact", head: true })
    .eq("extraction_id", extractionId)
    .neq("match_status", "unmatched");
  if (matched && doc.business_id !== businessId)
    throw new PracticeError(
      "conflict",
      "This document already has reconciled transactions. Reverse those matches before moving it.",
    );
  // Confirmed review rows carry the old client; re-extraction recreates them under the new one.
  if (doc.business_id !== businessId) {
    await db.from("ca_txns").delete().eq("extraction_id", extractionId);
    await db.from("ca_review_items").delete().eq("extraction_id", extractionId);
  }
  await db
    .from("ca_document_extractions")
    .update({
      business_id: businessId,
      ...(side ? { side } : {}),
      extract_status: "queued",
      extract_attempts: 0,
      extract_next_attempt_at: null,
      error_message: null,
    })
    .eq("id", extractionId);
  if (doc.source_type === "gmail" && doc.gmail_sender_email) await learnSender(db, ctx, String(doc.gmail_sender_email), businessId, String(doc.gmail_match_method ?? ""));
  return processExtraction(db, extractionId, { trigger: "user", userId: ctx.userId });
}

/**
 * A person filed a Gmail document under a client: the next email from that
 * address files itself. If the same address is later filed under a
 * different client (a shared accountant, say), it stops filing automatically
 * and always asks.
 */
async function learnSender(db: Db, ctx: FirmContext, senderEmail: string, businessId: string, method: string) {
  const email = senderEmail.toLowerCase();
  // Forwards by the firm's own staff and addresses on several clients are never learned.
  if (method === "internal" || method === "ambiguous" || method.endsWith("_forwarded")) return;
  const { data: existing } = await db
    .from("ca_email_sender_mappings")
    .select("id, business_id, confirmed_at, match_method")
    .eq("ca_firm_id", ctx.firmId)
    .eq("sender_email", email)
    .maybeSingle();
  if (existing?.confirmed_at && existing.business_id !== businessId) {
    await db.from("ca_email_sender_mappings").update({ confirmed_at: null, match_method: "conflict" }).eq("id", existing.id);
    return;
  }
  if (existing?.match_method === "conflict") return;
  await db.from("ca_email_sender_mappings").upsert(
    {
      ca_firm_id: ctx.firmId,
      business_id: businessId,
      sender_email: email,
      sender_domain: email.split("@")[1] ?? null,
      match_method: "manual",
      confidence: 0.95,
      confirmed_by_user_id: ctx.userId,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: "ca_firm_id,sender_email" },
  );
}

export async function documentUrl(
  db: Db,
  ctx: FirmContext,
  extractionId: string,
): Promise<{ url: string; filename: string }> {
  const { data: doc } = await db
    .from("ca_document_extractions")
    .select("storage_path, original_filename")
    .eq("id", extractionId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!doc?.storage_path)
    throw new PracticeError("not_found", "No stored file for this document.");
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 300, {
      download: doc.original_filename ?? true,
    });
  if (error || !data)
    throw new PracticeError(
      "storage",
      error?.message ?? "Could not create link",
    );
  return { url: data.signedUrl, filename: doc.original_filename ?? "document" };
}

/* ── review queue ───────────────────────────────────────── */

export interface ReviewPatch {
  date: string;
  amount: number; // signed: + in, − out
  particulars: string;
  counterparty?: string | null;
  reference?: string | null;
}

export async function resolveReviewItem(
  db: Db,
  ctx: FirmContext,
  itemId: string,
  action: "confirm" | "discard",
  patch?: ReviewPatch,
) {
  const { data: item } = await db
    .from("ca_review_items")
    .select("*")
    .eq("id", itemId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!item) throw new PracticeError("not_found", "Review item not found.");
  if (item.status !== "open")
    return { status: item.status, txn_id: item.txn_id };
  const now = new Date().toISOString();
  let txnId: string | null = null;

  if (action === "confirm") {
    const p = item.proposed as {
      date: string | null;
      amount: number | null;
      direction: "in" | "out" | null;
      description: string;
      counterparty: string | null;
      reference: string | null;
      category: string | null;
      currency?: string;
      balance?: number | null;
    };
    const date = patch ? parseDate(patch.date) : p.date;
    const amount = patch ? Math.abs(Number(patch.amount)) : p.amount;
    const direction = patch
      ? Number(patch.amount) < 0
        ? "out"
        : "in"
      : p.direction;
    const description = patch ? patch.particulars : p.description;
    if (!date || !amount || !direction)
      throw new PracticeError(
        "invalid",
        "A date, a non-zero amount and a direction are needed to confirm this row.",
      );
    const counterparty =
      patch?.counterparty !== undefined ? patch.counterparty : p.counterparty;
    const reference =
      patch?.reference !== undefined ? patch.reference : p.reference;
    let key = dedupeKey({
      business_id: item.business_id,
      side: item.side,
      date,
      direction,
      amount,
      reference,
      description,
    });
    const { data: clash } = await db
      .from("ca_txns")
      .select("id")
      .eq("ca_firm_id", ctx.firmId)
      .eq("dedupe_key", key)
      .maybeSingle();
    // A person confirmed it as a separate transaction: keep both, traceably.
    if (clash) key = `${key}#review:${item.id}`;
    const { data: txn, error } = await db
      .from("ca_txns")
      .insert({
        ca_firm_id: ctx.firmId,
        business_id: item.business_id,
        extraction_id: item.extraction_id,
        review_item_id: item.id,
        side: item.side,
        direction,
        amount: round2(amount),
        currency: p.currency ?? "INR",
        txn_date: date,
        counterparty,
        reference,
        description,
        category: p.category,
        // The printed running balance stays with the line unless the amount was corrected.
        balance:
          patch && Math.abs(Number(patch.amount)) !== p.amount
            ? null
            : (p.balance ?? null),
        confidence: 1,
        raw_text: item.raw_text,
        row_index: item.row_index,
        dedupe_key: key,
        created_via: "review",
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) throw new PracticeError("db_error", error.message);
    txnId = txn.id;
    // Remember how this line was settled, so next month's copy goes straight through.
    try {
      await teachFromReview(
        db,
        ctx,
        {
          business_id: item.business_id,
          raw_text: item.raw_text,
          proposed: p,
        },
        { direction, counterparty: counterparty ?? null, description },
      );
    } catch (e) {
      console.error(`[practice] memory teach failed: ${(e as Error).message}`);
    }
  }

  const corrected = patch
    ? {
        date: patch.date,
        amount: patch.amount,
        particulars: patch.particulars,
        counterparty: patch.counterparty ?? null,
        reference: patch.reference ?? null,
      }
    : null;
  await db
    .from("ca_review_items")
    .update({
      status: action === "confirm" ? "confirmed" : "discarded",
      corrected,
      was_corrected: Boolean(patch),
      txn_id: txnId,
      resolved_by: ctx.userId,
      resolved_at: now,
    })
    .eq("id", item.id);

  const { count } = await db
    .from("ca_review_items")
    .select("id", { count: "exact", head: true })
    .eq("extraction_id", item.extraction_id)
    .eq("status", "open");
  const { data: doc } = await db
    .from("ca_document_extractions")
    .select("original_filename, txn_count")
    .eq("id", item.extraction_id)
    .maybeSingle();
  await db
    .from("ca_document_extractions")
    .update({
      review_count: count ?? 0,
      ...(txnId ? { txn_count: (doc?.txn_count ?? 0) + 1 } : {}),
      ...(count === 0
        ? {
            extract_status: "parsed",
            review_state: "posted",
            reviewed_at: now,
            reviewed_by: ctx.userId,
            was_corrected: Boolean(patch),
          }
        : {}),
    })
    .eq("id", item.extraction_id);

  await logActivity(
    db,
    ctx.firmId,
    item.business_id,
    "extract",
    `Review item from ${doc?.original_filename ?? "a document"} ${action === "confirm" ? (patch ? "corrected and confirmed" : "confirmed") : "discarded"}.`,
  );
  return {
    status: action === "confirm" ? "confirmed" : "discarded",
    txn_id: txnId,
  };
}

/** Every confirmed correction, for the fine-tuning dataset export. */
export async function correctionLog(db: Db, ctx: FirmContext) {
  return fetchAll(
    (from, to) =>
      db
        .from("ca_review_items")
        .select(
          "id, raw_text, proposed, corrected, confidence, reason, status, resolved_at",
        )
        .eq("ca_firm_id", ctx.firmId)
        .neq("status", "open")
        .order("resolved_at", { ascending: false })
        .range(from, to),
    5000,
  );
}

/**
 * Discards every open review line of one document in a single step. One call and one update, so discarding 500 lines
 * is as quick as discarding one, and the count returned is what was really discarded (never "done" for a partial result).
 */
export async function discardOpenReviewForDocument(db: Db, ctx: FirmContext, extractionId: string) {
  const { data: doc } = await db
    .from("ca_document_extractions")
    .select("id, business_id, original_filename")
    .eq("id", extractionId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!doc) throw new PracticeError("not_found", "Document not found.");
  const now = new Date().toISOString();
  const { data: done, error } = await db
    .from("ca_review_items")
    .update({ status: "discarded", resolved_by: ctx.userId, resolved_at: now })
    .eq("extraction_id", extractionId)
    .eq("ca_firm_id", ctx.firmId)
    .eq("status", "open")
    .select("id");
  if (error) throw new PracticeError("db_error", error.message);
  const { count } = await db.from("ca_review_items").select("id", { count: "exact", head: true }).eq("extraction_id", extractionId).eq("status", "open");
  const left = count ?? 0;
  await db
    .from("ca_document_extractions")
    .update({ review_count: left, ...(left === 0 ? { extract_status: "parsed", review_state: "posted", reviewed_at: now, reviewed_by: ctx.userId } : {}) })
    .eq("id", extractionId);
  await logActivity(db, ctx.firmId, doc.business_id as string | null, "extract", `${done?.length ?? 0} review line${done?.length === 1 ? "" : "s"} from ${doc.original_filename ?? "a document"} discarded.`);
  return { discarded: done?.length ?? 0, remaining: left };
}
