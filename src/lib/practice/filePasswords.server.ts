/**
 * Passwords of locked files (a bank statement PDF a client protected). Kept encrypted so the firm can open the original and FynHelp
 * can read the file again without asking the client twice. Reading one back is a logged action for a partner or manager.
 * Every function degrades to "no password saved" when the table or the encryption key is missing, so uploads never fail because of it.
 */
import type { Db } from "./db.server";

export async function saveFilePassword(db: Db, firmId: string, extractionId: string, password: string, via = "upload_link"): Promise<boolean> {
  try {
    const { encryptToken } = await import("@/lib/caGmail.server");
    const password_enc = await encryptToken(password);
    const { error } = await db.from("ca_file_passwords").upsert({ extraction_id: extractionId, ca_firm_id: firmId, password_enc, created_via: via }, { onConflict: "extraction_id" });
    return !error;
  } catch {
    return false;
  }
}

/** The saved password of a document, or null. For the server only: never sent to a screen except through revealFilePassword. */
export async function getFilePassword(db: Db, extractionId: string): Promise<string | null> {
  try {
    const { data } = await db.from("ca_file_passwords").select("password_enc").eq("extraction_id", extractionId).maybeSingle();
    if (!data?.password_enc) return null;
    const { decryptToken } = await import("@/lib/caGmail.server");
    return await decryptToken(String(data.password_enc));
  } catch {
    return null;
  }
}

/** Which of these documents have a saved password (for a small "password saved" mark; never the password). */
export async function documentsWithPassword(db: Db, firmId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const { data } = await db.from("ca_file_passwords").select("extraction_id").eq("ca_firm_id", firmId).in("extraction_id", ids.slice(0, 500));
    return new Set(((data ?? []) as { extraction_id: string }[]).map((r) => r.extraction_id));
  } catch {
    return new Set();
  }
}
