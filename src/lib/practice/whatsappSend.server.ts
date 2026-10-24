/**
 * Send a chase on WhatsApp through the official Cloud API (approved template).
 * Never throws: callers get a result they can show, and the Chaser keeps going.
 */
import type { Db } from "./db.server";
import { buildTemplateMessage, buildTextMessage, chaseText, explainWaError, inServiceWindow, windowClosed } from "./whatsappFlow";
import { DEFAULT_COUNTRY_CODE, normalisePhone, parseCountryCode } from "./chaser/rules";

const GRAPH = process.env["WHATSAPP_GRAPH_BASE"] || "https://graph.facebook.com/v21.0";
const env = (n: string) => (process.env[n] ?? "").trim() || undefined;

export const chaseTemplate = () => env("WHATSAPP_CHASE_TEMPLATE") ?? "document_request";
export const chaseTemplateLang = () => env("WHATSAPP_TEMPLATE_LANG") ?? "en";

/** Whether this firm can send through the API now, and if not, why not. */
export async function whatsappSendReady(db: Db, firmId: string): Promise<{ ready: boolean; phoneNumberId: string | null; reason: string | null }> {
  if (!env("WHATSAPP_ACCESS_TOKEN")) return { ready: false, phoneNumberId: null, reason: "WHATSAPP_ACCESS_TOKEN is not set on the server." };
  const { data } = await db
    .from("ca_whatsapp_channels")
    .select("phone_number_id")
    .eq("ca_firm_id", firmId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return { ready: false, phoneNumberId: null, reason: "No WhatsApp number is connected for this firm." };
  return { ready: true, phoneNumberId: data.phone_number_id as string, reason: null };
}

/** The firm's home country calling code (Settings), used for numbers saved without one. */
export async function firmCountryCode(db: Db, firmId: string): Promise<string> {
  const { data } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
  const p = (data?.notification_prefs ?? {}) as Record<string, unknown>;
  return p["default_country_code"] ? parseCountryCode(p["default_country_code"]) : DEFAULT_COUNTRY_CODE;
}

export type WaSendResult =
  | { ok: true; wamid: string; to: string; mode: "text" | "template" }
  | { ok: false; unconfigured: boolean; permanent: boolean; error: string };

interface GraphReply {
  messages?: { id: string }[];
  error?: { code?: number; message?: string; error_data?: { details?: string } };
}

async function post(phoneNumberId: string, payload: unknown): Promise<{ ok: boolean; body: GraphReply }> {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as GraphReply;
  return { ok: res.ok && Boolean(body.messages?.[0]?.id), body };
}

/**
 * Sends the chase. Inside the 24-hour window after the client last wrote it goes as plain
 * text (no template needed); otherwise, or if WhatsApp says the window closed, as the
 * approved template.
 */
export async function sendChaseWhatsapp(
  db: Db,
  firmId: string,
  phone: string | null | undefined,
  params: string[],
  opts: { cc?: string } = {},
): Promise<WaSendResult> {
  const cc = opts.cc ?? (await firmCountryCode(db, firmId));
  const to = normalisePhone(phone, cc);
  if (!to) return { ok: false, unconfigured: false, permanent: true, error: "The phone number is missing or not a valid mobile number. Add it with the country code, for example +91 98450 12345." };
  const ready = await whatsappSendReady(db, firmId);
  if (!ready.ready) return { ok: false, unconfigured: true, permanent: false, error: ready.reason ?? "WhatsApp is not set up." };
  try {
    const { data: contact } = await db
      .from("ca_whatsapp_contacts")
      .select("last_inbound_at")
      .eq("ca_firm_id", firmId)
      .eq("phone_key", to)
      .maybeSingle();
    if (inServiceWindow(contact?.last_inbound_at as string | undefined)) {
      const t = await post(ready.phoneNumberId!, buildTextMessage(to, chaseText(params)));
      if (t.ok) return { ok: true, wamid: t.body.messages![0].id, to, mode: "text" };
      // A bad token will fail the template too; any other failure (window closed, odd text rejection) falls back to it.
      if (t.body.error?.code === 190 && !windowClosed(t.body.error.code)) {
        const why = explainWaError(190, t.body.error.message);
        return { ok: false, unconfigured: false, permanent: why.permanent, error: why.message };
      }
    }
    const r = await post(ready.phoneNumberId!, buildTemplateMessage(to, chaseTemplate(), chaseTemplateLang(), params));
    if (r.ok) return { ok: true, wamid: r.body.messages![0].id, to, mode: "template" };
    const why = explainWaError(r.body.error?.code, r.body.error?.error_data?.details ?? r.body.error?.message);
    return { ok: false, unconfigured: false, permanent: why.permanent, error: why.message };
  } catch (e) {
    return { ok: false, unconfigured: false, permanent: false, error: `Could not reach WhatsApp (${e instanceof Error ? e.message : "network error"}).` };
  }
}

/** Per firm, per day: stops a runaway schedule from hurting the number's quality rating. */
export const whatsappDailyCap = () => Math.max(1, Number(env("WHATSAPP_DAILY_CAP_PER_FIRM")) || 200);

/** Contact-window rows older than a week mean nothing; keep the table small. */
export async function pruneWhatsappContacts(db: Db, now = new Date()): Promise<void> {
  await db.from("ca_whatsapp_contacts").delete().lt("last_inbound_at", new Date(now.getTime() - 7 * 86_400_000).toISOString());
}
