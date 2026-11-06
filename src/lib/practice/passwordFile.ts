/**
 * Password-protected PDFs and Excel files: the words used for them, in one place, so the server, the screens and the
 * tests all agree. The password itself is never stored or logged anywhere.
 */

export type ProtectedKind = "PDF" | "Excel file";
export const PASSWORD_MAX = 128;

export const passwordNeededMessage = (what: ProtectedKind) => `This ${what} is password protected. Enter the password to open it.`;
export const passwordWrongMessage = (what: ProtectedKind) => `That password did not open the ${what}. Check it and try again.`;

/** A failed document whose reason is a locked file (so the screen offers a password box, not a generic error). */
export const isPasswordMessage = (message: string | null | undefined): boolean =>
  /password protected\. Enter the password|password did not open/i.test(message ?? "");
/** The last try used a wrong password. */
export const isWrongPasswordMessage = (message: string | null | undefined): boolean => /password did not open/i.test(message ?? "");

/** Reads a typed password for use: only a length check, never trimmed (a password may start or end with a space). */
export function cleanPassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > PASSWORD_MAX) return null;
  return raw;
}
