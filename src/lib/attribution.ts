/**
 * First-touch attribution, kept with the firm at sign-up.
 *
 * The first time a visitor lands (campaign tags or not) we note where they came from and keep it for 90 days.
 * It is never overwritten, so the first source gets the credit even if they return later by another route.
 * Only campaign tags, the landing path and the referring site's host are stored: no personal data.
 * QA mode (testers, staff) is never recorded, so test visits cannot pollute the numbers.
 */
import { getAttribution } from "./utm";
import { isQaMode } from "./qa";

const KEY = "fynhelp-first-touch";
const DAYS = 90;

export const CHANNELS = ["paid-search", "paid-social", "organic-search", "organic-social", "email", "referral", "direct", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface FirstTouch {
  channel: Channel;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landing?: string;
  referrerHost?: string;
  at: string;
}

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave)\./i;
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|lnkd|t\.co|twitter|x\.com|youtube|youtu|whatsapp|wa\.me|reddit|quora|telegram|t\.me|threads)\b/i;
const MAIL = /(^|\.)(mail\.google|outlook|mail\.yahoo)\./i;

const clean = (v: string | null | undefined, n = 100) => (v ? v.trim().toLowerCase().slice(0, n) : undefined) || undefined;

/** The channel a visit belongs to, from campaign tags first, then click ids, then the referring site. */
export function classifyChannel(i: { source?: string; medium?: string; gclid?: string; fbclid?: string; referrerHost?: string; ownHost?: string }): Channel {
  const medium = clean(i.medium) ?? "";
  const source = clean(i.source) ?? "";
  const paid = /(^|[-_ ])(cpc|ppc|paid|paidsocial|paid[-_]?social|display|ads?)([-_ ]|$)/.test(medium) || medium === "cpc";
  if (medium || source) {
    if (/email|newsletter|mail/.test(medium)) return "email";
    if (paid || medium === "paid_social" || medium === "paid-social") return SOCIAL.test(source + ".") || /meta|facebook|instagram|linkedin|youtube|twitter/.test(source) ? "paid-social" : "paid-search";
    if (/social/.test(medium)) return "organic-social";
    if (/organic|seo/.test(medium)) return "organic-search";
    if (/referral|group|qr|affiliate/.test(medium)) return "referral";
    if (medium === "direct" || medium === "none") return "direct";
    return "other";
  }
  if (i.gclid) return "paid-search";
  if (i.fbclid) return "paid-social";
  const host = clean(i.referrerHost);
  if (!host || (i.ownHost && host.endsWith(i.ownHost.replace(/^www\./, "")))) return "direct";
  if (SEARCH.test(host)) return "organic-search";
  if (SOCIAL.test(host)) return "organic-social";
  if (MAIL.test(host)) return "email";
  return "referral";
}

/** Called on every page load; stores only the first visit. */
export function captureFirstTouch(): FirstTouch | null {
  try {
    if (isQaMode()) return null;
    const existing = getFirstTouch();
    if (existing) return existing;
    const p = new URLSearchParams(window.location.search);
    let referrerHost: string | undefined;
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : undefined;
    } catch {
      referrerHost = undefined;
    }
    const t: FirstTouch = {
      channel: classifyChannel({
        source: p.get("utm_source") ?? undefined,
        medium: p.get("utm_medium") ?? undefined,
        gclid: p.get("gclid") ?? undefined,
        fbclid: p.get("fbclid") ?? undefined,
        referrerHost,
        ownHost: window.location.hostname,
      }),
      source: clean(p.get("utm_source")),
      medium: clean(p.get("utm_medium")),
      campaign: clean(p.get("utm_campaign")),
      content: clean(p.get("utm_content")),
      term: clean(p.get("utm_term")),
      landing: window.location.pathname.slice(0, 200),
      referrerHost: referrerHost && referrerHost !== window.location.hostname ? referrerHost.slice(0, 100) : undefined,
      at: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(t));
    return t;
  } catch {
    return null;
  }
}

export function getFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as FirstTouch;
    if (!t.at || Date.now() - new Date(t.at).getTime() > DAYS * 86_400_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

/** What goes to the server with the new firm. Falls back to the saved campaign tags for visitors from before first-touch existed. */
export function signupAttribution(): Omit<FirstTouch, "at"> | undefined {
  if (isQaMode()) return undefined;
  const t = getFirstTouch();
  if (t) {
    const { at: _at, ...rest } = t;
    return rest;
  }
  const a = getAttribution();
  if (a.utm_source || a.utm_medium) {
    return {
      channel: classifyChannel({ source: a.utm_source, medium: a.utm_medium, gclid: a.gclid, fbclid: a.fbclid }),
      source: clean(a.utm_source), medium: clean(a.utm_medium), campaign: clean(a.utm_campaign), content: clean(a.utm_content), term: clean(a.utm_term), landing: a.landing_page,
    };
  }
  return undefined;
}
