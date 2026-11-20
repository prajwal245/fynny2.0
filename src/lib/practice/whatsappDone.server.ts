/**
 * Tells a client on WhatsApp when the file they sent has been read, whatever the outcome. It is a reply to their own message, so it
 * does not go through the reminder rules (daily cap, daytime window, consent): the client has just written and expects an answer.
 *
 *  - Sent once per file (the time is stored on the file); a failed send is tried again at the next read.
 *  - Free text inside WhatsApp's 24-hour window (a free service message). Outside it, an approved template if WHATSAPP_DONE_TEMPLATE is
 *    set (one body variable: the message); otherwise the reason is recorded for the admin, never swallowed.
 *  - Tracked: an entry in the client's activity feed, and a row in the admin call log with the channel and the estimated Meta cost.
 */
import { logActivity, type Db } from "./db.server";
import { MAX_EXTRACT_ATTEMPTS } from "./orchestrate";
import { doneMessage, estimateWhatsappCost, finalOutcome, type WaKind } from "./whatsappDone";
import { buildTemplateMessage } from "./whatsappFlow";
import { chaseTemplateLang, post, recordWaFault, resolveSender, sendPlainText } from "./whatsappSend.server";

const env = (k: string) => (typeof process !== "undefined" ? process.env?.[k] : undefined);

async function track(db: Db, firmId: string, businessId: string | null, file: string, to: string, kind: WaKind | "none", status: "success" | "error", detail: string) {
  const est = kind === "none" ? 0 : estimateWhatsappCost(kind, { WHATSAPP_RATE_UTILITY_INR: env("WHATSAPP_RATE_UTILITY_INR"), WHATSAPP_RATE_MARKETING_INR: env("WHATSAPP_RATE_MARKETING_INR") });
  try {
    await db.from("ca_ai_calls").insert({ ca_firm_id: firmId, purpose: "whatsapp_done", provider: "meta", model: kind, input: file.slice(0, 120), output: JSON.stringify({ to_last4: to.slice(-4), kind, est_cost_inr: est }), latency_ms: null, status, error: status === "error" ? detail.slice(0, 500) : null });
  } catch { /* tracking must never break the message */ }
  if (status === "success") await logActivity(db, firmId, businessId, "extract", `${detail} (WhatsApp ${kind === "service" ? "service reply, free inside 24 hours" : `${kind} template, estimated ₹${est.toFixed(2)}`}).`).catch(() => undefined);
}

export async function notifyFileProcessed(db: Db, extractionId: string): Promise<string> {
  const { data: d } = await db
    .from("ca_document_extractions")
    .select("id, ca_firm_id, business_id, original_filename, extract_status, extract_attempts, extract_next_attempt_at, error_message, row_count, txn_count, source_metadata")
    .eq("id", extractionId)
    .maybeSingle();
  if (!d) return "no document";
  const meta = (d.source_metadata ?? {}) as { wa_from?: string; wa_done_at?: string };
  if (!meta.wa_from) return "not from WhatsApp";
  if (meta.wa_done_at) return "already told";
  const outcome = finalOutcome(d as { extract_status: string | null; extract_next_attempt_at: string | null; extract_attempts: number | null }, MAX_EXTRACT_ATTEMPTS);
  if (!outcome) return "not final";
  const file = d.original_filename ?? "your file";
  const text = doneMessage({ filename: file, outcome, lines: d.txn_count || d.row_count || null, reason: d.error_message });
  const told = `Told the sender on WhatsApp that ${file} was ${outcome === "unreadable" ? "not readable" : outcome === "held" ? "read and is with the team" : "read"}`;
  const r = await resolveSender(db, d.ca_firm_id);
  let kind: WaKind | "none" = "none";
  let sent = false;
  if (r.sender) {
    sent = await sendPlainText(r.sender, meta.wa_from, text);
    if (sent) kind = "service";
    // Outside the 24-hour window free text is refused. An approved template can still reach the client.
    const tpl = env("WHATSAPP_DONE_TEMPLATE");
    if (!sent && tpl) {
      try {
        sent = (await post(r.sender, buildTemplateMessage(meta.wa_from, tpl, chaseTemplateLang(), [text.slice(0, 900)]))).ok;
        if (sent) kind = (env("WHATSAPP_DONE_TEMPLATE_CATEGORY") ?? "utility").toLowerCase() === "marketing" ? "marketing" : "utility";
      } catch { sent = false; }
    }
  }
  if (sent) {
    await track(db, d.ca_firm_id, d.business_id ?? null, file, meta.wa_from, kind, "success", told);
  } else if (r.test) {
    // A test firm's messages are simulated: marked as done so a retry does not repeat it, and shown in the activity feed as simulated.
    await logActivity(db, d.ca_firm_id, d.business_id ?? null, "extract", `${told} (simulated: this is a test firm).`).catch(() => undefined);
  } else {
    const why = r.sender
      ? `The "file read" message was not delivered. Free text works only within 24 hours of the client's last message; after that an approved template is needed (set WHATSAPP_DONE_TEMPLATE).`
      : `A file was read but the client could not be told on WhatsApp: no sender is set up. ${r.reason ?? ""}`;
    await recordWaFault(db, d.ca_firm_id, why);
    await track(db, d.ca_firm_id, d.business_id ?? null, file, meta.wa_from, "none", "error", why);
  }
  if (sent || r.test) await db.from("ca_document_extractions").update({ source_metadata: { ...meta, wa_done_at: new Date().toISOString() } }).eq("id", d.id);
  return sent ? "sent" : r.test ? "test firm (simulated)" : "not delivered";
}
