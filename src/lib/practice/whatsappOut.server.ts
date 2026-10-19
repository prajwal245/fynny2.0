/**
 * WhatsApp follow-ups sent from FynHelp's own number (the platform number).
 * A firm turns it on once; the chaser then makes a message per round, held as
 * a draft for a partner to approve or sent straight away. Templates only
 * (Meta's rule for messages we start); replies and STOP are handled in
 * whatsapp.server.ts. Nothing is ever sent without the firm's consent flag,
 * an included allowance, and a number that has not opted out.
 */
import { PracticeError } from "./core";
import { logActivity, type Db, type FirmContext } from "./db.server";
import { normalisePhone } from "./chaser/rules";
import {
  WA_MONTHLY_ALLOWANCE,
  WA_TEMPLATES,
  blockText,
  last10,
  nextStatus,
  paramsFor,
  pickFirm,
  renderBody,
  templateFor,
  templatePayload,
  whyBlocked,
  type Blocked,
  type WaChaseInput,
} from "./whatsapp/templates";

// WHATSAPP_GRAPH_BASE exists only so tests and demos can use a stand-in Meta Graph API.
const graph = () => process.env["WHATSAPP_GRAPH_BASE"] || "https://graph.facebook.com/v21.0";
const env = (n: string) => (process.env[n] ?? "").trim() || undefined;

export const platformNumberId = () => env("WHATSAPP_PLATFORM_PHONE_NUMBER_ID");
export const platformReady = () => Boolean(platformNumberId() && env("WHATSAPP_ACCESS_TOKEN"));
export const isPlatformNumber = (phoneNumberId: string | undefined) => !!phoneNumberId && phoneNumberId === platformNumberId();

export interface WaSettings {
  enabled: boolean;
  mode: "approve" | "auto";
  daily_limit: number;
  consent_confirmed_at: string | null;
}
const DEFAULTS: WaSettings = { enabled: false, mode: "approve", daily_limit: 100, consent_confirmed_at: null };

export async function getSettings(db: Db, firmId: string): Promise<WaSettings> {
  const { data } = await db.from("ca_wa_settings").select("enabled, mode, daily_limit, consent_confirmed_at").eq("ca_firm_id", firmId).maybeSingle();
  return data ? (data as WaSettings) : { ...DEFAULTS };
}

const startOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
const startOfMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
const COUNTED = ["sending", "sent", "delivered", "read"];

async function allowanceFor(db: Db, firmId: string): Promise<number> {
  const { loadBilling } = await import("./billing.server");
  const { accessFor } = await import("./billing/plans");
  const access = accessFor(await loadBilling(db, firmId));
  return access.whatsappChaser ? WA_MONTHLY_ALLOWANCE[access.features] : 0;
}

export async function usage(db: Db, firmId: string, now = new Date()) {
  const { data } = await db.from("ca_wa_messages").select("status, created_at").eq("ca_firm_id", firmId).gte("created_at", startOfMonth(now));
  const rows = (data ?? []) as { status: string; created_at: string }[];
  const counted = rows.filter((r) => COUNTED.includes(r.status));
  return {
    today: counted.filter((r) => r.created_at >= startOfDay(now)).length,
    month: counted.length,
    allowance: await allowanceFor(db, firmId),
    drafts: rows.filter((r) => r.status === "draft").length,
  };
}

/** What the Settings and Chaser screens show. */
export async function status(db: Db, ctx: FirmContext) {
  const [settings, u, drafts, optouts] = await Promise.all([
    getSettings(db, ctx.firmId),
    usage(db, ctx.firmId),
    db.from("ca_wa_messages").select("id, business_id, chase_id, to_phone, template, body, follow_up_number, created_at").eq("ca_firm_id", ctx.firmId).eq("status", "draft").order("created_at").limit(100),
    db.from("ca_wa_optouts").select("phone_last10").limit(1),
  ]);
  const { data: failed } = await db.from("ca_wa_messages").select("id, to_phone, error, created_at").eq("ca_firm_id", ctx.firmId).eq("status", "failed").gte("created_at", startOfMonth(new Date())).order("created_at", { ascending: false }).limit(5);
  return {
    available: platformReady(),
    settings,
    usage: u,
    drafts: drafts.data ?? [],
    recentFailures: failed ?? [],
    anyOptOuts: (optouts.data ?? []).length > 0,
  };
}

