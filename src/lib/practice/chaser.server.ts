/**
 * Chaser agent — server side. Chase items live in ca_document_requests
 * (managed_by = 'practice'); every touch is a ca_chaser_events row.
 */
import { PracticeError, parsePeriod } from "./core";
import {
  adminDb,
  assertClient,
  chaserEvent,
  clientMeta,
  logActivity,
  type Db,
  type FirmContext,
} from "./db.server";
import {
  decide,
  inSendWindow,
  isClosed,
  parseTone,
  renderEmail,
  renderGroupedEmail,
  slotAt,
  snoozeResume,
  whatsappLink,
  whatsappMessage,
  DEFAULT_MAX_FOLLOW_UPS,
  DEFAULT_SCHEDULE,
  type ChaseState,
  type ChaserTone,
  type RenderedEmail,
  type TemplateInput,
} from "./chaser/rules";
import { isEmail, sendEmail, type SendResult } from "./email.server";
import { sendViaGmail } from "./gmailSend.server";
import { sendChaseWhatsapp } from "./whatsappSend.server";
import { chaseTemplateParams } from "./whatsappFlow";

const DAY = 86_400_000;

interface ChaseRow {
  id: string;
  ca_firm_id: string;
  business_id: string;
  title: string;
  doc_types: string[];
  period: string | null;
  due_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  chaser_count: number;
  max_follow_ups: number;
  schedule_days: number[];
  escalated_at: string | null;
  last_chased_at: string | null;
  next_follow_up_at: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

const COLS =
  "id, ca_firm_id, business_id, title, doc_types, period, due_date, notes, status, created_at, chaser_count, max_follow_ups, schedule_days, escalated_at, last_chased_at, next_follow_up_at, contact_name, contact_email, contact_phone";

/** "Missing bank statement" → "Bank statement" for the message text. */
const itemName = (title: string) => {
  const t = title.replace(/^missing\s+/i, "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "Documents";
};

function noteOf(notes: string | null): string | null {
  if (!notes) return null;
  try {
    return (JSON.parse(notes) as { note?: string }).note ?? null;
  } catch {
    return notes;
  }
}

async function templateInput(
  db: Db,
  row: ChaseRow,
  firmName: string,
): Promise<
  TemplateInput & {
    dnd: boolean;
    clientEmail: string | null;
    clientPhone: string | null;
  }
> {
  const { data: client } = await db
    .from("ca_clients")
    .select("client_name, client_email, client_phone, notes, do_not_disturb")
    .eq("ca_firm_id", row.ca_firm_id)
    .eq("business_id", row.business_id)
    .limit(1)
    .maybeSingle();
  const meta = clientMeta(client?.notes ?? null);
  return {
    contactName: row.contact_name || meta.contactName || "",
    clientName: client?.client_name ?? "your business",
    firmName,
    item: itemName(row.title),
    period: row.period,
    dueDate: row.due_date,
    note: noteOf(row.notes),
    dnd: Boolean(client?.do_not_disturb),
    clientEmail: client?.client_email ?? null,
    clientPhone: client?.client_phone ?? null,
  };
}

/* ── how a chase email leaves: the firm's Gmail when opted in, else FynHelp ── */

interface ChasePrefs {
  viaGmail: boolean;
  tone: ChaserTone;
  /** Also nudge on WhatsApp from the second reminder on (Firm and Scale plans). */
  whatsappAuto: boolean;
}

async function firmChasePrefs(db: Db, firmId: string): Promise<ChasePrefs> {
  const { data } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
  const p = (data?.notification_prefs ?? {}) as Record<string, unknown>;
  return {
    // Both: the partner switched it on, and Google actually granted sending.
    viaGmail: p["chaser_via_gmail"] === true && p["gmail_send_granted"] === true,
    tone: parseTone(p["chaser_tone"]),
    whatsappAuto: p["chaser_whatsapp_auto"] === true,
  };
}

interface Delivered {
  result: SendResult;
  sentVia: "gmail" | "fynhelp";
  threadId: string | null;
  threadSubject: string | null;
  subject: string;
  note: string | null;
}

async function deliver(
  db: Db,
  firm: { id: string; name: string; email: string | null },
  prefs: ChasePrefs,
  email: RenderedEmail,
  to: string,
  chaseIds: string[],
): Promise<Delivered> {
  let note: string | null = null;
  if (prefs.viaGmail) {
    const { data: prev } = await db
      .from("ca_chaser_events")
      .select("metadata")
      .in("chaser_id", chaseIds)
      .eq("event_type", "sent")
      .order("created_at", { ascending: false })
      .limit(10);
    const meta = (prev ?? [])
      .map((r) => r.metadata as { gmail_thread_id?: string; thread_subject?: string } | null)
      .find((m) => m?.gmail_thread_id);
    const g = await sendViaGmail(db, firm.id, {
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      fromName: firm.name,
      replyTo: firm.email,
      thread: meta?.gmail_thread_id ? { id: meta.gmail_thread_id, subject: meta.thread_subject ?? email.subject } : null,
    });
    if (g.ok) {
      return {
        result: { sent: true, simulated: false, provider_id: g.id, error: null },
        sentVia: "gmail",
        threadId: g.threadId,
        threadSubject: meta?.thread_subject ?? email.subject,
        subject: g.subject,
        note: null,
      };
    }
    note = `Gmail could not send (${g.error}); sent from the FynHelp address instead.`;
    if (g.needsConsent) {
      // Sending permission is gone: ask the partner to allow it again.
      const { data: f } = await db.from("ca_firms").select("notification_prefs").eq("id", firm.id).maybeSingle();
      await db
        .from("ca_firms")
        .update({ notification_prefs: { ...((f?.notification_prefs as object | null) ?? {}), gmail_send_granted: false } })
        .eq("id", firm.id);
    }
  }
  const result = await sendEmail({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: firm.email,
    fromName: firm.name,
  });
  return { result, sentVia: "fynhelp", threadId: null, threadSubject: null, subject: email.subject, note };
}

const sentMetadata = (d: Delivered) => ({
  subject: d.subject,
  simulated: d.result.simulated,
  provider_id: d.result.provider_id,
  sent_via: d.sentVia,
  ...(d.threadId ? { gmail_thread_id: d.threadId, thread_subject: d.threadSubject } : {}),
});

/** The client promised the document by a date: pause follow-ups until the day after. */
export async function snoozeChase(db: Db, ctx: FirmContext, id: string, promisedOn: string) {
  const row = await loadChase(db, ctx, id);
  if (isClosed(row.status)) throw new PracticeError("closed", "This chase is already resolved.");
  const resume = snoozeResume(promisedOn, new Date());
  if (!resume)
    throw new PracticeError("bad_date", "Pick a date between tomorrow and 60 days from now.");
  await db.from("ca_document_requests").update({ next_follow_up_at: resume }).eq("id", row.id);
  await chaserEvent(db, {
    chaser_id: row.id,
    ca_firm_id: ctx.firmId,
    business_id: row.business_id,
    event_type: "snoozed",
    note: `Client promised it by ${promisedOn}. Follow-ups resume the next day if it has not arrived.`,
    actor_id: ctx.userId,
    metadata: { promised_on: promisedOn, resume_at: resume },
  });
  return { resume_at: resume };
}

export interface CreateChaseInput {
  business_id: string;
  type: string;
  contact: string; // a name or an email address
  /** Where follow-ups go; defaults to the client's saved email. */
  email?: string;
  phone?: string;
  due?: string | null;
  note?: string;
  period?: string | null;
}

export async function createChase(
  db: Db,
  ctx: FirmContext,
  input: CreateChaseInput,
) {
  const client = await assertClient(db, ctx, input.business_id);
  const contactIsEmail = isEmail(input.contact);
  const meta = clientMeta(client.notes);
  const contactEmail = input.email?.trim() || (contactIsEmail ? input.contact.trim() : client.client_email);
  const contactName = contactIsEmail
    ? (meta.contactName ?? null)
    : input.contact.trim() || meta.contactName || null;
  let period: string | null = null;
  if (input.period) {
    try {
      period = parsePeriod(input.period).label;
    } catch {
      period = input.period;
    }
  }
  const now = new Date();
  const { data, error } = await db
    .from("ca_document_requests")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: input.business_id,
      title: input.type.slice(0, 200),
      doc_types: [input.type],
      period,
      due_date: input.due || null,
      status: "open",
      requested_by: ctx.userId,
      chaser_count: 0,
      notes: JSON.stringify({
        note: input.note ?? "",
        contact: input.contact,
        phone: input.phone ?? "",
      }),
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: input.phone || client.client_phone,
      max_follow_ups: DEFAULT_MAX_FOLLOW_UPS,
      schedule_days: DEFAULT_SCHEDULE,
      next_follow_up_at: now.toISOString(),
      managed_by: "practice",
    })
    .select(COLS)
    .single();
  if (error) throw new PracticeError("db_error", error.message);
  await chaserEvent(db, {
    chaser_id: data.id,
    ca_firm_id: ctx.firmId,
    business_id: input.business_id,
    event_type: "created",
    note: contactEmail
      ? `Chase created. First email goes out today to ${contactEmail}.`
      : "Chase created. No email on file: use WhatsApp or add the client's email.",
    actor_id: ctx.userId,
  });
  await logActivity(
    db,
    ctx.firmId,
    input.business_id,
    "chaser",
    `Chase created for ${input.type}.`,
  );
  return data as ChaseRow;
}

