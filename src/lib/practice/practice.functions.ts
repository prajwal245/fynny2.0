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

async function withFirm<T>(
  userId: string,
  fn: (db: Db, ctx: FirmContext) => Promise<T>,
): Promise<T> {
  const { adminDb, firmContext } = await import("./db.server");
  const db = await adminDb();
  try {
    const ctx = await firmContext(db, userId);
    return await fn(db, ctx);
  } catch (e) {
    // Surface the human message; codes stay in server logs.
    const err = e as { code?: string; message?: string };
    if (err.code) console.error(`[practice] ${err.code}: ${err.message}`);
    throw new Error(typeof err.message === "string" && err.message ? err.message : "Something went wrong. Please try again.");
  }
}

const uuid = z.string().uuid();
const period = z.string().min(4).max(40);
const side = z.enum(["bank", "books"]);

/* ── workspace ─────────────────────────────────────────── */

export const getPracticeWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./workspace.server")).loadWorkspace(db, ctx),
    ),
  );

/** Like withFirm, for actions that start new work: paused once the trial or plan has ended. */
async function withWork<T>(userId: string, fn: (db: Db, ctx: FirmContext) => Promise<T>, opts: { newClient?: boolean } = {}): Promise<T> {
  return withFirm(userId, async (db, ctx) => {
    const billing = await import("./billing.server");
    if (opts.newClient) await billing.assertClientRoom(db, ctx.firmId);
    else await billing.assertCanWork(db, ctx.firmId);
    return fn(db, ctx);
  });
}

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
    withWork(context.userId, async (db, ctx) =>
      (await import("./clients.server")).createPracticeClient(db, ctx, data),
    { newClient: true }),
  );

export const updatePracticeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        patch: clientInput
          .partial()
          .extend({ lastMis: z.string().max(20).optional() }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./clients.server")).updatePracticeClient(
        db,
        ctx,
        data.id,
        data.patch,
      ),
    ),
  );

export const archivePracticeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, reason: z.string().max(300).default("") }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./clients.server")).archivePracticeClient(db, ctx, data.id, data.reason)),
  );

/* ── documents / Extract ───────────────────────────────── */

export const registerPracticeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        storage_path: z.string().min(3).max(500),
        filename: z.string().min(1).max(250),
        mime: z.string().max(120).nullable().optional(),
        business_id: uuid.nullable(),
        source: z.enum(["Manual", "Gmail", "WhatsApp"]).default("Manual"),
        side: side.optional(),
        chase_id: uuid.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) => {
      const { assertClient } = await import("./db.server");
      if (data.business_id) await assertClient(db, ctx, data.business_id);
      const docs = await import("./documents.server");
      const res = await docs.registerDocument(
        db,
        { firmId: ctx.firmId, userId: ctx.userId },
        {
          storage_path: data.storage_path,
          filename: data.filename,
          mime: data.mime ?? null,
          business_id: data.business_id,
          side: data.side ?? null,
          channel: data.source,
          request_id: data.chase_id ?? null,
        },
      );
      const { data: row } = await db
        .from("ca_document_extractions")
        .select(
          "extract_status, txn_count, review_count, duplicate_count, error_message, classification, extracted, business_id, original_filename, created_at",
        )
        .eq("id", res.extraction_id)
        .maybeSingle();
      // The same file already in the firm: say where, so it can be opened or moved here.
      let existing: { id: string; clientId: string | null; clientName: string | null; filename: string; at: string; sameClient: boolean } | null = null;
      if (res.duplicate && row) {
        const bid = (row.business_id as string | null) ?? null;
        const { data: cl } = bid ? await db.from("ca_clients").select("client_name").eq("ca_firm_id", ctx.firmId).eq("business_id", bid).maybeSingle() : { data: null };
        existing = {
          id: res.extraction_id,
          clientId: bid,
          clientName: (cl?.client_name as string | undefined) ?? null,
          filename: String(row.original_filename ?? ""),
          at: String(row.created_at ?? "").slice(0, 10),
          sameClient: bid === (data.business_id ?? null),
        };
      }
      // Which months the file's lines fall in, so the app can say when none is the month on screen.
      const { data: dated } = await db
        .from("ca_txns")
        .select("txn_date")
        .eq("extraction_id", res.extraction_id)
        .limit(5000);
      const months: Record<string, number> = {};
      for (const t of dated ?? []) {
        const m = String(t.txn_date ?? "").slice(0, 7);
        if (m) months[m] = (months[m] ?? 0) + 1;
      }
      const register = (row?.extracted as { register?: { label?: string; entries?: number } } | null)?.register ?? null;
      return {
        ...res,
        extract_status: row?.extract_status ?? null,
        txn_count: row?.txn_count ?? null,
        review_count: row?.review_count ?? null,
        duplicate_count: row?.duplicate_count ?? null,
        error_message: row?.error_message ?? null,
        classification: row?.classification ?? null,
        months,
        register: register ? { label: register.label ?? "Register", entries: register.entries ?? 0 } : null,
        existing,
      };
    }),
  );

