/**
 * Document Intake OS — upload → OCR/extract → classify → confidence → review → post.
 *
 * Every step writes an audit event and keeps the link back to the source
 * document, so any posted number can be traced to the file it came from.
 */
import { supabase } from "@/integrations/supabase/client";
import { validateUpload } from "@/lib/uploadPolicy";
import { logCAAudit } from "@/lib/caAudit";
import { normaliseAmount, detectAmountPattern, logParsePattern } from "@/lib/bankAmount";

export type CADocClass = "bank" | "invoice" | "expense" | "challan" | "other";

export const DOC_CLASS_LABELS: Record<CADocClass, string> = {
  bank: "Bank statement",
  invoice: "Sales invoice",
  expense: "Expense bill",
  challan: "Tax challan",
  other: "Other",
};

/** Threshold above which an extraction skips manual review. */
export const AUTO_ACCEPT_CONFIDENCE = 0.85;

export interface ExtractionRow {
  [key: string]: unknown;
}

export interface CAExtraction {
  id: string;
  ca_firm_id: string;
  business_id: string;
  request_id: string | null;
  document_id: string | null;
  storage_path: string | null;
  original_filename: string | null;
  classification: string;
  confidence: number;
  extracted: { rows?: ExtractionRow[] } | null;
  corrected: { rows?: ExtractionRow[] } | null;
  review_state: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  posted_at: string | null;
  posted_ref: string | null;
  error_message: string | null;
  created_at: string;
}

/** Guess a document class from the filename before the model sees it. */
export function guessClassification(filename: string): CADocClass {
  const f = filename.toLowerCase();
  if (/(statement|bank|passbook|acct|account)/.test(f)) return "bank";
  if (/(invoice|inv[-_ ]?\d|bill[-_ ]?to|sales)/.test(f)) return "invoice";
  if (/(expense|purchase|vendor|receipt|voucher)/.test(f)) return "expense";
  if (/(challan|gst|tds|itns|payment[-_ ]?ack)/.test(f)) return "challan";
  return "other";
}

/** Only these classes have an extraction prompt today. */
export function extractableDocType(c: CADocClass): "bank" | "invoice" | "expense" | null {
  if (c === "bank" || c === "invoice" || c === "expense") return c;
  return null;
}

/**
 * Confidence is derived from how complete the extracted rows are, not from
 * the model's own self-report (which it does not provide).
 */
export function scoreConfidence(docType: "bank" | "invoice" | "expense", rows: ExtractionRow[]): number {
  if (!rows.length) return 0;
  const required: Record<string, string[]> = {
    bank: ["date", "description", "amount", "direction"],
    invoice: ["customer", "invoice_number", "amount", "date"],
    expense: ["vendor", "amount", "date"],
  };
  const fields = required[docType];
  let filled = 0;
  let total = 0;
  for (const r of rows) {
    for (const f of fields) {
      total += 1;
      const v = r[f];
      if (v !== null && v !== undefined && String(v).trim() !== "") filled += 1;
    }
  }
  const completeness = total ? filled / total : 0;
  // small penalty for single-row extractions of multi-row document types
  const volumeFactor = docType === "bank" && rows.length < 3 ? 0.9 : 1;
  return Math.round(completeness * volumeFactor * 100) / 100;
}

/**
 * Parse a CSV bank statement using the deterministic bank parser.
 * Rows come back in the same shape as the OCR extractor.
 */
