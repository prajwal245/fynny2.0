/**
 * The ICAI membership number asked for at sign-up, to keep out people who are not chartered accountants.
 * Format check only: ICAI has no public lookup FynHelp can call, so a person at FynHelp can check the number
 * against ICAI's member search from the admin firm drawer. Membership numbers are 5 or 6 digits.
 */
export function cleanIcai(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/[\s-]/g, "").replace(/^(m\.?no\.?|mrn|icai)[:.]?/i, "");
  if (!/^\d{5,6}$/.test(d)) return null;
  // 000000, 111111, 123456 and 654321 are not real members.
  if (/^(\d)\1+$/.test(d) || "0123456789".includes(d) || "9876543210".includes(d)) return null;
  return d;
}

export const ICAI_HINT = "5 or 6 digits, as on your ICAI membership card, for example 245981.";

/** Firm names that no real practice uses ("test", "abc", "xx"). */
export function cleanFirmName(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 3 || s.length > 120) return null;
  if (/^(test|testing|abc|abcd|xyz|asdf|qwerty|na|n\/a|none|firm|my firm|demo)$/i.test(s)) return null;
  if (!/[a-z]/i.test(s)) return null;
  return s;
}
