/**
 * Turning lifecycle emails off and on. Each email carries a signed link (and a
 * one-click List-Unsubscribe header), so a firm can stop them without signing
 * in; partners can also switch them in Settings. Billing emails are not
 * affected. The choice lives in ca_firms.notification_prefs.lifecycle_emails.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "../db.server";

const secret = () => process.env["EMAIL_LINK_SECRET"] || process.env["CA_CRON_SECRET"] || process.env["CRON_SECRET"] || process.env["GMAIL_ENCRYPTION_KEY"] || "";

export function optOutToken(firmId: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update(`lifecycle-optout:${firmId}`).digest("base64url").slice(0, 32);
}

export function optOutTokenValid(firmId: string, token: string | null | undefined): boolean {
  const want = optOutToken(firmId);
  if (!want || !token) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The link in each lifecycle email, or null when no signing secret is set. */
export function optOutUrl(appUrl: string, firmId: string): string | null {
  const t = optOutToken(firmId);
  return t ? `${appUrl.replace(/\/$/, "")}/api/public/email-preferences?f=${encodeURIComponent(firmId)}&t=${t}` : null;
}

type Prefs = Record<string, unknown>;

export const lifecycleEmailsOn = (prefs: unknown) => (prefs as Prefs | null)?.["lifecycle_emails"] !== false;

export async function setLifecycleEmails(db: Db, firmId: string, on: boolean): Promise<void> {
  const { data } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
  const prefs = { ...((data?.notification_prefs as Prefs | null) ?? {}), lifecycle_emails: on };
  const { error } = await db.from("ca_firms").update({ notification_prefs: prefs }).eq("id", firmId);
  if (error) throw new Error(error.message);
}

export async function getLifecycleEmails(db: Db, firmId: string): Promise<boolean> {
  const { data } = await db.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle();
  return lifecycleEmailsOn(data?.notification_prefs);
}
