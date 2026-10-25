/**
 * Send on WhatsApp through the official Cloud API. Each firm sends from FynHelp's shared
 * number or from its own; this module decides which and sends. Never throws: callers get a
 * result they can show, and the Chaser keeps going.
 */
import type { Db } from "./db.server";
import {
  buildTemplateMessage,
  buildTextMessage,
  chaseText,
  chooseSender,
  explainWaError,
  inServiceWindow,
  windowClosed,
  type WaSenderChoice,
} from "./whatsappFlow";
import { DEFAULT_COUNTRY_CODE, normalisePhone, parseCountryCode } from "./chaser/rules";
import { phoneAllowedInTest, sandboxId } from "./testMode";

const GRAPH = process.env["WHATSAPP_GRAPH_BASE"] || "https://graph.facebook.com/v21.0";
const env = (n: string) => (process.env[n] ?? "").trim() || undefined;

export const chaseTemplate = () => env("WHATSAPP_CHASE_TEMPLATE") ?? "document_request";
export const chaseTemplateLang = () => env("WHATSAPP_TEMPLATE_LANG") ?? "en";

/**
 * FynHelp's own shared WhatsApp number (Phone number ID from Meta), if one is set up.
 * The documented name is WHATSAPP_DEFAULT_PHONE_NUMBER_ID; the names people most often use for
 * the same value are accepted too, so a differently named setting is not silently ignored.
 */
export const SHARED_ID_NAMES = ["WHATSAPP_DEFAULT_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_PHONE_ID"] as const;
export const sharedPhoneNumberId = () => {
  for (const n of SHARED_ID_NAMES) {
    const v = env(n);
    if (v) return v.replace(/\D/g, "") || undefined;
  }
  return undefined;
};
export const sharedDisplayNumber = () => env("WHATSAPP_DEFAULT_DISPLAY_NUMBER");

export interface Sender {
  choice: WaSenderChoice;
  phoneNumberId: string;
  token: string;
  /** True on FynHelp's shared number, where one number serves many firms. */
  shared: boolean;
  wabaId: string | null;
}

export interface SenderResolution {
  sender: Sender | null;
  /** The firm is a test firm: it sends only through Meta's sandbox number, or not at all. */
  test: boolean;
  /** What the firm picked (or null), and what is actually in use. */
  pref: WaSenderChoice | null;
  hasOwn: boolean;
  sharedConfigured: boolean;
  reason: string | null;
}

async function decryptStored(enc: string): Promise<string | null> {
  try {
    return await (await import("@/lib/caGmail.server")).decryptToken(enc);
  } catch {
    return null;
  }
}