export async function parseBankCSV(file: File): Promise<{ rows: ExtractionRow[]; error: string | null }> {
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return { rows: [], error: "CSV has fewer than 2 rows" };

    const sep = text.includes("\t") ? "\t" : text.includes("|") ? "|" : ",";
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].split(sep).length >= 3) { headerIdx = i; break; }
    }
    const clean = (c: string) => c.replace(/^["']|["']$/g, "").trim();
    const headers = lines[headerIdx].split(sep).map(clean);
    const dataLines = lines.slice(headerIdx + 1).filter((l) => l.trim().length > 0);
    const dataRows = dataLines.map((l) => l.split(sep).map(clean));
    const sampleRawRows = dataRows.slice(0, 10);

    const detected = detectAmountPattern(headers, sampleRawRows);
    const dateIdx = headers.findIndex((h) => /date|dt|value date|transaction date/i.test(h));
    const descIdx = headers.findIndex((h) => /description|narration|particular|remarks|details|memo|note/i.test(h));

    const rows: ExtractionRow[] = [];
    for (const cols of dataRows) {
      if (cols.length < 2) continue;
      const rawDate = dateIdx >= 0 ? cols[dateIdx] : "";
      const rawDesc = descIdx >= 0 ? cols[descIdx] : cols[1] ?? "";
      const rawAmount = detected.amountIdx >= 0 ? cols[detected.amountIdx] : undefined;
      const rawType = detected.typeIdx >= 0 ? cols[detected.typeIdx] : undefined;
      const rawDebit = detected.debitIdx >= 0 ? cols[detected.debitIdx] : undefined;
      const rawCredit = detected.creditIdx >= 0 ? cols[detected.creditIdx] : undefined;

      const signed = normaliseAmount(rawAmount, rawType, rawDebit, rawCredit);
      if (signed === 0 && !rawDate) continue;

      rows.push({
        date: rawDate,
        description: rawDesc,
        amount: Math.abs(signed),
        direction: signed < 0 ? "debit" : "credit",
      });
    }
    logParsePattern("csv-intake", detected, rows as Array<{ date?: string; description?: string; amount: number }>);
    return { rows, error: rows.length === 0 ? "No parseable rows found in CSV" : null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "CSV parse failed" };
  }
}