async function loadChase(
  db: Db,
  ctx: FirmContext,
  id: string,
): Promise<ChaseRow> {
  const { data } = await db
    .from("ca_document_requests")
    .select(COLS)
    .eq("id", id)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!data) throw new PracticeError("not_found", "Chase not found.");
  return data as ChaseRow;
}

function nextSlot(row: ChaseRow, sentCount: number, now: Date): string {
  const next = slotAt(
    row.created_at,
    row.schedule_days?.length ? row.schedule_days : DEFAULT_SCHEDULE,
    sentCount,
  );
  return next && Date.parse(next) > now.getTime()
    ? next
    : new Date(now.getTime() + 4 * DAY).toISOString();
}

/** A follow-up sent now by a person (Email) or prepared for WhatsApp. */
export async function sendFollowUp(
  db: Db,
  ctx: FirmContext,
  id: string,
  channel: "Email" | "WhatsApp",
) {
  const row = await loadChase(db, ctx, id);
  if (isClosed(row.status))
    throw new PracticeError(
      "closed",
      "This chase is already resolved. Nothing was sent.",
    );
  const t = await templateInput(db, row, ctx.firmName);
  const now = new Date();
  const count = row.chaser_count + 1;

  if (channel === "WhatsApp") {
    const { loadBilling } = await import("./billing.server");
    const { accessFor } = await import("./billing/plans");
    if (!accessFor(await loadBilling(db, ctx.firmId)).whatsappChaser)
      throw new PracticeError("plan_feature", "Chasing by WhatsApp is on the Firm and Scale plans. Email follow-ups work on every plan.");
    // Official API first: the message goes out itself, with delivery tracked.
    const api = await sendChaseWhatsapp(
      db,
      ctx.firmId,
      row.contact_phone || t.clientPhone,
      chaseTemplateParams({
        contactName: t.contactName,
        clientName: t.clientName,
        items: [`${t.item}${t.period ? ` (${t.period})` : ""}`],
        firmName: ctx.firmName,
      }),
    );
    if (api.ok) {
      await db
        .from("ca_document_requests")
        .update({ chaser_count: count, last_chased_at: now.toISOString(), next_follow_up_at: nextSlot(row, count, now) })
        .eq("id", row.id);
      await chaserEvent(db, {
        chaser_id: row.id,
        ca_firm_id: ctx.firmId,
        business_id: row.business_id,
        event_type: "sent",
        channel: "whatsapp",
        template_id: "chase_whatsapp_template",
        note: `WhatsApp follow up sent to +${api.to}`,
        actor_id: ctx.userId,
        metadata: { wamid: api.wamid, delivery: "sent" },
      });
      return { channel, via: "api" as const, to: api.to, follow_ups: count };
    }
    if (!api.unconfigured) {
      await chaserEvent(db, {
        chaser_id: row.id,
        ca_firm_id: ctx.firmId,
        business_id: row.business_id,
        event_type: "skipped",
        channel: "whatsapp",
        note: `WhatsApp could not be sent: ${api.error}`,
        actor_id: ctx.userId,
      });
      throw new PracticeError("whatsapp_failed", api.error);
    }
    // Not set up for the API on this server: fall back to opening WhatsApp with the message ready.
    const message = whatsappMessage(t);
    const link = whatsappLink(row.contact_phone || t.clientPhone, message);
    if (!link.url) throw new PracticeError("invalid_phone", link.error!);
    await db
      .from("ca_document_requests")
      .update({
        chaser_count: count,
        last_chased_at: now.toISOString(),
        next_follow_up_at: nextSlot(row, count, now),
      })
      .eq("id", row.id);
    await chaserEvent(db, {
      chaser_id: row.id,
      ca_firm_id: ctx.firmId,
      business_id: row.business_id,
      event_type: "whatsapp_quick_send",
      channel: "whatsapp",
      template_id: "chase_whatsapp",
      note: "WhatsApp follow up prepared and opened",
      actor_id: ctx.userId,
      metadata: { message },
    });
    return { channel, via: "link" as const, url: link.url, message, follow_ups: count };
  }

  const to = row.contact_email || t.clientEmail;
  if (!isEmail(to))
    throw new PracticeError(
      "no_email",
      "No email address for this contact. Add one to the client or use WhatsApp.",
    );
  const prefs = await firmChasePrefs(db, ctx.firmId);
  const email = renderEmail(count, t, prefs.tone);
  const delivered = await deliver(db, { id: ctx.firmId, name: ctx.firmName, email: ctx.firmEmail }, prefs, email, to!, [row.id]);
  const result = delivered.result;
  if (result.error) {
    await chaserEvent(db, {
      chaser_id: row.id,
      ca_firm_id: ctx.firmId,
      business_id: row.business_id,
      event_type: "skipped",
      channel: "email",
      template_id: email.template_id,
      note: `Email could not be sent: ${result.error}`,
      actor_id: ctx.userId,
    });
    throw new PracticeError(
      "email_failed",
      `Email could not be sent: ${result.error}`,
    );
  }
  await db
    .from("ca_document_requests")
    .update({
      chaser_count: count,
      last_chased_at: now.toISOString(),
      next_follow_up_at: nextSlot(row, count, now),
    })
    .eq("id", row.id);
  await chaserEvent(db, {
    chaser_id: row.id,
    ca_firm_id: ctx.firmId,
    business_id: row.business_id,
    event_type: "sent",
    channel: "email",
    template_id: email.template_id,
    note: result.simulated
      ? `Email follow up recorded (email service not configured, nothing was sent) to ${to}`
      : `Email follow up sent to ${to}${delivered.sentVia === "gmail" ? " from the firm's Gmail" : ""}${delivered.note ? `. ${delivered.note}` : ""}`,
    actor_id: ctx.userId,
    metadata: sentMetadata(delivered),
  });
  return {
    channel,
    via: "email" as const,
    simulated: result.simulated,
    to,
    subject: delivered.subject,
    follow_ups: count,
  };
}