export const reprocessPracticeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) => {
      const { data: doc } = await db
        .from("ca_document_extractions")
        .select("id")
        .eq("id", data.id)
        .eq("ca_firm_id", ctx.firmId)
        .maybeSingle();
      if (!doc) throw new Error("Document not found.");
      await db
        .from("ca_document_extractions")
        .update({ extract_status: "queued", extract_attempts: 0, extract_next_attempt_at: null })
        .eq("id", data.id);
      return (await import("./documents.server")).processExtraction(
        db,
        data.id,
        { trigger: "user", userId: ctx.userId },
      );
    }),
  );

export const assignPracticeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, business_id: uuid, side: side.optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { assertClient } = await import("./db.server");
      await assertClient(db, ctx, data.business_id);
      return (await import("./documents.server")).assignDocument(
        db,
        ctx,
        data.id,
        data.business_id,
        data.side,
      );
    }),
  );

export const getPracticeDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./documents.server")).documentUrl(db, ctx, data.id),
    ),
  );

/* ── Review Queue ──────────────────────────────────────── */

export const resolvePracticeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        action: z.enum(["confirm", "discard"]),
        patch: z
          .object({
            date: z.string().min(6).max(20),
            amount: z
              .number()
              .finite()
              .refine((n) => n !== 0, "Amount cannot be zero"),
            particulars: z.string().max(500),
            counterparty: z.string().max(200).nullable().optional(),
            reference: z.string().max(100).nullable().optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const result = await (await import("./documents.server")).resolveReviewItem(
        db,
        ctx,
        data.id,
        data.action,
        data.patch,
      );
      // A confirmed line can complete its month: let Recon pick it up now.
      const txnId = (result as { txn_id?: string | null }).txn_id;
      if (data.action === "confirm" && txnId) {
        const orch = await import("./orchestrator.server");
        await orch.afterReviewConfirmed(db, ctx.firmId, txnId).catch(() => null);
      }
      return result;
    }),
  );

/* ── Recon + Exception Queue ───────────────────────────── */

export const runPracticeRecon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ business_id: uuid, period }).parse(d))
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) => {
      const orch = await import("./orchestrator.server");
      const { parsePeriod } = await import("./core");
      const label = parsePeriod(data.period).label;
      const summary = await orch.withRun(
        db,
        { firmId: ctx.firmId, businessId: data.business_id, agent: "recon", trigger: "user", period: label, userId: ctx.userId },
        async () => (await import("./recon.server")).runRecon(db, ctx, data.business_id, data.period),
        (s) => ({ summary: s.message, detail: { run_id: s.run_id, matched_by_stage: s.matched_by_stage, exceptions: s.exceptions_by_reason } }),
      );
      await orch.afterRecon(db, ctx.firmId, data.business_id, label).catch(() => false);
      return summary;
    }),
  );

