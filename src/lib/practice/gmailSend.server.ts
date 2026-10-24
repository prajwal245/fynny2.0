/**
 * Send a chase from the firm's own Gmail (users.messages.send). Never throws:
 * the caller falls back to the FynHelp domain on any failure, so a chase is
 * never lost because of a Google problem.
 */
import type { Db } from "./db.server";
import { accessToken, type Connection } from "./gmailIntake.server";
import { buildRawMessage, threadSubject } from "./gmailSend";

export interface GmailSendInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName: string;
  replyTo?: string | null;
  /** Keep follow-ups in the thread of the first message. */
  thread?: { id: string; subject: string } | null;
}

export type GmailSendResult =
  | { ok: true; id: string; threadId: string; from: string; subject: string }
  | { ok: false; needsConsent: boolean; error: string };

export async function sendViaGmail(db: Db, firmId: string, msg: GmailSendInput): Promise<GmailSendResult> {
  try {
    const { data: conn } = await db
      .from("ca_gmail_connections")
      .select("id, ca_firm_id, user_id, gmail_address, access_token_enc, refresh_token_enc, token_expiry, last_polled_at")
      .eq("ca_firm_id", firmId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn) return { ok: false, needsConsent: false, error: "No connected Gmail" };
    const c = conn as unknown as Connection;
    const subject = msg.thread ? threadSubject(msg.thread.subject) : msg.subject;
    const raw = buildRawMessage({
      fromName: msg.fromName,
      fromAddress: c.gmail_address,
      to: msg.to,
      subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
    });
    const token = await accessToken(db, c);
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw, ...(msg.thread ? { threadId: msg.thread.id } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { message?: string } };
    if (!res.ok || !body.id) {
      return {
        ok: false,
        needsConsent: res.status === 403 || res.status === 401,
        error: body.error?.message ?? `Gmail ${res.status}`,
      };
    }
    return { ok: true, id: body.id, threadId: body.threadId ?? body.id, from: c.gmail_address, subject };
  } catch (e) {
    return { ok: false, needsConsent: false, error: e instanceof Error ? e.message : "Gmail send failed" };
  }
}
