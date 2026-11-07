/**
 * Loading the workspace at start-up. Only the server's own "Create your practice first" means a person has no firm yet.
 * Any other failure (too many requests, a network blip, a server error) is retried, and if it keeps failing it is reported
 * as a failure, so a firm that already exists is never sent to the "Name your firm" step because one lookup failed.
 */

export class WorkspaceUnavailable extends Error {}

export function messageOf(e: unknown): string {
  if (e instanceof Error && typeof e.message === "string" && e.message && e.message !== "[object Object]") return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown; statusText?: unknown };
    for (const v of [o.message, o.error, o.statusText]) {
      if (typeof v === "string" && v) return v;
      if (v && typeof v === "object" && typeof (v as { message?: unknown }).message === "string") return (v as { message: string }).message;
    }
  }
  return "Something went wrong. Please try again.";
}

const PAUSES = [800, 2000, 4500];

/** Resolves the workspace, null when there is truly no firm, or throws Unauthorized (sign in again) / WorkspaceUnavailable (retry screen). */
export async function loadWorkspaceWithRetry<T>(load: () => Promise<T>, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T | null> {
  let last: unknown;
  for (let i = 0; i <= PAUSES.length; i++) {
    try {
      return await load();
    } catch (e) {
      const m = messageOf(e);
      if (/Create your practice first/i.test(m)) return null;
      if (/^Unauthorized\b|jwt|session/i.test(m)) throw e;
      last = e;
      if (i < PAUSES.length) await wait(PAUSES[i]);
    }
  }
  throw new WorkspaceUnavailable(messageOf(last));
}