export const reopenPracticeException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const recon = await import("./recon.server");
      const res = await recon.reopenException(db, ctx, data.id);
      const { data: ex } = await db.from("ca_exceptions").select("business_id, period_start, period_end").eq("id", data.id).maybeSingle();
      if (ex?.business_id) await recon.refreshOpenReasons(db, ctx, ex.business_id, ex.period_start ? String(ex.period_start) : null, ex.period_end ? String(ex.period_end) : null).catch(() => undefined);
      return res;
    }),
  );

export const resolvePracticeException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        action: z.enum(["match", "reconciled_external", "ignore"]),
        counterpart_ids: z.array(uuid).max(20).optional(),
        note: z.string().max(500).optional(),
        allow_difference: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
    {
      const result = await (await import("./recon.server")).resolveException(
        db,
        ctx,
        data.id,
        data.action,
        data.counterpart_ids,
        data.note,
        { allowDifference: data.allow_difference },
      );
      // Clearing the last exception can make the month ready for its MIS.
      const { data: ex } = await db
        .from("ca_exceptions")
        .select("business_id, period_start, period_end")
        .eq("id", data.id)
        .maybeSingle();
      if (ex?.business_id && ex.period_start && ex.period_end) {
        // The other open lines may have pointed at the entry just used: explain them again.
        await (await import("./recon.server"))
          .refreshOpenReasons(db, ctx, ex.business_id, String(ex.period_start), String(ex.period_end))
          .catch(() => undefined);
        const { parsePeriod } = await import("./core");
        const orch = await import("./orchestrator.server");
        await orch
          .afterRecon(db, ctx.firmId, ex.business_id, parsePeriod(String(ex.period_start).slice(0, 7)).label)
          .catch(() => false);
      }
      return result;
    }),
  );

export const reversePracticeMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./recon.server")).reverseMatch(
        db,
        ctx,
        data.id,
        data.note,
      ),
    ),
  );

export const unmatchPracticeMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, note: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./recon.server")).unmatchFromRecon(db, ctx, data.id, data.note)),
  );

export const getPracticeTransactionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./recon.server")).transactionHistory(db, ctx, data.id),
    ),
  );

/* ── Narrate / MIS ─────────────────────────────────────── */

const template = z.enum([
  "Monthly MIS",
  "Bank Reconciliation Summary",
  "Key Variances",
  "Working Paper",
  "Exception and Review Summary",
]);

export const generatePracticeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ business_id: uuid, period, template }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) =>
      (await import("./orchestrator.server")).withRun(
        db,
        {
          firmId: ctx.firmId,
          businessId: data.business_id,
          agent: "narrate",
          trigger: "user",
          period: data.period,
          subjectLabel: data.template,
          userId: ctx.userId,
        },
        async () =>
          (await import("./narrate.server")).generateReport(
            db,
            ctx,
            data.business_id,
            data.period,
            data.template,
          ),
        (r) => ({
          summary: `${r.template} generated for ${r.period}`,
          detail: { report_id: r.id },
        }),
      ),
    ),
  );

export const getPracticeNumberSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        report_id: uuid,
        key: z.string().min(1).max(120),
        page: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./narrate.server")).numberSources(
        db,
        ctx,
        data.report_id,
        data.key,
        data.page,
      ),
    ),
  );

export const signOffPracticeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        by: z.string().min(1).max(120),
        note: z.string().max(1000).optional(),
        acknowledge_open: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./narrate.server")).signOffReport(
        db,
        ctx,
        data.id,
        data.by,
        data.note,
        { acknowledgeOpen: data.acknowledge_open },
      ),
    ),
  );

export const markPracticeReportCorrected = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, what: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./narrate.server")).markCorrected(db, ctx, data.id, data.what)),
  );

export const requestPracticeReportCorrection = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, note: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./narrate.server")).requestCorrection(
        db,
        ctx,
        data.id,
        data.note,
      ),
    ),
  );

/* ── Chaser ────────────────────────────────────────────── */