/** Parse a Tally XML export into the OCR extractor row shape. */
export async function parseTallyXML(file: File): Promise<{ rows: ExtractionRow[]; error: string | null }> {
  try {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const vouchers = Array.from(doc.querySelectorAll("VOUCHER"));
    if (vouchers.length === 0) return { rows: [], error: "No VOUCHER elements found in XML" };

    const rows: ExtractionRow[] = [];
    for (const v of vouchers) {
      const date = v.querySelector("DATE")?.textContent?.trim() ?? "";
      const narration =
        v.querySelector("NARRATION")?.textContent?.trim() ??
        v.querySelector("VOUCHERTYPENAME")?.textContent?.trim() ??
        "";
      const ledgerEntries = Array.from(v.querySelectorAll("ALLLEDGERENTRIES\\.LIST, LEDGERENTRIES\\.LIST"));
      for (const entry of ledgerEntries) {
        const amount = parseFloat(entry.querySelector("AMOUNT")?.textContent?.trim() ?? "0");
        if (!Number.isFinite(amount) || amount === 0) continue;
        rows.push({
          date: /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date,
          description: narration,
          amount: Math.abs(amount),
          direction: amount < 0 ? "debit" : "credit",
        });
      }
    }
    return { rows, error: rows.length === 0 ? "No parseable entries in Tally XML" : null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "XML parse failed" };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function storagePathFor(firmId: string, businessId: string, period: string | null, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").toLowerCase();
  const seg = period ? period.replace(/[^a-zA-Z0-9-]/g, "") : "unfiled";
  return `${firmId}/${businessId}/${seg}/${Date.now()}_${safe}`;
}

export interface IntakeInput {
  file: File;
  firmId: string;
  businessId: string;
  clientReferenceCode: string;
  clientId?: string | null;
  requestId?: string | null;
  period?: string | null;
  classification?: CADocClass;
}

export interface IntakeResult {
  ok: boolean;
  error?: string;
  extractionId?: string;
  documentId?: string;

  reviewState?: string;
  classification?: CADocClass;
  confidence?: number;
  rowCount?: number;
}

/** Full intake pipeline for one file. */
export async function intakeDocument(input: IntakeInput): Promise<IntakeResult> {
  const { file, firmId, businessId, clientReferenceCode } = input;
  console.log("[fyn:intake] intakeDocument called — firmId:", firmId, "businessId:", businessId, "file:", file.name);


  const policyError = validateUpload("ca-client-documents", file);
  if (policyError) return { ok: false, error: policyError };

  // Block posting into a period the firm has already closed.
  try {
    const periodKey = input.period ? input.period.slice(0, 7) : null;
    if (periodKey && input.clientId) {
      const { data: periodRecord } = await supabase
        .from("ca_client_periods")
        .select("status")
        .eq("ca_firm_id", firmId)
        .eq("client_id", input.clientId)
        .eq("period", periodKey)
        .maybeSingle();
      if (periodRecord?.status === "closed") {
        return { ok: false, error: `Period ${periodKey} is closed. Switch to an open period to upload documents.` };
      }
    }
  } catch { /* non-blocking check */ }



  const classification = input.classification ?? guessClassification(file.name);
  const period = input.period ?? null;
  const path = storagePathFor(firmId, businessId, period, file.name);

  const { error: upErr } = await supabase.storage
    .from("ca-client-documents")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (upErr) {
    console.error("[fyn:intake] storage upload failed:", upErr.message, "path:", path, "firmId:", firmId);
    return { ok: false, error: `Storage upload failed: ${upErr.message}` };
  }

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id ?? null;
  if (!userId) {
    await supabase.storage.from("ca-client-documents").remove([path]);
    return { ok: false, error: "Not authenticated" };
  }

  const { data: docRow, error: docErr } = await supabase
    .from("ca_client_documents")
    .insert({
      ca_firm_id: firmId,
      business_id: businessId,
      client_reference_code: clientReferenceCode,
      original_filename: file.name,
      stored_filename: path.split("/").pop() ?? file.name,
      storage_path: path,
      file_size_bytes: file.size,
      mime_type: file.type,
      document_type: classification,
      filing_period: period,
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (docErr) {
    await supabase.storage.from("ca-client-documents").remove([path]);
    return { ok: false, error: docErr.message };
  }

  const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
  const isXml = file.name.toLowerCase().endsWith(".xml");
  const docType = extractableDocType(classification);
  let rows: ExtractionRow[] = [];
  let confidence = 0;
  let errorMessage: string | null = null;

  if (isCsv) {
    const parsed = await parseBankCSV(file);
    rows = parsed.rows;
    errorMessage = parsed.error;
    confidence = rows.length > 0 ? scoreConfidence("bank", rows) : 0;
  } else if (isXml) {
    const parsed = await parseTallyXML(file);
    rows = parsed.rows;
    errorMessage = parsed.error;
    confidence = rows.length > 0 ? scoreConfidence("bank", rows) : 0;
  } else if (docType) {
    try {
      const dataUrl = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("extract-document-ai", {
        body: { doc_type: docType, file_base64: dataUrl, mime_type: file.type },
      });
      if (error) {
        errorMessage = error.message;
      } else {
        rows = Array.isArray((data as { rows?: ExtractionRow[] })?.rows) ? (data as { rows: ExtractionRow[] }).rows : [];
        confidence = scoreConfidence(docType, rows);
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Extraction failed";
    }
  } else {
    // Unsupported file type — store and route to review for manual classification
    errorMessage = null;
    rows = [];
    confidence = 0;
  }

  console.log(`[fyn:extract] csv-path=${isCsv} xml-path=${isXml} rows=${rows.length} confidence=${confidence}`);

  const reviewState = errorMessage
    ? "failed"
    : confidence >= AUTO_ACCEPT_CONFIDENCE
    ? "auto_accepted"
    : "needs_review";

  const { data: extraction, error: exErr } = await supabase
    .from("ca_document_extractions")
    .insert({
      ca_firm_id: firmId,
      business_id: businessId,
      request_id: input.requestId ?? null,
      document_id: docRow.id,
      storage_path: path,
      original_filename: file.name,
      classification,
      confidence,
      extracted: { rows } as never,
      review_state: reviewState,
      error_message: errorMessage,
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (exErr) return { ok: false, error: exErr.message };

  await logCAAudit({
    firmId,
    businessId,
    entityType: "document_extraction",
    entityId: extraction.id,
    action: "document_ingested",
    sourceDocumentId: docRow.id,
    detail: { classification, confidence, rows: rows.length, review_state: reviewState, filename: file.name },
  });

  // Auto-resolve any open document chaser for this client when a document arrives.
  // Chasers live in ca_document_requests; this whole block is non-blocking.
  try {
    const { data: pendingChasers } = await supabase
      .from("ca_document_requests")
      .select("id, title")
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .in("status", ["pending", "sent", "chased", "escalated"])
      .limit(5);
    if (pendingChasers && pendingChasers.length > 0) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("ca_document_requests")
        .update({ status: "fulfilled", fulfilled_at: nowIso, updated_at: nowIso })
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .in("status", ["pending", "sent", "chased", "escalated"]);

      console.log(`[fyn:chaser] auto-resolved ${pendingChasers.length} chasers for ${businessId}`);

      await supabase.from("ca_brain_events").insert({
        ca_firm_id: firmId,
        business_id: businessId,
        event_type: "chaser_auto_resolved",
        payload: {
          resolved_count: pendingChasers.length,
          trigger: "document_upload",
          filename: file.name,
          classification,
        },
      });

      await supabase.from("ca_notifications").insert({
        ca_firm_id: firmId,
        business_id: businessId,
        type: "chaser_resolved",
        title: "Client responded",
        message: `${file.name} was uploaded — ${pendingChasers.length} pending chaser${pendingChasers.length > 1 ? "s" : ""} auto-resolved`,
        is_read: false,
      });
    }
  } catch { /* non-blocking — chaser resolution must never block the intake pipeline */ }


  return {
    ok: true,
    extractionId: extraction.id,
    documentId: docRow.id as string,

    reviewState,
    classification,
    confidence,
    rowCount: rows.length,
  };
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isoDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Post a reviewed extraction into the ledger, keeping the source link. */
export async function postExtraction(
  extraction: CAExtraction,
  rows: ExtractionRow[],
): Promise<{ ok: boolean; error?: string; posted?: number }> {
  const cls = extraction.classification as CADocClass;
  const businessId = extraction.business_id;
  if (!rows.length) return { ok: false, error: "Nothing to post — no rows in this extraction." };

  let error: string | null = null;
  let posted = 0;

  if (cls === "bank") {
    const payload = rows.map((r) => ({
      business_id: businessId,
      date: isoDate(r.date),
      description: String(r.description ?? "").slice(0, 500),
      type: String(r.direction ?? "debit").toLowerCase() === "credit" ? "credit" : "debit",
      amount: num(r.amount),
      balance: 0,
      source_document_id: extraction.document_id,
      source_reference: `ca_extraction:${extraction.id}`,
      source_type: "manual",
    }));
    const { error: e, data: inserted } = await supabase.from("bank_transactions").insert(payload).select("id");
    error = e?.message ?? null;
    posted = inserted?.length ?? payload.length;
  } else if (cls === "invoice") {
    const payload = rows.map((r) => ({
      business_id: businessId,
      invoice_number: String(r.invoice_number ?? `AI-${extraction.id.slice(0, 8)}`),
      invoice_date: isoDate(r.date),
      subtotal: num(r.amount),
      total_amount: num(r.amount),
      outstanding_amount: num(r.amount),
      status: "pending",
    }));
    const { error: e, data: inserted } = await supabase.from("invoices").insert(payload).select("id");
    error = e?.message ?? null;
    posted = inserted?.length ?? payload.length;
  } else if (cls === "expense") {
    const payload = rows.map((r) => ({
      business_id: businessId,
      category: String(r.category ?? "Uncategorised"),
      description: String(r.vendor ?? ""),
      amount: num(r.amount),
      date: isoDate(r.date),
      payment_status: "pending",
    }));
    const { error: e, data: inserted } = await supabase.from("expenses").insert(payload).select("id");
    error = e?.message ?? null;
    posted = inserted?.length ?? payload.length;
  } else {
    return { ok: false, error: "This document class cannot be posted to the ledger." };
  }

  if (error) return { ok: false, error };

  const { error: updErr } = await supabase
    .from("ca_document_extractions")
    .update({
      review_state: "posted",
      corrected: { rows } as never,
      posted_at: new Date().toISOString(),
      posted_ref: `${cls}:${posted}`,
    })
    .eq("id", extraction.id);
  if (updErr) return { ok: false, error: updErr.message };

  await logCAAudit({
    firmId: extraction.ca_firm_id,
    businessId,
    entityType: "document_extraction",
    entityId: extraction.id,
    action: "posted_to_ledger",
    sourceDocumentId: extraction.document_id,
    detail: { classification: cls, rows: posted },
  });

  return { ok: true, posted };
}

export async function rejectExtraction(extraction: CAExtraction, reason: string) {
  const { error } = await supabase
    .from("ca_document_extractions")
    .update({ review_state: "rejected", error_message: reason, reviewed_at: new Date().toISOString() })
    .eq("id", extraction.id);
  if (!error) {
    await logCAAudit({
      firmId: extraction.ca_firm_id,
      businessId: extraction.business_id,
      entityType: "document_extraction",
      entityId: extraction.id,
      action: "rejected",
      sourceDocumentId: extraction.document_id,
      detail: { reason },
    });
  }
  return error?.message ?? null;
}
