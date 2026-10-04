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
  password: z.string().min(6).max(72),
});

export type CreateAccountResult = { ok: true; existed: boolean } | { ok: false; message: string };

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accountSchema.parse(data))
  .handler(async ({ data }): Promise<CreateAccountResult> => {
    const { adminDb } = await import("@/lib/practice/db.server");
    const db = await adminDb();
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
    if (/password/i.test(error.message)) return { ok: false, message: "Use a stronger password of at least six characters." };
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
