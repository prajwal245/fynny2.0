/**
 * Extract agent — server side: registering documents from any channel,
 * running the pipeline, writing transactions / review items, and the review
 * queue decisions. Every document, whatever its channel, goes through
 * `processExtraction`.
 */
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
import { loadSheetReader, pdfText } from "./files.server";
import { practiceLlm } from "./llm.server";

export const BUCKET = "ca-client-documents";
const MAX_BYTES = 25 * 1024 * 1024;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

export type Channel = "Manual" | "Gmail" | "WhatsApp";

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
  if (input.process !== false) await processExtraction(db, data.id);
  return { extraction_id: data.id, duplicate: false };
}

async function logAiCalls(
  db: Db,
  firmId: string,
  extractionId: string,
  calls: AiCallRecord[],
) {
  if (!calls.length) return;
  const { error } = await db.from("ca_ai_calls").insert(
    calls.map((c) => ({
      ...c,
      ca_firm_id: firmId,
      extraction_id: extractionId,
    })),
  );
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
): Promise<{
  status: string;
  txns: number;
  review: number;
  duplicates: number;
  error?: string;
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

  const failWith = async (message: string) => {
    await db
      .from("ca_document_extractions")
      .update({
        extract_status: "failed",
        review_state: "failed",
        error_message: message,
        extract_finished_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    await logActivity(
      db,
      doc.ca_firm_id,
      doc.business_id,
      "extract",
      `${filename} could not be read: ${message}`,
    );
    return {
      status: "failed",
      txns: 0,
      review: 0,
      duplicates: 0,
      error: message,
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
  const side: Side = doc.side ?? inferSide(filename, kind);
  const outcome = await runExtract(
    { bytes, filename, mime: null, side, businessId: doc.business_id },
    {
      llm: practiceLlm(),
      pdfText,
      sheetRows: kind === "xlsx" ? await loadSheetReader() : undefined,
    },
  );
  await logAiCalls(db, doc.ca_firm_id, doc.id, outcome.aiCalls);
  if (outcome.error) return failWith(outcome.error.message);

  // Replace the previous run's unconfirmed output.
  await db
    .from("ca_txns")
    .delete()
    .eq("extraction_id", doc.id)
    .eq("match_status", "unmatched")
    .eq("created_via", "extract");
  await db
    .from("ca_review_items")
    .delete()
    .eq("extraction_id", doc.id)
    .eq("status", "open");

  const txnRows = outcome.rows
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

  const reviewRows = outcome.rows
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

  const confidences = outcome.rows.map((r) => r.confidence);
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
      row_count: outcome.rows.length,
      txn_count: inserted,
      review_count: openReview ?? 0,
      duplicate_count: outcome.duplicateRows + crossDocDuplicates,
      error_message:
        outcome.rows.length === 0
          ? "No transactions were found in this file."
          : null,
      extracted: {
        ...(doc.extracted ?? {}),
        source:
          (doc.extracted as { source?: string } | null)?.source ?? "Manual",
        kind: outcome.kind,
        text_preview: outcome.sourceText.slice(0, 20_000),
      },
      extract_finished_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  const parts = [
    `${filename} read: ${inserted} transaction${inserted === 1 ? "" : "s"} extracted`,
  ];
  if (openReview) parts.push(`${openReview} sent to review`);
  if (outcome.duplicateRows + crossDocDuplicates)
    parts.push(
      `${outcome.duplicateRows + crossDocDuplicates} duplicate${outcome.duplicateRows + crossDocDuplicates === 1 ? "" : "s"} skipped or flagged`,
    );
  await logActivity(
    db,
    doc.ca_firm_id,
    doc.business_id,
    "extract",
    `${parts.join(", ")}.`,
  );

  if (doc.business_id) await autoResolveChases(db, { ...doc, side }, filename);
  return {
    status,
    txns: inserted,
    review: openReview ?? 0,
    duplicates: outcome.duplicateRows + crossDocDuplicates,
  };
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
  const { data: open } = await db
    .from("ca_document_requests")
    .select("id, title, doc_types, business_id")
    .eq("ca_firm_id", doc.ca_firm_id)
    .eq("business_id", doc.business_id)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (!open?.length) return;
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
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data } = await db
    .from("ca_document_extractions")
    .select("id")
    .or(
      `extract_status.eq.queued,and(extract_status.eq.processing,extract_started_at.lt.${staleBefore})`,
    )
    .lt("extract_attempts", 3)
    .order("created_at", { ascending: true })
    .limit(limit);
  const results: { id: string; status: string }[] = [];
  for (const row of data ?? []) {
    try {
      const r = await processExtraction(db, row.id);
      results.push({ id: row.id, status: r.status });
    } catch (e) {
      console.error(
        `[practice] queue item ${row.id} failed: ${(e as Error).message}`,
      );
      await db
        .from("ca_document_extractions")
        .update({
          extract_status: "failed",
          error_message: (e as Error).message.slice(0, 500),
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
    .select("id, business_id")
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
    })
    .eq("id", extractionId);
  return processExtraction(db, extractionId);
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
