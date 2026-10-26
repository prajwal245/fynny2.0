/**
 * Mobile numbers collected at sign-up. Pure, so the form and the server agree on what is valid.
 * A 10-digit Indian mobile (starts 6 to 9) is accepted as typed; anything longer must carry its country code.
 */
export interface Mobile {
  /** Digits only, with the country code: 919820011223. This is what is stored and used for WhatsApp. */
  digits: string;
  /** For people: +91 98200 11223. */
  display: string;
}

export function parseMobile(raw: string | null | undefined, defaultCc = "91"): Mobile | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const hasPlus = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/\D/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!hasPlus && d.startsWith("0")) d = d.replace(/^0+/, ""); // trunk prefix: 098200 11223
  if (!d) return null;
  // Local number: add the firm's country.
  if (!hasPlus && d.length === 10) d = defaultCc + d;
  // India: 91 + a 10-digit mobile starting 6 to 9 (also when typed with 91 and no plus).
  if (d.startsWith("91") && d.length === 12) return /^[6-9]\d{9}$/.test(d.slice(2)) ? { digits: d, display: `+91 ${d.slice(2, 7)} ${d.slice(7)}` } : null;
  // Other countries must say so with a "+" (or 00): 8 to 15 digits in all, not starting with 0.
  if (!hasPlus) return null;
  if (d.length < 8 || d.length > 15 || d.startsWith("0") || d.startsWith("91")) return null;
  return { digits: d, display: `+${d}` };
}

export const MOBILE_HINT = "10-digit mobile, for example 98200 11223. Add +country code for numbers outside India.";
