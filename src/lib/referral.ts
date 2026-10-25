/**
 * Remembers a referral code from a link (?ref=FHXXXXXX) until the visitor creates their firm.
 * Kept in this browser for 90 days; only the code is stored.
 */
import { parseReferralCode } from "./practice/referrals";

const KEY = "fynhelp-referral";
const DAYS = 90;

/** Reads ?ref= from the address and keeps it. A new valid code replaces an older one. */
export function captureReferral(): string | null {
  try {
    const code = parseReferralCode(new URLSearchParams(window.location.search).get("ref"));
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    return code ?? getReferralCode();
  } catch {
    return null;
  }
}

export function getReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (!v.code || !v.at || Date.now() - v.at > DAYS * 86_400_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parseReferralCode(v.code);
  } catch {
    return null;
  }
}

export function clearReferralCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