export async function saveSettings(
  db: Db,
  ctx: FirmContext,
  input: { enabled?: boolean; mode?: "approve" | "auto"; daily_limit?: number; confirmConsent?: boolean },
) {
  const cur = await getSettings(db, ctx.firmId);
  const consentAt = cur.consent_confirmed_at ?? (input.confirmConsent ? new Date().toISOString() : null);
  const next = { ...cur, ...(input.mode ? { mode: input.mode } : {}), ...(input.daily_limit ? { daily_limit: input.daily_limit } : {}), enabled: input.enabled ?? cur.enabled };
  if (next.enabled && !cur.enabled) {
    if (!platformReady()) throw new PracticeError("not_configured", "FynHelp's WhatsApp number isn't switched on yet. Write to support@fynhelp.com and we will set it up.");
    if (!(await allowanceFor(db, ctx.firmId))) throw new PracticeError("plan_feature", "WhatsApp follow-ups are on the Firm and Scale plans.");
    if (!consentAt) throw new PracticeError("consent_required", "Please confirm that your clients have agreed to receive messages from you on WhatsApp.");
  }
  const { error } = await db.from("ca_wa_settings").upsert(
    {
      ca_firm_id: ctx.firmId,
      enabled: next.enabled,
      mode: next.mode,
      daily_limit: next.daily_limit,
      consent_confirmed_at: consentAt,
      ...(input.confirmConsent && !cur.consent_confirmed_at ? { consent_confirmed_by: ctx.userId } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ca_firm_id" },
  );
  if (error) throw new PracticeError("db_error", error.message);
  if (next.enabled !== cur.enabled) await logActivity(db, ctx.firmId, null, "chaser", next.enabled ? `WhatsApp follow-ups switched on (${next.mode === "auto" ? "sent automatically" : "partner approves each round"}).` : "WhatsApp follow-ups switched off.");
  return status(db, ctx);
}

/* ── opt-outs ──────────────────────────────────────────── */

export async function isOptedOut(db: Db, phone: string | null | undefined): Promise<boolean> {
  const k = last10(phone);
  if (k.length < 10) return false;
  const { data } = await db.from("ca_wa_optouts").select("phone_last10").eq("phone_last10", k).maybeSingle();
  return !!data;
}

/** One STOP ends it for every firm, and any message still waiting for that number is cancelled. */
export async function recordOptOut(db: Db, phone: string, source = "reply") {
  const k = last10(phone);
  if (k.length < 10) return;
  await db.from("ca_wa_optouts").upsert({ phone_last10: k, source }, { onConflict: "phone_last10", ignoreDuplicates: true });
  await db.from("ca_wa_messages").update({ status: "cancelled", error: "Recipient opted out", updated_at: new Date().toISOString() }).eq("to_last10", k).eq("status", "draft");
}

/* ── making and sending messages ───────────────────────── */

export interface FollowUpInput {
  firmId: string;
  businessId: string;
  chaseId: string;
  followUpNumber: number;
  maxFollowUps: number;
  phone: string | null | undefined;
  doNotDisturb: boolean;
  chase: WaChaseInput;
}

/**
 * Makes the draft for one round, unless the message must not go. The caller
 * then sends it (auto mode) or leaves it for a partner (approve mode).
 */
export async function createFollowUp(db: Db, i: FollowUpInput, now = new Date()): Promise<{ id: string; body: string } | { blocked: Blocked; reason: string }> {
  const to = normalisePhone(i.phone);
  const k = last10(i.phone);
  const [settings, u, optedOut, today] = await Promise.all([
    getSettings(db, i.firmId),
    usage(db, i.firmId, now),
    isOptedOut(db, i.phone),
    db.from("ca_wa_messages").select("id, status").eq("chase_id", i.chaseId).gte("created_at", startOfDay(now)),
  ]);
  const alreadyToday = ((today.data ?? []) as { status: string }[]).some((r) => r.status !== "cancelled" && r.status !== "failed");
  const blocked = whyBlocked({
    phone: i.phone,
    optedOut,
    doNotDisturb: i.doNotDisturb,
    sentToday: u.today,
    dailyLimit: settings.daily_limit,
    sentThisMonth: u.month,
    monthlyAllowance: u.allowance,
    alreadyToday,
  });
  if (blocked || !to) return { blocked: blocked ?? "no_number", reason: blockText(blocked ?? "no_number") };
  const t = templateFor(i.followUpNumber, i.maxFollowUps);
  const params = paramsFor(i.chase);
  const body = renderBody(t, params);
  const { data, error } = await db
    .from("ca_wa_messages")
    .insert({ ca_firm_id: i.firmId, business_id: i.businessId, chase_id: i.chaseId, follow_up_number: i.followUpNumber, to_phone: to, to_last10: k, template: t.name, params, body, status: "draft" })
    .select("id")
    .single();
  if (error || !data) throw new PracticeError("db_error", error?.message ?? "Could not prepare the WhatsApp message.");
  return { id: data.id as string, body };
}

/** Sends one draft now. Safe to call twice: only one caller claims it. */
export async function sendDraft(db: Db, id: string, approvedBy: string | null = null): Promise<{ ok: true; wamid: string } | { ok: false; error: string; cancelled?: boolean }> {
  const { data: row } = await db.from("ca_wa_messages").select("id, ca_firm_id, to_phone, template, params, status").eq("id", id).maybeSingle();
  if (!row || row.status !== "draft") return { ok: false, error: "That message is no longer waiting to be sent." };
  // Opted out since the draft was made: never send.
  if (await isOptedOut(db, row.to_phone)) {
    await db.from("ca_wa_messages").update({ status: "cancelled", error: "Recipient opted out", updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, error: blockText("opted_out"), cancelled: true };
  }
  if (!platformReady()) return { ok: false, error: "FynHelp's WhatsApp number isn't switched on yet." };
  const { data: claimed } = await db.from("ca_wa_messages").update({ status: "sending", approved_by: approvedBy, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("id");
  if (!claimed?.length) return { ok: false, error: "That message is already being sent." };

  const t = Object.values(WA_TEMPLATES).find((x) => x.name === row.template);
  if (!t) {
    await db.from("ca_wa_messages").update({ status: "failed", error: "Unknown template", updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, error: "Unknown template." };
  }
  const fail = async (error: string) => {
    await db.from("ca_wa_messages").update({ status: "failed", error: error.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false as const, error };
  };
  try {
    const res = await fetch(`${graph()}/${platformNumberId()}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}` },
      body: JSON.stringify(templatePayload(row.to_phone, t, row.params as string[])),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    const wamid = j.messages?.[0]?.id;
    if (!res.ok || !wamid) return fail(friendlyError(j.error?.code, j.error?.message, res.status));
    await db.from("ca_wa_messages").update({ status: "sent", wamid, sent_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: true, wamid };
  } catch (e) {
    return fail((e as Error).message || "WhatsApp could not be reached.");
  }
}

/** Meta's codes, in words a partner can act on. */
export function friendlyError(code: number | undefined, message: string | undefined, http: number): string {
  if (code === 131026) return "That number is not on WhatsApp, or cannot receive messages.";
  if (code === 131049) return "WhatsApp held this message to protect recipients from too many messages. It will not be retried.";
  if (code === 132000 || code === 132001 || code === 132012) return "The message template is not approved yet in Meta. Ask FynHelp support.";
  if (code === 130429 || code === 131056) return "WhatsApp is rate limiting this number. Try again later.";
  if (code === 190 || http === 401) return "FynHelp's WhatsApp connection needs attention. FynHelp support has been alerted.";
  return `WhatsApp refused the message${message ? `: ${message}` : ""}`;
}

export async function discardDrafts(db: Db, ctx: FirmContext, ids: string[]) {
  if (!ids.length) return { cancelled: 0 };
  const { data } = await db.from("ca_wa_messages").update({ status: "cancelled", error: "Discarded by the firm", updated_at: new Date().toISOString() }).eq("ca_firm_id", ctx.firmId).eq("status", "draft").in("id", ids).select("id");
  return { cancelled: data?.length ?? 0 };
}

/* ── delivery status and replies ───────────────────────── */

/** Meta's delivered / read / failed receipts. Only ever moves a message forward. */
export async function applyStatus(db: Db, wamid: string, incoming: string, errorText?: string) {
  const { data: row } = await db.from("ca_wa_messages").select("id, status").eq("wamid", wamid).maybeSingle();
  if (!row) return false;
  const next = nextStatus(row.status, incoming);
  if (next === row.status) return true;
  await db.from("ca_wa_messages").update({ status: next, ...(next === "failed" ? { error: (errorText ?? "Delivery failed").slice(0, 300) } : {}), updated_at: new Date().toISOString() }).eq("id", row.id);
  return true;
}

/** Which firm a reply to the shared number belongs to. */
export async function routeFirm(db: Db, from: string, now = Date.now()): Promise<string | null> {
  const k = last10(from);
  if (k.length < 10) return null;
  const { data: out } = await db.from("ca_wa_messages").select("ca_firm_id, created_at, status").eq("to_last10", k).order("created_at", { ascending: false }).limit(20);
  const recent = ((out ?? []) as { ca_firm_id: string; created_at: string; status: string }[])
    .filter((m) => ["sent", "delivered", "read"].includes(m.status))
    .map((m) => ({ firmId: m.ca_firm_id, at: m.created_at }));
  if (recent.length) return pickFirm(recent, [], now);
  // Never messaged: only a firm that has this number as a client can claim it.
  // (A bounded scan; give it an index on the digits if clients run into the tens of thousands.)
  const { data: clients } = await db.from("ca_clients").select("ca_firm_id, client_phone").not("client_phone", "is", null).limit(20000);
  const firms = ((clients ?? []) as { ca_firm_id: string; client_phone: string | null }[]).filter((c) => last10(c.client_phone) === k).map((c) => c.ca_firm_id);
  return pickFirm([], firms, now);
}

/** A plain reply inside the 24 hour window the sender just opened. Best effort. */
export async function sendText(to: string, body: string): Promise<void> {
  const id = platformNumberId();
  const token = env("WHATSAPP_ACCESS_TOKEN");
  if (!id || !token) return;
  try {
    await fetch(`${graph()}/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error(`[fyn:whatsapp] reply failed: ${(e as Error).message}`);
  }
}
