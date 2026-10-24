/**
 * Pure parts of the Tally connection: the connector's token, which months to pull, and a
 * cheap check that a Day Book really contains vouchers. Tested without a database.
 */

export const TOKEN_PREFIX = "fyn_tc_";

/** A new connector secret: shown once, only its hash is stored. */
export function newConnectorToken(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return TOKEN_PREFIX + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const looksLikeToken = (t: string | null | undefined): t is string => /^fyn_tc_[A-Za-z0-9_-]{40,60}$/.test(t ?? "");

export async function hashToken(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const bearerOf = (header: string | null | undefined): string | null => {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
};

const shift = (month: string, d: number) => {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + d;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};

/**
 * Months the connector should send. A company never synced gets the last few months so Recon
 * has something to work on at once; after that the current and previous month are refreshed
 * (late entries and back-dated vouchers land in the previous month).
 */
export function monthsToPull(lastSyncedAt: string | null, now: Date = new Date(), backfill = 3): string[] {
  const cur = now.toISOString().slice(0, 7);
  const back = lastSyncedAt ? 1 : Math.max(1, backfill);
  return Array.from({ length: back + 1 }, (_, i) => shift(cur, -(back - i)));
}

export const validMonth = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** Number of vouchers in a Tally export, without parsing the whole file. */
export function voucherCount(xml: string): number {
  return (xml.match(/<VOUCHER[\s>]/g) ?? []).length;
}

/** Clean company names from the connector: trimmed, unique, bounded. */
export function cleanCompanyNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const n = v.replace(/\s+/g, " ").trim();
    if (n && n.length <= 200) out.add(n);
    if (out.size >= 200) break;
  }
  return [...out];
}

/** "Online" while the connector has checked in recently. */
export const connectorOnline = (lastSeenAt: string | null | undefined, now: Date = new Date(), minutes = 15): boolean =>
  Boolean(lastSeenAt) && now.getTime() - Date.parse(lastSeenAt!) < minutes * 60_000;
