/**
 * Sign-up without a confirmation email. The account is created already
 * confirmed, and the browser signs in with the same password straight after,
 * so a new firm goes from "Create account" to firm setup in one click.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { flatLead, leadSchema } from "@/lib/leadSchema";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
  /** Mobile number, collected so a person can help if setup stalls. */
  phone: z.string().trim().min(1).max(24),
  /** Proof from the WhatsApp code step; required once WhatsApp verification is on. */
  phoneProof: z.string().max(200).optional(),
  /** The person agreed to setup help and trial updates on WhatsApp. */
  whatsappOk: z.boolean().optional(),
  /** First click and last click campaign tags, saved on the new user and sent to the lead sheet. */
  lead: leadSchema.optional(),
  /** Where the visitor came from (first touch), for the team's sign-up email. Not stored here. */
  attribution: z
    .object({
      channel: z.string().max(40).optional(),
      source: z.string().max(100).optional(),
      medium: z.string().max(100).optional(),
      campaign: z.string().max(100).optional(),
      content: z.string().max(100).optional(),
      landing: z.string().max(200).optional(),
      referrerHost: z.string().max(100).optional(),
    })
    .optional(),
});

export type CreateAccountResult = { ok: true; existed: boolean } | { ok: false; message: string };

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accountSchema.parse(data))
  .handler(async ({ data }): Promise<CreateAccountResult> => {
    const { checkPassword } = await import("@/lib/passwordPolicy");
    const weak = await checkPassword(data.password, data.email);
    if (weak) return { ok: false, message: weak };
    const { parseMobile } = await import("@/lib/practice/mobile");
    const mobile = parseMobile(data.phone);
    if (!mobile) return { ok: false, message: "Enter a valid mobile number, for example 98200 11223." };
    const { looksFake } = await import("@/lib/practice/signupOtp");
    if (mobile.digits.startsWith("91") && looksFake(mobile.digits.slice(2))) return { ok: false, message: "That does not look like a real mobile number. Please check it." };
    const { phoneProofOk } = await import("@/lib/practice/signupOtp.server");
    if (!phoneProofOk(mobile.digits, data.phoneProof)) return { ok: false, message: "Please verify your mobile number with the code we send on WhatsApp." };
    const { adminDb } = await import("@/lib/practice/db.server");
    const db = await adminDb();
    // At most 10 sign-ups an hour from one network.
    const { clientIp } = await import("@/lib/admin/security.server");
    const ip = clientIp();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("admin_login_attempts").select("id", { count: "exact", head: true }).eq("ip", ip).like("email", "signup:%").gte("at", since);
    if ((count ?? 0) >= 10) return { ok: false, message: "Too many sign-ups from this network. Try again in an hour." };
    await db.from("admin_login_attempts").insert({ email: `signup:${data.email}`, ip, success: true });
    // Addresses reserved for FynHelp's own admins are set up only through the emailed admin invite.
    const { data: reserved } = await db.from("admin_bootstrap_emails").select("email").eq("email", data.email).maybeSingle();
    if (reserved) return { ok: false, message: "We couldn't create your account just now. Try again in a minute." };
    const { error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name, phone: mobile.digits, whatsapp_ok: data.whatsappOk === true, ...(data.lead ? { lead: data.lead } : {}) },
    });
    if (!error) {
      // Tell the FynHelp team. Never blocks or fails the sign-up.
      const { notifyNewSignup } = await import("@/lib/practice/teamNotify.server");
      const { pushLeadToSheet } = await import("@/lib/practice/leadSheet.server");
      await Promise.all([
        notifyNewSignup({ name: data.name, email: data.email, phone: mobile.digits, whatsappOk: data.whatsappOk === true, lead: data.lead, ...(data.attribution ?? {}) }),
        pushLeadToSheet({ type: "signup", name: data.name, email: data.email, phone: mobile.digits, whatsapp_ok: data.whatsappOk === true, ...flatLead(data.lead) }),
      ]);
      return { ok: true, existed: false };
    }
    if (/already|exists|registered/i.test(error.message)) {
      // The browser signs in with the password next; that decides whether it is theirs.
      await db.rpc("confirm_pending_signup", { p_email: data.email });
      return { ok: true, existed: true };
    }
    console.warn("[signup] createUser failed", error.message);
    if (/password/i.test(error.message)) return { ok: false, message: "Use a stronger password of at least 10 characters." };
    return { ok: false, message: "We couldn't create your account just now. Try again in a minute." };
  });

/** Step 1 of WhatsApp verification: sends the code. `required: false` means verification is not switched on yet. */
export const sendSignupCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ phone: z.string().trim().min(1).max(24) }).parse(data))
  .handler(async ({ data }) => {
    const { requestIp } = await import("@/lib/rateLimit.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { sendSignupOtp } = await import("@/lib/practice/signupOtp.server");
    const req = getRequest();
    return sendSignupOtp(data.phone, req ? requestIp(req) : "unknown");
  });

/** Step 2: checks the code and returns the proof that createAccount asks for. */
export const verifySignupCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ phone: z.string().trim().min(1).max(24), code: z.string().trim().min(1).max(12) }).parse(data))
  .handler(async ({ data }) => (await import("@/lib/practice/signupOtp.server")).verifySignupOtp(data.phone, data.code));

/** Confirms an account left waiting for a confirmation link from before sign-up became instant. */
export const confirmPendingAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(data))
  .handler(async ({ data }) => {
    const { adminDb } = await import("@/lib/practice/db.server");
    const db = await adminDb();
    const { data: changed } = await db.rpc("confirm_pending_signup", { p_email: data.email });
    return { confirmed: changed === true };
  });