export const createPracticeChase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        business_id: uuid,
        type: z.string().min(1).max(200),
        contact: z.string().min(1).max(200),
        email: z.string().email().max(254).optional(),
        phone: z.string().max(30).optional(),
        due: z.string().max(20).nullable().optional(),
        note: z.string().max(1000).optional(),
        period: z.string().max(40).nullable().optional(),
        channels: z.enum(["email", "whatsapp", "both"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) =>
      (await import("./chaser.server")).createChase(db, ctx, data, { sendNow: true }),
    ),
  );

export const sendPracticeFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, channel: z.enum(["Email", "WhatsApp"]) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) =>
      (await import("./chaser.server")).sendFollowUp(
        db,
        ctx,
        data.id,
        data.channel,
      ),
    ),
  );

export const setPracticeChaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        status: z.enum(["Resolved", "Open", "Escalated"]),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./chaser.server")).setChaseStatus(
        db,
        ctx,
        data.id,
        data.status,
        data.note,
      ),
    ),
  );

/** The client promised the document by a date: pause follow-ups until the day after. */
export const snoozePracticeChase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid, promised_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./chaser.server")).snoozeChase(db, ctx, data.id, data.promised_on),
    ),
  );

/** Runs this firm's due follow-ups now (the scheduler does this every 15 minutes anyway). */
export const runPracticeFollowUpsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withWork(context.userId, async (_db, ctx) =>
      (await import("./chaser.server")).runDueFollowups(new Date(), ctx.firmId),
    ),
  );

/* ── WhatsApp intake settings ──────────────────────────── */

export const getPracticeWhatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./whatsapp.server")).whatsappStatus(db, ctx),
    ),
  );

/** Checks token, number, webhook settings and the chase template, and says which fails. */
export const checkPracticeWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./whatsapp.server")).whatsappHealth(db, ctx),
    ),
  );

/** What each stage of a chase will send (template name, status at Meta, buttons), for Settings. */
export const getPracticeWhatsappTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { resolveSender } = await import("./whatsappSend.server");
      const r = await resolveSender(db, ctx.firmId);
      const { stagesView } = await import("./whatsappTemplates.server");
      return { test: r.test, shared: r.sender?.shared ?? false, stages: r.sender ? await stagesView(r.sender) : await stagesView(null) };
    }),
  );

export const connectPracticeWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phone_number_id: z.string().min(6).max(30),
        display_phone: z.string().max(30).optional(),
        /** Only for a number on the firm's own Meta business account. Stored encrypted. */
        access_token: z.string().min(20).max(1000).optional(),
        waba_id: z.string().max(30).optional(),
        /** The firm's own Meta app secret, so Meta's webhooks for that number can be verified. */
        app_secret: z.string().min(10).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { canSignOff } = await import("./db.server");
      if (!canSignOff(ctx)) throw new Error("Only a partner can connect the firm's WhatsApp number.");
      return (await import("./whatsapp.server")).connectWhatsappNumber(
        db,
        ctx,
        data.phone_number_id,
        data.display_phone,
        { accessToken: data.access_token, wabaId: data.waba_id, appSecret: data.app_secret },
      );
    }),
  );

/* ── practice (firm) ───────────────────────────────────── */

/**
 * Creates the signed-in user's practice on first run, or updates it. Runs on
 * the server so onboarding does not depend on browser-side insert policies.
 */
