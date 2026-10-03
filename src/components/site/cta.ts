/**
 * One place for the site's calls to action, so every page says the same
 * thing and leads to the same place.
 *
 * Primary: "Start free" opens sign-up straight away (no card, no call).
 * Secondary: "Book a demo" opens the booking calendar over the current page.
 */
import { track } from "@/lib/analytics";

export const SIGNUP_URL = "/v2/onboarding?mode=signup";
export const CALENDLY_URL = "https://calendly.com/nidhi-fynhelp/nidhi-meetings";

export const CTA_START = "Start free";
export const CTA_DEMO = "Book a demo";
/** Shown under the main button wherever there is room. */
export const CTA_NOTE = "Free to start · No card needed · Set up in 5 minutes";

/** Sign-up link that carries an email the visitor already typed. */
export function signupUrl(email?: string): string {
  const e = email?.trim();
  return e ? `${SIGNUP_URL}&email=${encodeURIComponent(e)}` : SIGNUP_URL;
}

/** Calendly link with the visitor's name and email filled in. */
export function calendlyUrl(name?: string, email?: string): string {
  const q = new URLSearchParams();
  if (name?.trim()) q.set("name", name.trim());
  if (email?.trim()) q.set("email", email.trim());
  const s = q.toString();
  return s ? `${CALENDLY_URL}?${s}` : CALENDLY_URL;
}

/** Records which button was clicked where, to see what converts. */
export function trackCta(cta: "start" | "demo" | "signin", location: string) {
  try {
    track("cta_click", { cta, location });
  } catch {
    /* analytics must never block a click */
  }
}
