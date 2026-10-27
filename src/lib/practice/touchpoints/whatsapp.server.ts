/**
 * WhatsApp for follow-ups, server side: sends the one message that fits a stall (from FynHelp's shared number, at
 * FynHelp's cost), and handles what comes back (a tap on a button, or a written reply).
 * Never sends without the person's consent, to a number that said stop, outside 9 am to 8 pm IST, or twice in 3 days.
 */
import type { Db } from "../db.server";
import { sharedPhoneNumberId, post, sendPlainText } from "../whatsappSend.server";
import { listTemplates } from "../whatsappTemplates.server";
import { buildTemplateMessage, buttonPayloadOf, cleanMetaId, explainWaError, waParam } from "../whatsappFlow";
import {
  TOUCH_ACTION_RULES,
  mayMessage,
  parseTouchPayload,
  phoneKey,
  templateNameFor,
  touchButtonComponents,
  touchParams,
  touchTemplateUsable,
  WA_PLAN,
} from "./whatsapp";
import type { TouchKind } from "./rules";
import type { SubjectFacts } from "./rules";

const env = (n: string) => (process.env[n] ?? "").trim() || undefined;
const DAY = 86_400_000;
const subjectOf = (r: { ca_firm_id?: string | null; user_id?: string | null }) => String(r.ca_firm_id ?? r.user_id ?? "");
const lang = () => env("WHATSAPP_TEMPLATE_LANG") ?? "en";
const templateEnv = () => ({ setup: env("WHATSAPP_TOUCH_SETUP_TEMPLATE"), trial: env("WHATSAPP_TOUCH_TRIAL_TEMPLATE"), plan: env("WHATSAPP_TOUCH_PLAN_TEMPLATE") });

/** FynHelp's own number, used for these messages. Null when it is not set up. */
export function touchSender() {
  const phoneNumberId = sharedPhoneNumberId();
  const token = env("WHATSAPP_ACCESS_TOKEN");
  return phoneNumberId && token ? { phoneNumberId, token, wabaId: cleanMetaId(env("WHATSAPP_WABA_ID")) } : null;
}

interface Subject {
  id: string;
  facts: Pick<SubjectFacts, "name" | "firmName" | "phone" | "whatsappOk">;
}

/** Sends what is due. Returns how many went. */
export async function sendTouchWhatsapps(db: Db, subjects: Subject[], now: Date, hour: number): Promise<{ sent: number; skipped?: string }> {
  const sender = touchSender();
  if (!sender) return { sent: 0, skipped: "WhatsApp is not set up" };
  // Without the account id the category and buttons cannot be checked, and a Marketing template would cost far more.
  if (!sender.wabaId) return { sent: 0, skipped: "WHATSAPP_WABA_ID is not set" };
  const list = await listTemplates({ wabaId: sender.wabaId, token: sender.token });
  if (!list) return { sent: 0, skipped: "could not read templates from Meta" };

  const kinds = (Object.keys(WA_PLAN) as TouchKind[]).filter((k) => WA_PLAN[k]);
  const { data: rows } = await db
    .from("ca_touchpoints")
    .select("id, kind, ca_firm_id, user_id, phone, due_at, snoozed_until, detail")
    .eq("status", "open")
    .is("whatsapp_sent_at", null)
    .is("whatsapp_error", null)
    .in("kind", kinds)
    .not("phone", "is", null)
    .lte("due_at", now.toISOString())
    .limit(100);
  if (!rows?.length) return { sent: 0 };

  const [{ data: stops }, { data: recent }] = await Promise.all([
    db.from("ca_touch_optout").select("phone_key").limit(20000),
    db.from("ca_touchpoints").select("phone").gte("whatsapp_sent_at", new Date(now.getTime() - 3 * DAY).toISOString()).limit(5000),
  ]);
  const stopped = new Set((stops ?? []).map((r) => String(r.phone_key)));
  const recently = new Set((recent ?? []).map((r) => phoneKey(r.phone as string | null)).filter(Boolean) as string[]);
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  let sent = 0;

  for (const r of rows) {
    const plan = WA_PLAN[r.kind as TouchKind];
    if (!plan) continue;
    if (now.getTime() < new Date(String(r.due_at)).getTime() + plan.delayHours * 3_600_000) continue;
    if (r.snoozed_until && new Date(String(r.snoozed_until)) > now) continue;
    const s = bySubject.get(subjectOf(r));
    // Consent is read fresh from the person, so a tick-box ticked later counts and a switch-off counts at once.
    if (!s) continue;
    const key = phoneKey(r.phone as string);
    const ok = mayMessage({ consent: s.facts.whatsappOk, phone: r.phone as string, optedOut: !!key && stopped.has(key), sentToThisNumberRecently: !!key && recently.has(key), hour });
    if (!ok.ok) continue;
    const name = templateNameFor(plan.template, templateEnv());
    const t = list.find((x) => x.name === name && (x.language === lang() || x.language.startsWith(lang())));
    if (!touchTemplateUsable(t).ok) continue;
    const params = touchParams(r.kind as TouchKind, s.facts, (r.detail ?? {}) as Record<string, unknown>);
    if (!params) continue;
    const bar = t!.components?.find((c) => c.type === "BUTTONS");
    const buttons = touchButtonComponents(bar!.buttons!, String(r.id))!;

    // Claim first: a second run cannot send the same message.
    const claimed = await db.from("ca_touchpoints").update({ whatsapp_sent_at: now.toISOString(), whatsapp_template: name }).eq("id", r.id).is("whatsapp_sent_at", null).select("id");
    if (!claimed.data?.length) continue;
    try {
      const res = await post(sender, buildTemplateMessage(String(r.phone), name, t!.language, params.map((p) => waParam(p, 120)), buttons));
      if (res.ok) {
        await db.from("ca_touchpoints").update({ whatsapp_wamid: res.body.messages![0].id }).eq("id", r.id);
        if (key) recently.add(key);
        sent++;
      } else {
        const why = explainWaError(res.body.error?.code, res.body.error?.error_data?.details ?? res.body.error?.message);
        // A number that cannot be reached will not start working tomorrow; anything else is tried at the next run.
        await db.from("ca_touchpoints").update(why.permanent ? { whatsapp_error: why.message } : { whatsapp_sent_at: null, whatsapp_template: null }).eq("id", r.id);
      }
    } catch {
      await db.from("ca_touchpoints").update({ whatsapp_sent_at: null, whatsapp_template: null }).eq("id", r.id);
    }
  }
  return { sent };
}