export const savePracticeFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().max(200).optional(),
        city: z.string().max(100).optional(),
        frn: z.string().max(40).optional(),
        email: z.string().max(200).optional(),
        partnerName: z.string().max(120).optional(),
        /** The partner's mobile number, and whether they agreed to WhatsApp help and trial updates. */
        phone: z.string().max(24).optional(),
        whatsappOk: z.boolean().optional(),
        /** Sent by the Settings page: an edit, not joining during onboarding. */
        settings: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { adminDb, firmContext } = await import("./db.server");
    const db = await adminDb();
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined)
      payload.firm_name = data.name.trim() || "My practice";
    if (data.city !== undefined) payload.city = data.city.trim();
    if (data.frn !== undefined) payload.membership_number = data.frn.trim();
    if (data.email !== undefined) payload.email = data.email.trim();
    if (data.partnerName !== undefined)
      payload.ca_name = data.partnerName.trim();
    if (data.phone !== undefined) {
      const { parseMobile } = await import("./mobile");
      const m = parseMobile(data.phone);
      if (data.phone.trim() && !m) throw new Error("Enter a valid mobile number, for example 98200 11223.");
      payload.phone = m?.digits ?? "";
    }

    let existing: Awaited<ReturnType<typeof firmContext>> | null = null;
    try {
      existing = await firmContext(db, context.userId);
    } catch {
      existing = null;
    }
    const firmId = existing?.firmId ?? null;
    const mayEdit = existing && ["owner", "admin", "partner"].includes(existing.role);
    if (existing && !mayEdit && data.settings)
      throw new Error("Only a partner can change the firm's details.");
    if (existing && !mayEdit) {
      // An invited colleague joined an existing practice; its details are not theirs to change.
      return {
        id: existing.firmId,
        created: false,
        joined: true,
        firmName: existing.firmName,
      };
    }
    if (data.whatsappOk !== undefined) {
      let prefs: Record<string, unknown> = {};
      if (firmId) {
        const { data: cur } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
        prefs = (cur?.notification_prefs ?? {}) as Record<string, unknown>;
      }
      payload.notification_prefs = { ...prefs, touch_whatsapp_ok: data.whatsappOk };
    }
    if (firmId) {
      if (Object.keys(payload).length) {
        const { error } = await db
          .from("ca_firms")
          .update(payload)
          .eq("id", firmId);
        if (error)
          throw new Error(`Could not save the practice: ${error.message}`);
      }
      return { id: firmId, created: false };
    }
    const { data: firm, error } = await db
      .from("ca_firms")
      .insert({
        user_id: context.userId,
        firm_name: "My practice",
        verification_status: "approved",
        is_verified: true,
        ...payload,
      })
      .select("id")
      .single();
    if (error)
      throw new Error(`Could not create the practice: ${error.message}`);
    // The owner is the firm's first partner (the role check allows partner,
    // manager, senior, junior and staff). File storage policies rely on this row.
    const { error: memberErr } = await db.from("ca_firm_members").insert({
      ca_firm_id: firm.id,
      user_id: context.userId,
      invited_email: data.email ?? "",
      role: "partner",
      status: "active",
      is_active: true,
    });
    if (memberErr) {
      await db.from("ca_firms").delete().eq("id", firm.id);
      throw new Error(`Could not create the practice: ${memberErr.message}`);
    }
    return { id: firm.id as string, created: true };
  });

/* ── team and integrations (Settings) ──────────────────── */

export const listPracticeTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./team.server")).listTeam(db, ctx),
    ),
  );

export const invitePracticeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().min(3).max(200),
        role: z.enum(["partner", "manager", "senior", "junior", "staff"]),
        origin: z.string().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./team.server")).inviteMember(
        db,
        ctx,
        data.email,
        data.role,
        data.origin ?? null,
      ),
    ),
  );

export const revokePracticeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./team.server")).revokeMember(db, ctx, data.id),
    ),
  );

export const getPracticeIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./team.server")).integrationStatus(db, ctx),
    ),
  );

// ── Orchestration: agent memory and automation settings ─────────────────────

export const getPracticeMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./orchestrator.server")).listMemory(db, ctx),
    ),
  );

export const forgetPracticeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ kind: z.enum(["lesson", "alias"]), id: uuid }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { canSignOff } = await import("./db.server");
      if (!canSignOff(ctx))
        throw new Error("Only a partner can change what the agents remember.");
      return (await import("./orchestrator.server")).forgetMemory(
        db,
        ctx,
        data.kind,
        data.id,
      );
    }),
  );

export const getPracticePipelineSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./orchestrator.server")).getPipelineSettings(db, ctx),
    ),
  );

export const updatePracticePipelineSettings = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        auto_recon: z.boolean().optional(),
        auto_chase_day: z.number().int().min(1).max(28).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { canSignOff } = await import("./db.server");
      if (!canSignOff(ctx))
        throw new Error("Only a partner can change the firm's automation.");
      return (await import("./orchestrator.server")).updatePipelineSettings(
        db,
        ctx,
        data,
      );
    }),
  );

