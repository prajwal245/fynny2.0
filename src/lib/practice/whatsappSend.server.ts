/**
 * Send a chase on WhatsApp through the official Cloud API (approved template).
 * Never throws: callers get a result they can show, and the Chaser keeps going.
 */
import type { Db } from "./db.server";
import { buildTemplateMessage, explainWaError } from "./whatsappFlow";
import { normalisePhone } from "./chaser/rules";

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

export type WaSendResult =
  | { ok: true; wamid: string; to: string }
  | { ok: false; unconfigured: boolean; permanent: boolean; error: string };

export async function sendChaseWhatsapp(
  db: Db,
  firmId: string,
  phone: string | null | undefined,
  params: string[],
): Promise<WaSendResult> {
  const to = normalisePhone(phone);
  if (!to) return { ok: false, unconfigured: false, permanent: true, error: "The phone number is missing or not a valid mobile number." };
  const ready = await whatsappSendReady(db, firmId);
  if (!ready.ready) return { ok: false, unconfigured: true, permanent: false, error: ready.reason ?? "WhatsApp is not set up." };
  try {
    const res = await fetch(`${GRAPH}/${ready.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildTemplateMessage(to, chaseTemplate(), chaseTemplateLang(), params)),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { code?: number; message?: string; error_data?: { details?: string } };
    };
    const wamid = body.messages?.[0]?.id;
    if (res.ok && wamid) return { ok: true, wamid, to };
    const why = explainWaError(body.error?.code, body.error?.error_data?.details ?? body.error?.message);
    return { ok: false, unconfigured: false, permanent: why.permanent, error: why.message };
  } catch (e) {
    return { ok: false, unconfigured: false, permanent: false, error: `Could not reach WhatsApp (${e instanceof Error ? e.message : "network error"}).` };
  }
}
