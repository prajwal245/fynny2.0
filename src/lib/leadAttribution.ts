/**
 * Campaign attribution for every sign-up and demo, following the naming rules in docs/ATTRIBUTION_SETUP.md.
 *
 * On a visit that carries campaign tags we keep the FIRST click (never overwritten, 90 days) and the LAST click
 * (replaced by each newer tagged visit). Tags are tidied on the way in (lower case, underscores, no special
 * characters) so "Reel 1 / Still Manual" and "reel_1_still_manual" cannot split a report into two rows.
 * Click ids (gclid, fbclid) are kept exactly as received.
 *
 * Same storage keys and shape as the Tag Manager snippet in the playbook, so the two never disagree.
 * Nothing here is personal data. QA mode (testers, staff) is never recorded.
 */
import { isQaMode } from "./qa";

export const LEAD_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "gclid", "fbclid"] as const;
export type LeadKey = (typeof LEAD_KEYS)[number];

export type Touch = Partial<Record<LeadKey, string>> & { landing?: string; ts?: number };
export interface LeadAttribution {
  first: Touch;
  last: Touch;
}

const FIRST = "fh_first";
const LAST = "fh_last";
const DAYS = 90;
const CLICK_IDS: LeadKey[] = ["gclid", "fbclid"];

/** lower case, underscores for spaces, only a-z 0-9 _ - . kept */
export function tidyTag(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[\s+]+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}

/** The tags found in an address's query string, tidied. Empty when there are none. */
export function readTags(search: string): Touch {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Touch = {};
  for (const k of LEAD_KEYS) {
    const raw = q.get(k);
    if (!raw) continue;
    const v = CLICK_IDS.includes(k) ? raw.trim().slice(0, 200) : tidyTag(raw);
    if (v) out[k] = v;
  }
  return out;
}

const read = (key: string): Touch => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Touch) : {};
  } catch {
    return {};
  }
};

/** Called on every page load. Stores the visit only if it carries campaign tags. */
export function captureLeadAttribution(now = Date.now()): LeadAttribution {
  try {
    if (isQaMode()) return { first: {}, last: {} };
    const seen = readTags(window.location.search);
    let first = read(FIRST);
    if (first.ts && now - first.ts > DAYS * 86_400_000) {
      localStorage.removeItem(FIRST);
      first = {};
    }
    let last = read(LAST);
    if (last.ts && now - last.ts > DAYS * 86_400_000) {
      localStorage.removeItem(LAST);
      last = {};
    }
    if (Object.keys(seen).length) {
      const touch: Touch = { ...seen, landing: window.location.pathname.slice(0, 200), ts: now };
      if (!first.ts) {
        localStorage.setItem(FIRST, JSON.stringify(touch));
        first = touch;
      }
      localStorage.setItem(LAST, JSON.stringify(touch));
      last = touch;
    }
    return { first, last };
  } catch {
    return { first: {}, last: {} };
  }
}

export function getLeadAttribution(): LeadAttribution {
  if (typeof window === "undefined" || isQaMode()) return { first: {}, last: {} };
  return { first: read(FIRST), last: read(LAST) };
}

/** Flat fields, named as in the playbook's hidden form fields (first_utm_source ... last_gclid). */
export function leadFields(a: LeadAttribution = getLeadAttribution()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of LEAD_KEYS) {
    out[`first_${k}`] = a.first[k] ?? "";
    out[`last_${k}`] = a.last[k] ?? "";
  }
  out["first_landing"] = a.first.landing ?? "";
  out["last_landing"] = a.last.landing ?? "";
  return out;
}

/** The last click's tags, in the shape Calendly's widget takes, so a booked demo carries its campaign. */
export function calendlyUtm(a: LeadAttribution = getLeadAttribution()): Record<string, string> {
  const l = a.last.utm_source || a.last.utm_campaign ? a.last : a.first;
  const out: Record<string, string> = {};
  if (l.utm_source) out["utmSource"] = l.utm_source;
  if (l.utm_medium) out["utmMedium"] = l.utm_medium;
  if (l.utm_campaign) out["utmCampaign"] = l.utm_campaign;
  if (l.utm_content) out["utmContent"] = l.utm_content;
  if (l.utm_term) out["utmTerm"] = l.utm_term;
  return out;
}
