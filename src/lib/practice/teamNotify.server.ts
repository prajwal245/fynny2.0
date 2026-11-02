/**
 * Emails to FynHelp's own team (new sign-ups). Recipients come from SIGNUP_NOTIFY_EMAILS (comma separated),
 * else the founders' FynHelp addresses. Never throws and never holds a sign-up up for long.
 */
import { brandedEmail } from "./emailLayout";
import { sendEmail } from "./email.server";
import { looksLikeTest } from "../admin/testLook";
import type { LeadInput } from "../leadSchema";

const DEFAULT_TO = ["nidhi@fynhelp.com", "prajwal@fynhelp.com", "adireddytarun@fynhelp.com"];

const clickLines = (label: string, t: NonNullable<LeadInput["first"]> | undefined): [string, string][] => {
  if (!t) return [];
  const bits = [t.utm_source, t.utm_medium].filter(Boolean).join(" / ");
  const ad = [t.utm_campaign, t.utm_content, t.utm_term].filter(Boolean).join(" · ");
  const ids = [t.gclid ? "gclid" : "", t.fbclid ? "fbclid" : ""].filter(Boolean).join(", ");
  const v = [bits, ad, ids].filter(Boolean).join(" | ");
  return v ? [[label, v]] : [];
};

export const signupRecipients = (): string[] => {
  const set = (process.env["SIGNUP_NOTIFY_EMAILS"] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return set.length ? set : DEFAULT_TO;
};

export interface SignupFacts {
  name: string;
  email: string;
  phone: string;
  whatsappOk: boolean;
  channel?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  landing?: string;
  referrerHost?: string;
  /** First and last click campaign tags. */
  lead?: LeadInput;
}

/** Tells the team a new person signed up. Resolves quickly even if the mail provider is slow. */
export async function notifyNewSignup(f: SignupFacts): Promise<{ sent: boolean }> {
  try {
    const test = looksLikeTest(f.name, f.email);
    const from = [f.source, f.medium].filter(Boolean).join(" / ");
    const figures: [string, string][] = [
      ["Name", f.name],
      ["Email", f.email],
      ["Mobile", f.phone ? `+${f.phone}` : "—"],
      ["WhatsApp help", f.whatsappOk ? "agreed" : "not agreed"],
      ["Came from", f.channel ? `${f.channel.replace("-", " ")}${from ? ` (${from})` : ""}` : "not tracked"],
      ...(f.campaign ? ([["Campaign", `${f.campaign}${f.content ? ` · ${f.content}` : ""}`]] as [string, string][]) : []),
      ...(f.referrerHost ? ([["Referred by site", f.referrerHost]] as [string, string][]) : []),
      ...(f.landing ? ([["Landed on", f.landing]] as [string, string][]) : []),
      ...clickLines("First click", f.lead?.first),
      ...clickLines("Last click", f.lead?.last),
      ["Time (IST)", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
    ];
    const { html, text } = brandedEmail(
      {
        preheader: `${f.name} just created a FynHelp account.`,
        heading: test ? "New sign-up (looks like a test)" : "New sign-up",
        paragraphs: [test ? "This looks like a test or fake account. Mark it as test in Admin, Firms so it stays out of the numbers." : "A new person created a FynHelp account. They are about to set up their firm."],
        figures,
        cta: { label: "Open Admin, Firms", url: "https://www.fynhelp.com/admin/firms" },
        signoff: "FynHelp",
      },
      { footer: "Internal notification to the FynHelp team." },
    );
    const send = Promise.all(
      signupRecipients().map((to) => sendEmail({ to, subject: `${test ? "[test?] " : ""}New sign-up: ${f.name}`, html, text, replyTo: f.email, fromName: "Signups" })),
    ).then((r) => ({ sent: r.some((x) => x.sent) }));
    return await Promise.race([send, new Promise<{ sent: boolean }>((res) => setTimeout(() => res({ sent: false }), 5000))]);
  } catch (e) {
    console.error(`[signup-notify] ${(e as Error).message}`);
    return { sent: false };
  }
}