/** Which number this firm sends from, with the token to use for it. */
export async function resolveSender(db: Db, firmId: string): Promise<SenderResolution> {
  const [{ data: firm }, { data: own }] = await Promise.all([
    db.from("ca_firms").select("notification_prefs, is_test").eq("id", firmId).maybeSingle(),
    db
      .from("ca_whatsapp_channels")
      .select("phone_number_id, access_token_enc, waba_id")
      .eq("ca_firm_id", firmId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);
  if (firm?.is_test) {
    // Test firms never use a real firm's or FynHelp's live number: only Meta's free test number, if one is set.
    const id = env("WHATSAPP_TEST_PHONE_NUMBER_ID");
    const token = env("WHATSAPP_TEST_ACCESS_TOKEN");
    return {
      test: true, pref: null, hasOwn: false, sharedConfigured: false,
      sender: id && token ? { choice: "fynhelp", phoneNumberId: id.replace(/\D/g, ""), token, shared: false, wabaId: env("WHATSAPP_TEST_WABA_ID") ?? null } : null,
      reason: id && token ? null : "Test account: WhatsApp is simulated. Set WHATSAPP_TEST_PHONE_NUMBER_ID and WHATSAPP_TEST_ACCESS_TOKEN (Meta's free test number) to send to the numbers in TEST_RECIPIENTS.",
    };
  }
  const prefRaw = ((firm?.notification_prefs ?? {}) as Record<string, unknown>)["whatsapp_sender"];
  const pref: WaSenderChoice | null = prefRaw === "own" ? "own" : prefRaw === "fynhelp" ? "fynhelp" : null;
  const serverToken = env("WHATSAPP_ACCESS_TOKEN");
  const sharedId = sharedPhoneNumberId();
  const hasOwn = Boolean(own);
  const sharedConfigured = Boolean(sharedId && serverToken);
  const choice = chooseSender({ pref, hasOwn, sharedConfigured });
  const base = { test: false, pref, hasOwn, sharedConfigured };
  if (!choice) {
    return {
      ...base,
      sender: null,
      reason: serverToken
        ? "No WhatsApp number is set up for this firm. Link your own number, or use FynHelp's number."
        : "WHATSAPP_ACCESS_TOKEN is not set on the server.",
    };
  }
  if (choice === "fynhelp") {
    return { ...base, sender: { choice, phoneNumberId: sharedId!, token: serverToken!, shared: true, wabaId: env("WHATSAPP_WABA_ID") ?? null }, reason: null };
  }
  const token = own!.access_token_enc ? await decryptStored(own!.access_token_enc as string) : serverToken;
  if (!token) {
    return {
      ...base,
      sender: null,
      reason: own!.access_token_enc
        ? "The saved access token for your WhatsApp number could not be read. Link the number again with a new token."
        : "WHATSAPP_ACCESS_TOKEN is not set on the server.",
    };
  }
  return {
    ...base,
    sender: { choice, phoneNumberId: own!.phone_number_id as string, token, shared: false, wabaId: (own!.waba_id as string | null) ?? env("WHATSAPP_WABA_ID") ?? null },
    reason: null,
  };
}

/** Whether this firm can send through the API now, and if not, why not. */
export async function whatsappSendReady(
  db: Db,
  firmId: string,
): Promise<{ ready: boolean; phoneNumberId: string | null; reason: string | null; shared: boolean }> {
  const r = await resolveSender(db, firmId);
  // A test firm is always "ready": its messages are simulated when there is no sandbox number.
  return { ready: Boolean(r.sender) || r.test, phoneNumberId: r.sender?.phoneNumberId ?? null, reason: r.test ? null : r.reason, shared: r.sender?.shared ?? false };
}

/** The firm's home country calling code (Settings), used for numbers saved without one. */
export async function firmCountryCode(db: Db, firmId: string): Promise<string> {
  const { data } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
  const p = (data?.notification_prefs ?? {}) as Record<string, unknown>;
  return p["default_country_code"] ? parseCountryCode(p["default_country_code"]) : DEFAULT_COUNTRY_CODE;
}

export type WaSendResult =
  | { ok: true; wamid: string; to: string; mode: "text" | "template"; /** A test firm's message: recorded, not sent. */ simulated?: boolean }
  | { ok: false; unconfigured: boolean; permanent: boolean; error: string; /** The firm has no WhatsApp credits left. */ noCredits?: boolean };

interface GraphReply {
  messages?: { id: string }[];
  error?: { code?: number; message?: string; error_data?: { details?: string } };
}

async function post(sender: Pick<Sender, "phoneNumberId" | "token">, payload: unknown): Promise<{ ok: boolean; body: GraphReply }> {
  const res = await fetch(`${GRAPH}/${sender.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sender.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as GraphReply;
  return { ok: res.ok && Boolean(body.messages?.[0]?.id), body };
}

/** Plain text reply inside the 24-hour window (for example, confirming a JOIN code). */
export async function sendPlainText(sender: Pick<Sender, "phoneNumberId" | "token">, to: string, body: string): Promise<boolean> {
  try {
    return (await post(sender, buildTextMessage(to, body))).ok;
  } catch {
    return false;
  }
}

/** On the shared number, remember which firm a phone belongs to so its replies and documents find them. */
export async function bindRoute(db: Db, phoneKey: string, firmId: string, via: "chase" | "join" | "auto"): Promise<void> {
  const { error } = await db
    .from("ca_whatsapp_routes")
    .upsert({ phone_key: phoneKey, ca_firm_id: firmId, via, updated_at: new Date().toISOString() }, { onConflict: "phone_key" });
  if (error) console.error(`[fyn:whatsapp] route: ${error.message}`);
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
  const { sender, reason, test } = await resolveSender(db, firmId);
  // A test firm reaches only the numbers in TEST_RECIPIENTS, and only through Meta's test number. Anything else is recorded, not sent.
  if (test && (!sender || !phoneAllowedInTest(to, process.env["TEST_RECIPIENTS"])))
    return { ok: true, wamid: sandboxId(), to, mode: "template", simulated: true };
  if (!sender) return { ok: false, unconfigured: true, permanent: false, error: reason ?? "WhatsApp is not set up." };
  // On FynHelp's shared number a reminder costs one credit, given back if it is not sent. Own numbers and test firms are free.
  const credits = await import("./billing/credits.server");
  const spend = await credits.spendForReminder(db, firmId, { sharedNumber: sender.shared });
  if (!spend.ok)
    return { ok: false, unconfigured: false, permanent: false, noCredits: true, error: "Out of WhatsApp credits. Add credits in Settings, Billing and the reminder goes out." };
  const attempt = async (): Promise<WaSendResult> => {
  try {
    const { data: contact } = await db
      .from("ca_whatsapp_contacts")
      .select("last_inbound_at")
      .eq("ca_firm_id", firmId)
      .eq("phone_key", to)
      .maybeSingle();
    let sent: { wamid: string; mode: "text" | "template" } | null = null;
    if (inServiceWindow(contact?.last_inbound_at as string | undefined)) {
      const t = await post(sender, buildTextMessage(to, chaseText(params)));
      if (t.ok) sent = { wamid: t.body.messages![0].id, mode: "text" };
      // A bad token will fail the template too; any other failure (window closed, odd text rejection) falls back to it.
      else if (t.body.error?.code === 190 && !windowClosed(t.body.error.code)) {
        const why = explainWaError(190, t.body.error.message);
        return { ok: false, unconfigured: false, permanent: why.permanent, error: why.message };
      }
    }
    if (!sent) {
      const r = await post(sender, buildTemplateMessage(to, chaseTemplate(), chaseTemplateLang(), params));
      if (!r.ok) {
        const why = explainWaError(r.body.error?.code, r.body.error?.error_data?.details ?? r.body.error?.message);
        return { ok: false, unconfigured: false, permanent: why.permanent, error: why.message };
      }
      sent = { wamid: r.body.messages![0].id, mode: "template" };
    }
    // One number serves many firms: note whose client this phone is, so the reply comes back to this firm.
    if (sender.shared) await bindRoute(db, to, firmId, "chase");
    return { ok: true, wamid: sent.wamid, to, mode: sent.mode };
  } catch (e) {
    return { ok: false, unconfigured: false, permanent: false, error: `Could not reach WhatsApp (${e instanceof Error ? e.message : "network error"}).` };
  }
  };
  const result = await attempt();
  if (!result.ok) await credits.refundReminder(db, firmId, spend.ref);
  return result;
}

/** Per firm, per day: stops a runaway schedule from hurting the number's quality rating. */
export const whatsappDailyCap = () => Math.max(1, Number(env("WHATSAPP_DAILY_CAP_PER_FIRM")) || 200);

/** Contact-window rows older than a week mean nothing; keep the table small. */
export async function pruneWhatsappContacts(db: Db, now = new Date()): Promise<void> {
  await db.from("ca_whatsapp_contacts").delete().lt("last_inbound_at", new Date(now.getTime() - 7 * 86_400_000).toISOString());
}

/** A short code for the firm to give clients who message the shared number. */
export async function ensureJoinCode(db: Db, firmId: string): Promise<string> {
  const { data } = await db.from("ca_firms").select("whatsapp_join_code").eq("id", firmId).maybeSingle();
  if (data?.whatsapp_join_code) return data.whatsapp_join_code as string;
  const { newJoinCode } = await import("./whatsappFlow");
  for (let i = 0; i < 5; i++) {
    const code = newJoinCode();
    const { error } = await db.from("ca_firms").update({ whatsapp_join_code: code }).eq("id", firmId).is("whatsapp_join_code", null);
    if (!error) {
      const { data: again } = await db.from("ca_firms").select("whatsapp_join_code").eq("id", firmId).maybeSingle();
      if (again?.whatsapp_join_code) return again.whatsapp_join_code as string;
    }
    // A duplicate code (unique index) just means: try another.
  }
  throw new Error("Could not create a join code");
}
