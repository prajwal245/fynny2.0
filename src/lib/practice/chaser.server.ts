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
  isClosed,
  renderEmail,
  normalisePhone,
  slotAt,
  whatText,
  whatsappLink,
  whatsappMessage,
  DEFAULT_SCHEDULE,
  type ChaseState,
  type TemplateInput,
} from "./chaser/rules";
import { isEmail, sendEmail } from "./email.server";
import type { WaChaseInput } from "./whatsapp/templates";

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
      max_follow_ups: 2,
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

const waInput = (t: TemplateInput & { clientName: string }): WaChaseInput => ({
  contactName: t.contactName,
  firmName: t.firmName,
  item: whatText(t),
  clientName: t.clientName,
});

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
    // Switched on: the message goes from FynHelp's number, as the approved template. Pressing Send is the approval.
    const wa = await import("./whatsappOut.server");
    const waSettings = await wa.getSettings(db, ctx.firmId);
    if (waSettings.enabled && wa.platformReady()) {
      const made = await wa.createFollowUp(db, {
        firmId: ctx.firmId,
        businessId: row.business_id,
        chaseId: row.id,
        followUpNumber: count,
        maxFollowUps: row.max_follow_ups,
        phone: row.contact_phone || t.clientPhone,
        doNotDisturb: t.dnd,
        chase: waInput(t),
      });
      if ("blocked" in made) throw new PracticeError("wa_blocked", made.reason);
      const sent = await wa.sendDraft(db, made.id, ctx.userId);
      if (!sent.ok) throw new PracticeError("wa_failed", sent.error);
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
        template_id: "fynhelp_whatsapp",
        note: `WhatsApp follow up ${count} sent from FynHelp's number`,
        actor_id: ctx.userId,
        metadata: { message: made.body, wamid: sent.wamid },
      });
      return { channel, via: "fynhelp" as const, message: made.body, follow_ups: count };
    }
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
    return { channel, url: link.url, message, follow_ups: count };
  }

  const to = row.contact_email || t.clientEmail;
  if (!isEmail(to))
    throw new PracticeError(
      "no_email",
      "No email address for this contact. Add one to the client or use WhatsApp.",
    );
  const email = renderEmail(count, t);
  const result = await sendEmail({
    to: to!,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: ctx.firmEmail,
    fromName: ctx.firmName,
  });
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
      : `Email follow up sent to ${to}`,
    actor_id: ctx.userId,
    metadata: {
      subject: email.subject,
      simulated: result.simulated,
      provider_id: result.provider_id,
    },
  });
  return {
    channel,
    simulated: result.simulated,
    to,
    subject: email.subject,
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
    drafted: 0,
  };
  const { firmCanWork } = await import("./billing.server");
  const wa = await import("./whatsappOut.server");
  // Per firm: is WhatsApp on (switched on, consent given, FynHelp's number configured), and who approves?
  const waCfg = new Map<string, { on: boolean; mode: "approve" | "auto" }>();
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
    if (!waCfg.has(row.ca_firm_id)) {
      const s = await wa.getSettings(db, row.ca_firm_id);
      waCfg.set(row.ca_firm_id, { on: s.enabled && !!s.consent_confirmed_at && wa.platformReady(), mode: s.mode });
    }
    const cfg = waCfg.get(row.ca_firm_id)!;
    const phone = row.contact_phone || t.clientPhone;
    // A firm that switched WhatsApp on follows up there when the contact has a usable number that has not opted out.
    const viaWhatsApp = cfg.on && !!normalisePhone(phone) && !(await wa.isOptedOut(db, phone));
    const state: ChaseState = {
      ...row,
      do_not_disturb: t.dnd,
      contact_email: row.contact_email || t.clientEmail,
      reachable_by_phone: viaWhatsApp,
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

    if (viaWhatsApp && decision.action === "send") {
      const park = () =>
        db.from("ca_document_requests").update({ next_follow_up_at: new Date(now.getTime() + DAY).toISOString() }).eq("id", row.id).eq("next_follow_up_at", row.next_follow_up_at);
      const base = {
        firmId: row.ca_firm_id,
        businessId: row.business_id,
        chaseId: row.id,
        followUpNumber: decision.follow_up_number,
        maxFollowUps: row.max_follow_ups,
        phone,
        doNotDisturb: t.dnd,
        chase: waInput(t),
      };
      if (cfg.mode === "approve") {
        // A partner approves each round, so the round is not used up until it goes. One draft per round.
        await park();
        const { data: waiting } = await db.from("ca_wa_messages").select("id").eq("chase_id", row.id).eq("follow_up_number", decision.follow_up_number).eq("status", "draft").limit(1);
        if (waiting?.length) { summary.skipped++; continue; }
        const made = await wa.createFollowUp(db, base, now);
        if ("blocked" in made) {
          summary.skipped++;
          await chaserEvent(db, { chaser_id: row.id, ca_firm_id: row.ca_firm_id, business_id: row.business_id, event_type: "skipped", channel: "whatsapp", note: `WhatsApp not prepared: ${made.reason}` });
          continue;
        }
        summary.drafted++;
        await chaserEvent(db, { chaser_id: row.id, ca_firm_id: row.ca_firm_id, business_id: row.business_id, event_type: "whatsapp_draft", channel: "whatsapp", template_id: "fynhelp_whatsapp", note: `WhatsApp follow up ${decision.follow_up_number} is ready for a partner to approve`, metadata: { message: made.body } });
        continue;
      }
      // Automatic: claim the slot first, as for email, so a parallel run cannot send twice.
      const { data: won } = await db
        .from("ca_document_requests")
        .update({ chaser_count: decision.follow_up_number, last_chased_at: now.toISOString(), next_follow_up_at: decision.next_follow_up_at })
        .eq("id", row.id)
        .eq("chaser_count", row.chaser_count)
        .eq("status", "open")
        .select("id")
        .maybeSingle();
      if (!won) continue;
      const giveBack = () =>
        db.from("ca_document_requests").update({ chaser_count: row.chaser_count, last_chased_at: row.last_chased_at, next_follow_up_at: new Date(now.getTime() + DAY).toISOString() }).eq("id", row.id);
      const made = await wa.createFollowUp(db, base, now);
      if ("blocked" in made) {
        summary.skipped++;
        await giveBack();
        await chaserEvent(db, { chaser_id: row.id, ca_firm_id: row.ca_firm_id, business_id: row.business_id, event_type: "skipped", channel: "whatsapp", note: `Automatic WhatsApp skipped: ${made.reason}` });
        continue;
      }
      const sent = await wa.sendDraft(db, made.id, null);
      if (!sent.ok) {
        summary.failed++;
        await giveBack();
        await chaserEvent(db, { chaser_id: row.id, ca_firm_id: row.ca_firm_id, business_id: row.business_id, event_type: "skipped", channel: "whatsapp", note: `Automatic WhatsApp failed: ${sent.error}. Will retry tomorrow.` });
        continue;
      }
      summary.sent++;
      await chaserEvent(db, { chaser_id: row.id, ca_firm_id: row.ca_firm_id, business_id: row.business_id, event_type: "sent", channel: "whatsapp", template_id: "fynhelp_whatsapp", note: `Automatic follow up ${decision.follow_up_number} sent on WhatsApp from FynHelp's number`, metadata: { message: made.body, wamid: sent.wamid } });
      continue;
    }

    // Claim the slot first: a second cron run in parallel cannot send again.
    const { data: claimed } = await db
      .from("ca_document_requests")
      .update({
        chaser_count: decision.follow_up_number,
        last_chased_at: now.toISOString(),
        next_follow_up_at: decision.next_follow_up_at,
      })
      .eq("id", row.id)
      .eq("chaser_count", row.chaser_count)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    // Last check right before sending: never chase for a document that has arrived.
    const { data: fresh } = await db
      .from("ca_document_requests")
      .select("status")
      .eq("id", row.id)
      .maybeSingle();
    if (fresh && isClosed(fresh.status)) continue;

    const to = state.contact_email!;
    const email = renderEmail(decision.follow_up_number, t);
    const result = await sendEmail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: firm.email,
      fromName: firm.name,
    });
    if (result.error) {
      summary.failed++;
      // Give the slot back and retry tomorrow.
      await db
        .from("ca_document_requests")
        .update({
          chaser_count: row.chaser_count,
          last_chased_at: row.last_chased_at,
          next_follow_up_at: new Date(now.getTime() + DAY).toISOString(),
        })
        .eq("id", row.id);
      await chaserEvent(db, {
        chaser_id: row.id,
        ca_firm_id: row.ca_firm_id,
        business_id: row.business_id,
        event_type: "skipped",
        channel: "email",
        template_id: email.template_id,
        note: `Automatic email failed: ${result.error}. Will retry tomorrow.`,
      });
      continue;
    }
    if (result.simulated) summary.simulated++;
    else summary.sent++;
    await chaserEvent(db, {
      chaser_id: row.id,
      ca_firm_id: row.ca_firm_id,
      business_id: row.business_id,
      event_type: "sent",
      channel: "email",
      template_id: email.template_id,
      note: result.simulated
        ? `Follow up ${decision.follow_up_number} recorded (email service not configured, nothing was sent)`
        : `Automatic follow up ${decision.follow_up_number} emailed to ${to}`,
      metadata: {
        subject: email.subject,
        simulated: result.simulated,
        provider_id: result.provider_id,
      },
    });
  }
  return summary;
}

