/**
 * Calls into the admin server functions. When the server says the admin
 * session is over (idle 15 minutes, MFA missing, revoked, wrong network),
 * every open admin screen hears it and goes back to sign-in.
 */
export const REAUTH_EVENT = "fh-admin-reauth";

export function adminError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? "");
  if (/^Unauthorized/.test(m)) return "Your session has ended. Sign in again.";
  return m.replace(/^ADMIN_REAUTH:\s*/, "") || "Something went wrong.";
}

/** The server ended the admin session, or the Supabase session itself was revoked. */
export function isReauth(e: unknown): boolean {
  return e instanceof Error && (e.message.startsWith("ADMIN_REAUTH") || /^Unauthorized/.test(e.message));
}

export async function adminCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isReauth(e) && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(REAUTH_EVENT, { detail: adminError(e) }));
    throw e;
  }
}