export async function setChaseStatus(
  db: Db,
  ctx: FirmContext,
  id: string,
  status: "Resolved" | "Open" | "Escalated",
  note?: string,
) {
  const row = await loadChase(db, ctx, id);
  const now = new Date().toISOString();
  if (status === "Escalated") {
    // A person escalates before the schedule would: follow-ups stop, the partner owns it.
    await db
      .from("ca_document_requests")
      .update({ escalated_at: now, next_follow_up_at: null })
      .eq("id", row.id);
    await chaserEvent(db, {
      chaser_id: row.id,
      ca_firm_id: ctx.firmId,
      business_id: row.business_id,
      event_type: "escalated",
      note: note ?? "Escalated to the partner by the team.",
      actor_id: ctx.userId,
    });
  } else if (status === "Resolved") {
    await db
      .from("ca_document_requests")
      .update({
        status: "fulfilled",
        fulfilled_at: now,
        resolved_reason: "manual",
        next_follow_up_at: null,
      })
      .eq("id", row.id);
    await chaserEvent(db, {
      chaser_id: row.id,
      ca_firm_id: ctx.firmId,
      business_id: row.business_id,
      event_type: "resolved",
      note: note ?? "Marked resolved",
      actor_id: ctx.userId,
    });
  } else {
    await db
      .from("ca_document_requests")
      .update({
        status: "open",
        fulfilled_at: null,
        escalated_at: null,
        resolved_reason: null,
        next_follow_up_at: new Date(Date.now() + DAY).toISOString(),
        managed_by: "practice",
      })
      .eq("id", row.id);
    await chaserEvent(db, {
      chaser_id: row.id,
      ca_firm_id: ctx.firmId,
      business_id: row.business_id,
      event_type: "reopened",
      note: note ?? "Reopened",
      actor_id: ctx.userId,
    });
  }
  await logActivity(
    db,
    ctx.firmId,
    row.business_id,
    "chaser",
    `Chase "${row.title}" ${status === "Resolved" ? "resolved" : status === "Escalated" ? "escalated to the partner" : "reopened"}.`,
  );
  return { status };
}

