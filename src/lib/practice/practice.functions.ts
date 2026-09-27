/**
 * Practice backend API — TanStack server functions called by the v2 screens.
 *
 * Every function requires a signed-in user, resolves the user's firm on the
 * server and scopes all reads and writes to it. Server modules are imported
 * inside handlers so nothing server-only reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Db, FirmContext } from "./db.server";

async function withFirm<T>(userId: string, fn: (db: Db, ctx: FirmContext) => Promise<T>): Promise<T> {
  const { adminDb, firmContext } = await import("./db.server");
  const db = await adminDb();
  try {
    const ctx = await firmContext(db, userId);
    return await fn(db, ctx);
  } catch (e) {
    // Surface the human message; codes stay in server logs.
    const err = e as { code?: string; message?: string };
    if (err.code) console.error(`[practice] ${err.code}: ${err.message}`);
    throw new Error(err.message ?? "Something went wrong");
  }
}

const uuid = z.string().uuid();
const period = z.string().min(4).max(40);
const side = z.enum(["bank", "books"]);

/* ── workspace ─────────────────────────────────────────── */

export const getPracticeWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./workspace.server")).loadWorkspace(db, ctx)));

/* ── clients ───────────────────────────────────────────── */

const clientInput = z.object({
  name: z.string().min(1).max(200),
  entityType: z.string().max(60).optional(),
  gstin: z.string().max(20).optional(),
  contactName: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  doNotDisturb: z.boolean().optional(),
});

export const createPracticeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => clientInput.extend({ id: uuid.optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./clients.server")).createPracticeClient(db, ctx, data)));

export const updatePracticeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, patch: clientInput.partial().extend({ lastMis: z.string().max(20).optional() }) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./clients.server")).updatePracticeClient(db, ctx, data.id, data.patch)));

/* ── documents / Extract ───────────────────────────────── */

export const registerPracticeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    storage_path: z.string().min(3).max(500),
    filename: z.string().min(1).max(250),
    mime: z.string().max(120).nullable().optional(),
    business_id: uuid.nullable(),
    source: z.enum(["Manual", "Gmail", "WhatsApp"]).default("Manual"),
    side: side.optional(),
    chase_id: uuid.optional(),
  }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { assertClient } = await import("./db.server");
      if (data.business_id) await assertClient(db, ctx, data.business_id);
      const docs = await import("./documents.server");
      const res = await docs.registerDocument(db, { firmId: ctx.firmId, userId: ctx.userId }, {
        storage_path: data.storage_path, filename: data.filename, mime: data.mime ?? null, business_id: data.business_id,
        side: data.side ?? null, channel: data.source, request_id: data.chase_id ?? null,
      });
      const { data: row } = await db.from("ca_document_extractions").select("extract_status, txn_count, review_count, duplicate_count, error_message").eq("id", res.extraction_id).maybeSingle();
      return { ...res, ...row };
    }));

export const reprocessPracticeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { data: doc } = await db.from("ca_document_extractions").select("id").eq("id", data.id).eq("ca_firm_id", ctx.firmId).maybeSingle();
      if (!doc) throw new Error("Document not found.");
      await db.from("ca_document_extractions").update({ extract_status: "queued", extract_attempts: 0 }).eq("id", data.id);
      return (await import("./documents.server")).processExtraction(db, data.id);
    }));

export const assignPracticeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, business_id: uuid, side: side.optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { assertClient } = await import("./db.server");
      await assertClient(db, ctx, data.business_id);
      return (await import("./documents.server")).assignDocument(db, ctx, data.id, data.business_id, data.side);
    }));

export const getPracticeDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./documents.server")).documentUrl(db, ctx, data.id)));

/* ── Review Queue ──────────────────────────────────────── */

export const resolvePracticeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: uuid,
    action: z.enum(["confirm", "discard"]),
    patch: z.object({
      date: z.string().min(6).max(20),
      amount: z.number().finite().refine((n) => n !== 0, "Amount cannot be zero"),
      particulars: z.string().max(500),
      counterparty: z.string().max(200).nullable().optional(),
      reference: z.string().max(100).nullable().optional(),
    }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./documents.server")).resolveReviewItem(db, ctx, data.id, data.action, data.patch)));

/* ── Recon + Exception Queue ───────────────────────────── */

export const runPracticeRecon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ business_id: uuid, period }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./recon.server")).runRecon(db, ctx, data.business_id, data.period)));

export const resolvePracticeException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: uuid,
    action: z.enum(["match", "reconciled_external", "ignore"]),
    counterpart_ids: z.array(uuid).max(20).optional(),
    note: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./recon.server")).resolveException(db, ctx, data.id, data.action, data.counterpart_ids, data.note)));

export const reversePracticeMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./recon.server")).reverseMatch(db, ctx, data.id, data.note)));

export const getPracticeTransactionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./recon.server")).transactionHistory(db, ctx, data.id)));

/* ── Narrate / MIS ─────────────────────────────────────── */

const template = z.enum(["Monthly MIS", "Bank Reconciliation Summary", "Key Variances", "Working Paper", "Exception and Review Summary"]);

export const generatePracticeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ business_id: uuid, period, template }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./narrate.server")).generateReport(db, ctx, data.business_id, data.period, data.template)));

export const getPracticeNumberSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ report_id: uuid, key: z.string().min(1).max(120), page: z.number().int().min(0).max(1000).default(0) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./narrate.server")).numberSources(db, ctx, data.report_id, data.key, data.page)));

export const signOffPracticeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, by: z.string().min(1).max(120), note: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./narrate.server")).signOffReport(db, ctx, data.id, data.by, data.note)));

export const requestPracticeReportCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, note: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./narrate.server")).requestCorrection(db, ctx, data.id, data.note)));

/* ── Chaser ────────────────────────────────────────────── */

export const createPracticeChase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    business_id: uuid,
    type: z.string().min(1).max(200),
    contact: z.string().min(1).max(200),
    phone: z.string().max(30).optional(),
    due: z.string().max(20).nullable().optional(),
    note: z.string().max(1000).optional(),
    period: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./chaser.server")).createChase(db, ctx, data)));

export const sendPracticeFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, channel: z.enum(["Email", "WhatsApp"]) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./chaser.server")).sendFollowUp(db, ctx, data.id, data.channel)));

export const setPracticeChaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, status: z.enum(["Resolved", "Open"]), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./chaser.server")).setChaseStatus(db, ctx, data.id, data.status, data.note)));

/** Runs this firm's due follow-ups now (the scheduler does this every 15 minutes anyway). */
export const runPracticeFollowUpsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (_db, ctx) => (await import("./chaser.server")).runDueFollowups(new Date(), ctx.firmId)));

/* ── WhatsApp intake settings ──────────────────────────── */

export const getPracticeWhatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./whatsapp.server")).whatsappStatus(db, ctx)));

export const connectPracticeWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone_number_id: z.string().min(6).max(30), display_phone: z.string().max(30).optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./whatsapp.server")).connectWhatsappNumber(db, ctx, data.phone_number_id, data.display_phone)));
