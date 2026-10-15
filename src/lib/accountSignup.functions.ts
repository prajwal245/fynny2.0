/**
 * Sign-up without a confirmation email. The account is created already
 * confirmed, and the browser signs in with the same password straight after,
 * so a new firm goes from "Create account" to firm setup in one click.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});

export type CreateAccountResult = { ok: true; existed: boolean } | { ok: false; message: string };

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accountSchema.parse(data))
  .handler(async ({ data }): Promise<CreateAccountResult> => {
    const { checkPassword } = await import("@/lib/passwordPolicy");
    const weak = await checkPassword(data.password, data.email);
    if (weak) return { ok: false, message: weak };
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
      user_metadata: { full_name: data.name },
    });
    if (!error) return { ok: true, existed: false };
    if (/already|exists|registered/i.test(error.message)) {
      // The browser signs in with the password next; that decides whether it is theirs.
      await db.rpc("confirm_pending_signup", { p_email: data.email });
      return { ok: true, existed: true };
    }
    console.warn("[signup] createUser failed", error.message);
    if (/password/i.test(error.message)) return { ok: false, message: "Use a stronger password of at least 10 characters." };
    return { ok: false, message: "We couldn't create your account just now. Try again in a minute." };
  });

/** Confirms an account left waiting for a confirmation link from before sign-up became instant. */
export const confirmPendingAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(data))
  .handler(async ({ data }) => {
    const { adminDb } = await import("@/lib/practice/db.server");
    const db = await adminDb();
    const { data: changed } = await db.rpc("confirm_pending_signup", { p_email: data.email });
    return { confirmed: changed === true };
  });
