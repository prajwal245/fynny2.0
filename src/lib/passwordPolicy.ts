/**
 * One password rule for every place a password is chosen: sign-up, reset and
 * the admin settings. At least 10 characters, not a well-known password, not
 * the email name, and not in a known breach (HaveIBeenPwned range API: only
 * the first five characters of the SHA-1 hash leave this machine).
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters`;

const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "1234567890", "12345678910", "0123456789", "qwertyuiop", "qwerty123", "qwerty1234", "1q2w3e4r5t", "1qaz2wsx3edc",
  "iloveyou123", "welcome123", "welcome@123", "admin12345", "administrator", "letmein123", "abc1234567",
  "india12345", "india@123", "fynhelp123", "fynhelp@123", "changeme123", "sunshine123", "princess123",
]);

/** A reason the password is too weak, or null when it passes the local checks. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > 72) return "Use at most 72 characters.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Choose another.";
  if (/^(.)\1+$/.test(password)) return "Avoid a single repeated character.";
  const name = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 4 && lower.includes(name)) return "Don't use your email name in the password.";
  return null;
}

async function sha1Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * How many times the password appears in known breaches; 0 if none, or if the
 * check could not run (it never blocks sign-up because a service is down).
 */
export async function breachCount(password: string, timeoutMs = 3000): Promise<number> {
  try {
    const hash = await sha1Hex(password);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return 0;
    const suffix = hash.slice(5);
    for (const line of (await res.text()).split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Local checks plus the breach check. */
export async function checkPassword(password: string, email?: string | null): Promise<string | null> {
  const local = passwordProblem(password, email);
  if (local) return local;
  if ((await breachCount(password)) > 0) return "That password has appeared in a data breach. Choose a different one.";
  return null;
}