/* ── billing ──────────────────────────────────────────── */

/** Partners switch the lifecycle emails (trial reminders, tips, usage summaries) on or off. */
export const setPracticeLifecycleEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      const { PracticeError } = await import("./core");
      const { canSignOff } = await import("./db.server");
      if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can change the firm's email settings.");
      await (await import("./lifecycle/optout.server")).setLifecycleEmails(db, ctx.firmId, data.on);
      return { on: data.on };
    }),
  );

export const getPracticeBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).billingView(db, ctx)),
  );

export const startPracticeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        plan: z.enum(["starter", "professional", "scale"]),
        cycle: z.enum(["monthly", "annual"]),
        billingName: z.string().max(120).optional().nullable(),
        gstin: z.string().max(20).optional().nullable(),
        coupon: z.string().max(32).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) =>
      (await import("./billing.server")).startCheckout(db, ctx, data.plan, data.cycle, { billingName: data.billingName, gstin: data.gstin, coupon: data.coupon }),
    ),
  );

export const previewPracticeCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ code: z.string().min(3).max(32), plan: z.enum(["starter", "professional", "scale"]).optional(), cycle: z.enum(["monthly", "annual"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).previewCoupon(db, ctx, data.code, data.plan, data.cycle)),
  );

export const redeemPracticeTrialCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(3).max(32) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).redeemTrialCoupon(db, ctx, data.code)),
  );

export const cancelPracticePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reason: z.string().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).cancelSubscription(db, ctx, data.reason)),
  );

export const changePracticePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ plan: z.enum(["starter", "professional", "scale"]), cycle: z.enum(["monthly", "annual"]) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).changePlan(db, ctx, data.plan, data.cycle)),
  );

export const getPracticePayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).paymentHistory(db, ctx)),
  );

export const confirmPracticeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        razorpay_payment_id: z.string().min(4).max(64),
        razorpay_subscription_id: z.string().min(4).max(64),
        razorpay_signature: z.string().min(16).max(256),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing.server")).confirmCheckout(db, ctx, data)),
  );

/* ── WhatsApp credits ──────────────────────────────────── */

export const getPracticeCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing/credits.server")).creditsView(db, ctx)),
  );

export const startPracticeCreditTopUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pack: z.enum(["c500", "c2000", "c5000"]) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing/credits.server")).createTopUpOrder(db, ctx, data.pack)),
  );

export const confirmPracticeCreditTopUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ razorpay_order_id: z.string().min(4).max(64), razorpay_payment_id: z.string().min(4).max(64), razorpay_signature: z.string().min(16).max(256) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing/credits.server")).confirmTopUp(db, ctx, data)),
  );

export const savePracticeCreditSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ autoTopup: z.boolean(), autoPack: z.enum(["c500", "c2000", "c5000"]), autoMaxPerMonth: z.number().int().min(1).max(10) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./billing/credits.server")).saveSettings(db, ctx, data)),
  );

/* ── Zoho Books (read-only) ────────────────────────────── */

async function asPartner(ctx: FirmContext, what: string) {
  const { canSignOff } = await import("./db.server");
  if (!canSignOff(ctx)) throw new Error(`Only a partner can ${what}.`);
}

export const zohoBooksStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => withFirm(context.userId, async (db, ctx) => (await import("./zoho.server")).status(db, ctx)));

/** Starts Zoho consent. A cookie ties the callback to this browser. */
export const zohoBooksConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ write: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (_db, ctx) => {
      await asPartner(ctx, "connect Zoho Books");
      const zoho = await import("./zoho.server");
      if (!zoho.zohoConfigured()) throw new Error("Zoho Books isn't switched on for FynHelp yet.");
      if (data?.write && !zoho.postingAvailable(ctx.firmId)) throw new Error("Posting to Zoho Books isn't switched on for your firm.");
      const nonce = zoho.newNonce();
      const { setCookie } = await import("@tanstack/react-start/server");
      setCookie(zoho.NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env["NODE_ENV"] === "production", sameSite: "lax", path: "/api/integrations/zoho", maxAge: 900 });
      return { url: await zoho.consentUrl(ctx.firmId, ctx.userId, nonce, !!data?.write) };
    }),
  );

