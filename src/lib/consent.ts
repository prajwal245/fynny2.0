/**
 * Cookie consent. Strictly necessary storage (sign-in, security) is always on.
 * Analytics (Google Analytics 4, PostHog) loads only after the visitor agrees,
 * and stops again if they withdraw. The choice lives in this browser only.
 */
export interface Consent {
  v: 1;
  analytics: boolean;
  at: string;
}

/** Google Analytics 4 property for www.fynhelp.com (public, appears in every page). */
export const GA_MEASUREMENT_ID = "G-GEZMCK8JYS";

const KEY = "fynhelp.consent";
export const OPEN_SETTINGS_EVENT = "fh-open-cookie-settings";
const CHANGED_EVENT = "fh-consent-changed";

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    return c && c.v === 1 && typeof c.analytics === "boolean" ? c : null;
  } catch {
    return null;
  }
}

export function saveConsent(analytics: boolean): Consent {
  const c: Consent = { v: 1, analytics, at: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* remembered for this page view only */
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: c }));
  return c;
}

export function onConsentChange(fn: (c: Consent) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<Consent>).detail);
  window.addEventListener(CHANGED_EVENT, h);
  return () => window.removeEventListener(CHANGED_EVENT, h);
}

export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}

export const analyticsAllowed = () => readConsent()?.analytics === true;