/**
 * A partner approves WhatsApp drafts. Each goes out from FynHelp's number and
 * counts as that round of the chase; a draft for a chase that has since been
 * resolved is cancelled instead of sent.
 */
export async function approveWhatsApp(db: Db, ctx: FirmContext, ids: string[]) {
  const wa = await import("./whatsappOut.server");
  const summary = { sent: 0, failed: 0, cancelled: 0, errors: [] as string[] };
  for (const id of ids) {
    const { data: msg } = await db
      .from("ca_wa_messages")
      .select("id, chase_id, business_id, follow_up_number, status, body")
      .eq("id", id)
      .eq("ca_firm_id", ctx.firmId)
      .maybeSingle();
    if (!msg || msg.status !== "draft") continue;
    const { data: chase } = msg.chase_id ? await db.from("ca_document_requests").select(COLS).eq("id", msg.chase_id).eq("ca_firm_id", ctx.firmId).maybeSingle() : { data: null };
    if (!chase || isClosed((chase as ChaseRow).status)) {
      await db.from("ca_wa_messages").update({ status: "cancelled", error: "The chase was resolved", updated_at: new Date().toISOString() }).eq("id", id);
      summary.cancelled++;
      continue;
    }
    const row = chase as ChaseRow;
    const sent = await wa.sendDraft(db, id, ctx.userId);
    if (!sent.ok) {
      if (sent.cancelled) summary.cancelled++;
      else summary.failed++;
      summary.errors.push(sent.error);
      continue;
    }
    const now = new Date();
    const count = Math.max(row.chaser_count, msg.follow_up_number);
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
      template_id: "fynhelp_whatsapp",
      note: `WhatsApp follow up ${msg.follow_up_number} approved and sent from FynHelp's number`,
      actor_id: ctx.userId,
      metadata: { message: msg.body, wamid: sent.wamid },
    });
    summary.sent++;
  }
  return summary;
}