export const zohoBooksOrganizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => withFirm(context.userId, async (db, ctx) => (await import("./zoho.server")).organizations(db, ctx)));

export const zohoBooksBankAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().regex(/^\d{1,30}$/) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./zoho.server")).bankAccounts(db, ctx, data.organizationId)),
  );

export const zohoBooksLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        businessId: uuid,
        organizationId: z.string().regex(/^\d{1,30}$/),
        organizationName: z.string().min(1).max(200),
        accountId: z.string().regex(/^\d{1,30}$/),
        accountName: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "link a client to Zoho Books");
      const { assertClient } = await import("./db.server");
      await assertClient(db, ctx, data.businessId);
      return (await import("./zoho.server")).link(db, ctx, data);
    }),
  );

export const zohoBooksUnlink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linkId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "unlink a Zoho Books account");
      return (await import("./zoho.server")).unlink(db, ctx, data.linkId);
    }),
  );

export const zohoBooksDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "disconnect Zoho Books");
      return (await import("./zoho.server")).disconnect(db, ctx);
    }),
  );

export const zohoBooksOpenInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linkId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./zoho.server")).openInvoices(db, ctx, data.linkId)),
  );

export const zohoBooksSetPosting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linkId: uuid, enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "switch posting to Zoho Books on or off");
      return (await import("./zoho.server")).setPosting(db, ctx, data.linkId, data.enabled);
    }),
  );

export const zohoBooksPreviewPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linkId: uuid, txnId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "post to Zoho Books");
      return (await import("./zoho.server")).previewPost(db, ctx, data.linkId, data.txnId);
    }),
  );

export const zohoBooksPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linkId: uuid, txnId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) => {
      await asPartner(ctx, "post to Zoho Books");
      return (await import("./zoho.server")).post(db, ctx, data.linkId, data.txnId);
    }),
  );

export const zohoBooksUndoPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ postingId: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "undo a Zoho Books entry");
      return (await import("./zoho.server")).undoPost(db, ctx, data.postingId);
    }),
  );

export const zohoBooksPostings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => withFirm(context.userId, async (db, ctx) => (await import("./zoho.server")).listPostings(db, ctx)));

export const zohoBooksSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linkId: uuid, month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) =>
    withWork(context.userId, async (db, ctx) => (await import("./zoho.server")).sync(db, ctx, data.linkId, data.month)),
  );

/* ── Tally connector ──────────────────────────────────── */

export const tallyConnectors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./tallyConnector.server")).listConnectors(db, ctx)),
  );

/** Creates a connector and returns its secret token once. */
export const tallyConnectorCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "connect Tally");
      return (await import("./tallyConnector.server")).createConnector(db, ctx, data.name);
    }),
  );

export const tallyConnectorRevoke = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "remove a Tally connector");
      return (await import("./tallyConnector.server")).revokeConnector(db, ctx, data.id);
    }),
  );

export const tallyCompanyMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ company_id: uuid, business_id: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "link a Tally company to a client");
      return (await import("./tallyConnector.server")).mapCompany(db, ctx, data.company_id, data.business_id);
    }),
  );

export const tallySyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./tallyConnector.server")).requestSync(db, ctx, data.id)),
  );

/* ── Referrals ────────────────────────────────────────── */

export const referralOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    withFirm(context.userId, async (db, ctx) => (await import("./referrals.server")).referralView(db, ctx)),
  );

/** A new firm uses someone's code. Only the owner of the firm can do this; nothing is rewarded until its first client. */
export const referralApply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) =>
    withFirm(context.userId, async (db, ctx) => {
      await asPartner(ctx, "add a referral code");
      return (await import("./referrals.server")).applyReferral(db, ctx, data.code);
    }),
  );