/**
 * Cron: send the follow-ups that are due and escalate the ones that have had
 * their two nudges. Safe to run more than once a day.
 */
export async function runDueFollowups(now = new Date(), firmId?: string) {
  const db = await adminDb();
  let q = db
    .from("ca_document_requests")
    .select(COLS)
    .eq("status", "open")
    .eq("managed_by", "practice")
    .is("escalated_at", null)
    .lte("next_follow_up_at", now.toISOString())
    .order("next_follow_up_at")
    .limit(200);
  if (firmId) q = q.eq("ca_firm_id", firmId);
  const { data, error } = await q;
  if (error) throw new PracticeError("db_error", error.message);

  const firmNames = new Map<string, { name: string; email: string | null }>();
  const summary = {
    checked: 0,
    sent: 0,
    simulated: 0,
    escalated: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    whatsapp: 0,
  };
  const whatsappPlan = new Map<string, boolean>();
  const sendQueue: {
    row: ChaseRow;
    t: Awaited<ReturnType<typeof templateInput>>;
    state: ChaseState;
    decision: ReturnType<typeof decide>;
    firm: { name: string; email: string | null };
  }[] = [];
  const { firmCanWork } = await import("./billing.server");
  const working = new Map<string, boolean>();
  for (const row of (data ?? []) as ChaseRow[]) {
    summary.checked++;
    // Follow-ups stop while a firm's trial or plan has ended.
    if (!working.has(row.ca_firm_id)) working.set(row.ca_firm_id, await firmCanWork(db, row.ca_firm_id));
    if (!working.get(row.ca_firm_id)) {
      summary.skipped++;
      continue;
    }
    if (!firmNames.has(row.ca_firm_id)) {
      const { data: f } = await db
        .from("ca_firms")
        .select("firm_name, email")
        .eq("id", row.ca_firm_id)
        .maybeSingle();
      firmNames.set(row.ca_firm_id, {
        name: f?.firm_name ?? "Your CA firm",
        email: f?.email ?? null,
      });
    }
    const firm = firmNames.get(row.ca_firm_id)!;
    const t = await templateInput(db, row, firm.name);
    const state: ChaseState = {
      ...row,
      do_not_disturb: t.dnd,
      contact_email: row.contact_email || t.clientEmail,
    };
    const decision = decide(state, now);

    if (decision.action === "skip") {
      summary.skipped++;
      if (
        decision.reason === "client marked do not disturb" ||
        decision.reason === "no contact email"
      ) {
        // Park it for a day so the cron does not spin on it; tell the team once.
        const { data: parked } = await db
          .from("ca_document_requests")
          .update({
            next_follow_up_at: new Date(now.getTime() + DAY).toISOString(),
          })
          .eq("id", row.id)
          .eq("next_follow_up_at", row.next_follow_up_at)
          .select("id")
          .maybeSingle();
        if (parked && row.chaser_count === 0)
          await chaserEvent(db, {
            chaser_id: row.id,
            ca_firm_id: row.ca_firm_id,
            business_id: row.business_id,
            event_type: "skipped",
            note: `Automatic email skipped: ${decision.reason}.`,
          });
      }
      continue;
    }

    if (decision.action === "escalate") {
      const { data: done } = await db
        .from("ca_document_requests")
        .update({ escalated_at: now.toISOString() })
        .eq("id", row.id)
        .is("escalated_at", null)
        .eq("status", "open")
        .select("id")
        .maybeSingle();
      if (!done) continue;
      summary.escalated++;
      const text = `No reply after ${row.chaser_count} follow ups. Escalated to the team.`;
      await chaserEvent(db, {
        chaser_id: row.id,
        ca_firm_id: row.ca_firm_id,
        business_id: row.business_id,
        event_type: "auto_escalated",
        note: text,
      });
      await db.from("ca_notifications").insert({
        ca_firm_id: row.ca_firm_id,
        business_id: row.business_id,
        type: "chaser_escalated",
        severity: "critical",
        title: "Chase escalated",
        message: `${t.clientName}: "${row.title}" has had ${row.chaser_count} unanswered follow ups. Please call the client.`,
        is_read: false,
        metadata: { chaser_id: row.id },
      });
      await logActivity(
        db,
        row.ca_firm_id,
        row.business_id,
        "chaser",
        `Chase "${row.title}" escalated after ${row.chaser_count} unanswered follow ups.`,
      );
      continue;
    }

    sendQueue.push({ row, t, state, decision, firm });
  }

  // One email per client for everything due, sent only inside the send window.
  const groups = new Map<string, typeof sendQueue>();
  for (const q of sendQueue) {
    const key = `${q.row.ca_firm_id}|${q.row.business_id}|${q.state.contact_email!.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const prefsByFirm = new Map<string, ChasePrefs>();
  for (const group of groups.values()) {
    if (!inSendWindow(now)) {
      // Leave the slots as they are: the next run inside the window sends them.
      summary.deferred += group.length;
      continue;
    }
    const first = group[0];
    if (!prefsByFirm.has(first.row.ca_firm_id)) prefsByFirm.set(first.row.ca_firm_id, await firmChasePrefs(db, first.row.ca_firm_id));
    const prefs = prefsByFirm.get(first.row.ca_firm_id)!;

    // Claim every slot first: a second cron run in parallel cannot send again.
    const claimedItems: typeof group = [];
    for (const q of group) {
      if (q.decision.action !== "send") continue;
      const { data: claimed } = await db
        .from("ca_document_requests")
        .update({
          chaser_count: q.decision.follow_up_number,
          last_chased_at: now.toISOString(),
          next_follow_up_at: q.decision.next_follow_up_at,
        })
        .eq("id", q.row.id)
        .eq("chaser_count", q.row.chaser_count)
        .eq("status", "open")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      // Last check right before sending: never chase for a document that has arrived.
      const { data: fresh } = await db.from("ca_document_requests").select("status").eq("id", q.row.id).maybeSingle();
      if (fresh && isClosed(fresh.status)) continue;
      claimedItems.push(q);
    }
    if (!claimedItems.length) continue;

    const to = first.state.contact_email!;
    const step = Math.max(...claimedItems.map((q) => (q.decision.action === "send" ? q.decision.follow_up_number : 1)));
    const email = renderGroupedEmail(
      step,
      first.t,
      claimedItems.map((q) => ({ item: q.t.item, period: q.t.period, dueDate: q.t.dueDate })),
      prefs.tone,
    );
    const delivered = await deliver(
      db,
      { id: first.row.ca_firm_id, name: first.firm.name, email: first.firm.email },
      prefs,
      email,
      to,
      claimedItems.map((q) => q.row.id),
    );
    if (delivered.result.error) {
      summary.failed += claimedItems.length;
      // Give the slots back and retry tomorrow.
      for (const q of claimedItems) {
        await db
          .from("ca_document_requests")
          .update({
            chaser_count: q.row.chaser_count,
            last_chased_at: q.row.last_chased_at,
            next_follow_up_at: new Date(now.getTime() + DAY).toISOString(),
          })
          .eq("id", q.row.id);
        await chaserEvent(db, {
          chaser_id: q.row.id,
          ca_firm_id: q.row.ca_firm_id,
          business_id: q.row.business_id,
          event_type: "skipped",
          channel: "email",
          template_id: email.template_id,
          note: `Automatic email failed: ${delivered.result.error}. Will retry tomorrow.`,
        });
      }
      continue;
    }
    if (delivered.result.simulated) summary.simulated += claimedItems.length;
    else summary.sent += claimedItems.length;
    for (const q of claimedItems) {
      const n = q.decision.action === "send" ? q.decision.follow_up_number : step;
      await chaserEvent(db, {
        chaser_id: q.row.id,
        ca_firm_id: q.row.ca_firm_id,
        business_id: q.row.business_id,
        event_type: "sent",
        channel: "email",
        template_id: email.template_id,
        note: delivered.result.simulated
          ? `Follow up ${n} recorded (email service not configured, nothing was sent)`
          : `Automatic follow up ${n} emailed to ${to}${delivered.sentVia === "gmail" ? " from the firm's Gmail" : ""}${claimedItems.length > 1 ? ` together with ${claimedItems.length - 1} other item(s)` : ""}${delivered.note ? `. ${delivered.note}` : ""}`,
        metadata: sentMetadata(delivered),
      });
    }

    // From the second reminder on, also nudge on WhatsApp when the firm asked for it.
    if (prefs.whatsappAuto && step >= 2 && !first.t.dnd) {
      if (!whatsappPlan.has(first.row.ca_firm_id)) {
        const { loadBilling } = await import("./billing.server");
        const { accessFor } = await import("./billing/plans");
        whatsappPlan.set(first.row.ca_firm_id, accessFor(await loadBilling(db, first.row.ca_firm_id)).whatsappChaser);
      }
      const phone = first.row.contact_phone || first.t.clientPhone;
      if (whatsappPlan.get(first.row.ca_firm_id) && phone) {
        const wa = await sendChaseWhatsapp(
          db,
          first.row.ca_firm_id,
          phone,
          chaseTemplateParams({
            contactName: first.t.contactName,
            clientName: first.t.clientName,
            items: claimedItems.map((q) => `${q.t.item}${q.t.period ? ` (${q.t.period})` : ""}`),
            firmName: first.firm.name,
          }),
        );
        for (const q of claimedItems) {
          await chaserEvent(db, {
            chaser_id: q.row.id,
            ca_firm_id: q.row.ca_firm_id,
            business_id: q.row.business_id,
            event_type: wa.ok ? "sent" : "skipped",
            channel: "whatsapp",
            template_id: "chase_whatsapp_template",
            note: wa.ok ? `Automatic WhatsApp reminder sent to +${wa.to}` : `Automatic WhatsApp reminder not sent: ${wa.error}`,
            metadata: wa.ok ? { wamid: wa.wamid, delivery: "sent" } : {},
          });
        }
        if (wa.ok) summary.whatsapp++;
      }
    }
  }
  return summary;
}
