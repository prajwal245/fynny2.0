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
  slotAt,
  whatsappLink,
  whatsappMessage,
  DEFAULT_SCHEDULE,
  type ChaseState,
  type TemplateInput,
} from "./chaser/rules";
import { isEmail, sendEmail } from "./email.server";

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
  const contactEmail = contactIsEmail
    ? input.contact.trim()
    : client.client_email;
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
  };
  for (const row of (data ?? []) as ChaseRow[]) {
    summary.checked++;
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