/* ── what comes back ── */

interface Incoming {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string } };
}

const STOP = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|band karo|mat bhejo)\b/i;

async function optOut(db: Db, phone: string | null | undefined, firmId: string | null) {
  const key = phoneKey(phone);
  if (key) await db.from("ca_touch_optout").upsert({ phone_key: key }, { onConflict: "phone_key" });
  if (firmId) {
    const { data } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
    await db.from("ca_firms").update({ notification_prefs: { ...((data?.notification_prefs ?? {}) as Record<string, unknown>), touch_whatsapp_ok: false } }).eq("id", firmId);
  }
}

/** A tap on Call me / Not now / Stop messages. Returns a status line for the webhook log. */
export async function handleTouchButton(db: Db, m: Incoming, reply: (text: string) => Promise<unknown>): Promise<string> {
  const p = parseTouchPayload(buttonPayloadOf({ type: m.type, button: m.button, interactive: m.interactive }));
  if (!p) return "not a follow-up button";
  const { data: t } = await db.from("ca_touchpoints").select("id, ca_firm_id, phone, status, detail").eq("id", p.id).maybeSingle();
  if (!t) return "follow-up no longer exists";
  // The tap must come from the number we wrote to.
  if (phoneKey(t.phone as string) !== phoneKey(m.from)) return "tap from a different number";
  const detail = (t.detail ?? {}) as { taps?: string[] };
  if (detail.taps?.includes(m.id)) return "duplicate delivery";
  const now = new Date();
  const rule = TOUCH_ACTION_RULES[p.action];
  const note = `${rule.note} ${now.toISOString().slice(0, 10)}`;
  const base = { detail: { ...detail, taps: [...(detail.taps ?? []), m.id] }, replied_at: now.toISOString(), note };
  if (p.action === "call") await db.from("ca_touchpoints").update({ ...base, status: "open", hot: true, due_at: now.toISOString(), snoozed_until: null, callback_requested_at: now.toISOString() }).eq("id", p.id);
  else if (p.action === "later") await db.from("ca_touchpoints").update({ ...base, snoozed_until: new Date(now.getTime() + 3 * DAY).toISOString() }).eq("id", p.id);
  else {
    await db.from("ca_touchpoints").update({ ...base, whatsapp_error: "asked us to stop" }).eq("id", p.id);
    await optOut(db, t.phone as string, (t.ca_firm_id as string | null) ?? null);
  }
  await reply(rule.reply);
  return `follow-up: ${p.action}`;
}

/**
 * A written reply from a number we have a follow-up for. It goes onto the follow-up, which becomes hot and due now,
 * and the person gets one thank-you. "STOP" is honoured. Returns false if no follow-up is for this number.
 */
export async function noteTouchReply(db: Db, m: Incoming, reply: (text: string) => Promise<unknown>): Promise<boolean> {
  if (m.type !== "text" || !m.text?.body?.trim()) return false;
  const key = phoneKey(m.from);
  if (!key) return false;
  const { data } = await db.from("ca_touchpoints").select("id, ca_firm_id, phone, status, replied_at, note, detail").not("phone", "is", null).order("created_at", { ascending: false }).limit(2000);
  const mine = (data ?? []).filter((r) => phoneKey(r.phone as string) === key);
  if (!mine.length) return false;
  const body = m.text.body.trim().replace(/\s+/g, " ").slice(0, 300);
  if (STOP.test(body)) {
    await optOut(db, m.from, (mine[0].ca_firm_id as string | null) ?? null);
    await reply(TOUCH_ACTION_RULES.stop.reply);
    return true;
  }
  const first = mine.find((r) => r.status === "open") ?? mine[0];
  const detail = (first.detail ?? {}) as { taps?: string[] };
  if (detail.taps?.includes(m.id)) return true;
  const now = new Date();
  const firstReply = !first.replied_at;
  await db
    .from("ca_touchpoints")
    .update({
      status: "open",
      hot: true,
      due_at: now.toISOString(),
      snoozed_until: null,
      replied_at: now.toISOString(),
      callback_requested_at: now.toISOString(),
      note: `Replied on WhatsApp: "${body}"`,
      detail: { ...detail, taps: [...(detail.taps ?? []), m.id] },
    })
    .eq("id", first.id);
  if (firstReply) await reply("Thank you. A person from FynHelp will read this and reply here soon.");
  return true;
}

export { sendPlainText };
