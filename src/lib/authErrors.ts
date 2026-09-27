/**
 * Maps provider auth errors to copy that never reveals whether an account
 * exists (prevents user enumeration).
 */
const GENERIC_CREDENTIALS = "Email or password is incorrect.";
const GENERIC_SIGNUP = "We couldn't complete sign-up. Check your details and try again.";
const GENERIC_RESET = "If an account exists for that email, a reset link is on its way.";

export function authErrorMessage(raw?: string | null, context: "signin" | "signup" | "reset" = "signin"): string {
  const m = (raw ?? "").toLowerCase();

  if (m.includes("email not confirmed")) return "Please confirm your email address, then sign in.";
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
  if (m.includes("captcha")) return "Captcha verification failed. Please try again.";
  if (m.includes("network") || m.includes("fetch")) return "Network problem. Check your connection and try again.";
  if (m.includes("password should be") || m.includes("weak")) return "Choose a stronger password (at least 8 characters).";

  if (context === "reset") return GENERIC_RESET;
  if (context === "signup") {
    // "User already registered" / "not found" style responses leak account existence.
    if (m.includes("already registered") || m.includes("already exists") || m.includes("not found")) return GENERIC_SIGNUP;
    return raw?.trim() ? GENERIC_SIGNUP : GENERIC_SIGNUP;
  }
  return GENERIC_CREDENTIALS;
}

export const RESET_CONFIRMATION = GENERIC_RESET;
