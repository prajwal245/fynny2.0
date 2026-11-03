import posthog from "posthog-js";
import { analyticsAllowed, GA_MEASUREMENT_ID, marketingAllowed, onConsentChange } from "./consent";
import { campaignParams } from "./utm";
import { applyQaFromUrl, isQaMode } from "./qa";

// PostHog project keys are public (they ship in every browser bundle); env overrides.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "phc_nLJ4KcJAWuV43cBi43Bqez9YBo2zB6RvC4SvVFXyuDSR";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
/** GA4 measurement ID (G-XXXXXXX). Unset = GA4 off. */
const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || GA_MEASUREMENT_ID;

/** Meta Pixel (Facebook and Instagram ads), loaded only with the visitor's advertising consent. One pixel for the whole product. */
export const META_PIXEL_ID = "2251839838719101";

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; disablePushState?: boolean };
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let pixelLoaded = false;
let pixelPagesSeen = 0;

/**
 * Whether a screen may be counted as a page view: the public website and the web app, but not a screen whose
 * address names one client or record (an id), nor admin, CA portal, shared links or dashboards.
 */
export function countsAsPageView(path: string): boolean {
  if (/^\/(admin|ca|dashboard|u|shared)(\/|$)/.test(path)) return false;
  if (/^\/app(\/|$)/.test(path)) return !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(path);
  return true;
}

function pageViewFor(path: string) {
  if (window.fbq && countsAsPageView(path)) window.fbq("track", "PageView");
}

/** Meta's own loader, started only after consent. Standard events only; no personal data is sent. */
function loadMetaPixel() {
  if (typeof window === "undefined" || pixelLoaded) return;
  pixelLoaded = true;
  if (!window.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else (n.queue as unknown[]).push(args);
    } as Fbq;
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = document.createElement("script");
    t.async = true;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(t);
  }
  // Meta's automatic tracking (route changes, button clicks, page metadata) is off: page views are sent below,
  // for the website and web app screens that do not name a record, and conversions are sent by name.
  window.fbq.disablePushState = true;
  window.fbq("set", "autoConfig", false, META_PIXEL_ID);
  window.fbq("consent", "grant");
  window.fbq("init", META_PIXEL_ID);
  pageViewFor(window.location.pathname);
}

/** Starts or stops the pixel to match the visitor's current advertising choice. */
export function syncMetaPixel() {
  if (typeof window === "undefined" || isQaMode()) return;
  if (marketingAllowed()) {
    if (pixelLoaded && window.fbq) window.fbq("consent", "grant");
    else loadMetaPixel();
    return;
  }
  if (pixelLoaded && window.fbq) window.fbq("consent", "revoke");
  // Remove the pixel's cookies on this site.
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name && /^_fb[pc]$/.test(name)) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

/** Our conversions in Meta's standard event names. */
const META_EVENT: Partial<Record<string, string>> = {
  sign_up: "CompleteRegistration",
  demo_requested: "Lead",
  waitlist_signup: "Lead",
  subscription_upgraded: "Subscribe",
};

/** GA4 conversion names for our events (the rest are sent as they are). */
const GA_EVENT: Partial<Record<string, string>> = {
  demo_requested: "generate_lead",
  sign_up: "sign_up",
  onboarding_completed: "tutorial_complete",
};

/**
 * GA4: the Google tag itself is in every page's <head> (see __root.tsx) with
 * Consent Mode set to denied. Consent only switches analytics storage on.
 */
function initGA() {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("consent", "update", { analytics_storage: "granted" });
}

/** Only campaign tags are kept: emails and other personal data never leave in URLs. */
function safeSearch(search: string | undefined): string {
  if (!search) return "";
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const keep = new URLSearchParams();
  q.forEach((v, k) => {
    if (/^utm_|^gclid$|^fbclid$/.test(k)) keep.set(k, v);
  });
  const out = keep.toString();
  return out ? `?${out}` : "";
}

let started = false;
let watching = false;

/** Starts analytics only with the visitor's consent, and follows later changes of mind. */
export function initAnalytics() {
  applyQaFromUrl();
  // QA mode and tester accounts stay out of production analytics entirely.
  if (isQaMode()) return;
  if (!watching && typeof window !== "undefined") {
    watching = true;
    onConsentChange((c) => {
      if (c.analytics) initAnalytics();
      else stopAnalytics();
      syncMetaPixel();
    });
  }
  syncMetaPixel();
  if (!analyticsAllowed() || started) return;
  started = true;
  initGA();
  if (!POSTHOG_KEY) return;
  if (posthog.__loaded) {
    posthog.opt_in_capturing();
    return;
  }
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true, email: false },
    },
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.opt_out_capturing();
    },
  });
}

export function identifyUser(userId: string, properties?: {
  email?: string;
  name?: string;
  plan?: string;
  businessId?: string;
  role?: string;
}) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, {
    email: properties?.email,
    name: properties?.name,
    plan: properties?.plan ?? "free",
    business_id: properties?.businessId,
    role: properties?.role ?? "owner",
    product: "fynhelp",
    region: "India",
  });
}

export function resetAnalytics() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}

export function trackPageView(path: string, properties?: Record<string, unknown>) {
  if (isQaMode()) return;
  const search = safeSearch(properties?.search as string | undefined);
  // Meta Pixel counts the first page itself on load; later route changes are told here.
  if (pixelLoaded && marketingAllowed() && window.fbq && pixelPagesSeen++ > 0) pageViewFor(path);
  // GA4 counts route changes itself (enhanced measurement, browser history), so only PostHog is told here.
  if (!POSTHOG_KEY) return;
  posthog.capture("$pageview", { $current_url: window.location.origin + path + search, ...properties, search });
}

export type FynHelpEvent =
  | "waitlist_signup"
  | "cta_click"
  | "launch_cta_trial_click"
  | "launch_cta_demo_click"
  | "launch_announcement_dismissed"
  | "demo_requested"
  | "sign_up"
  | "demo_started"
  | "demo_data_uploaded"
  | "dashboard_viewed"
  | "intelligence_tab_viewed"
  | "csv_import_started"
  | "csv_import_completed"
  | "csv_import_failed"
  | "ai_cfo_query_sent"
  | "ai_cfo_query_received"
  | "report_generated"
  | "report_downloaded"
  | "ca_login"
  | "ca_client_added"
  | "ca_bulk_filing_started"
  | "ca_gstr2b_uploaded"
  | "gst_filing_marked_filed"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "integration_connected"
  | "subscription_upgraded"
  | "feature_blocked_upgrade_shown";

/** Conversions that carry the visitor's campaign tags (utm_source, utm_medium, utm_campaign, utm_content, utm_term). */
export const ATTRIBUTED_EVENTS: readonly FynHelpEvent[] = [
  "sign_up",
  "demo_requested",
  "waitlist_signup",
  "cta_click",
  "launch_cta_trial_click",
  "launch_cta_demo_click",
  "onboarding_completed",
  "subscription_upgraded",
];

/** An event's properties with the visitor's campaign tags added when the event is a conversion. */
export function withCampaign(event: FynHelpEvent, properties?: Record<string, unknown>): Record<string, unknown> {
  if (!ATTRIBUTED_EVENTS.includes(event)) return properties ?? {};
  // Tags captured at the visitor's landing; anything the caller passes wins.
  return { ...campaignParams(), ...properties };
}

export function track(event: FynHelpEvent, properties?: Record<string, unknown>) {
  const props = withCampaign(event, properties);
  if (isQaMode()) {
    // Visible to the tester, invisible to production reports.
    console.debug("[qa] event not sent:", event, props);
    return;
  }
  if (typeof window !== "undefined" && window.gtag && GA_ID) window.gtag("event", GA_EVENT[event] ?? event, props);
  if (pixelLoaded && marketingAllowed() && window.fbq && META_EVENT[event]) window.fbq("track", META_EVENT[event]);
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { ...props, timestamp: new Date().toISOString() });
}

export function trackTiming(event: string, durationMs: number, properties?: Record<string, unknown>) {
  if (isQaMode()) return;
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { duration_ms: durationMs, ...properties });
}

/** Consent withdrawn: stop sending, and clear the analytics cookies already set. */
export function stopAnalytics() {
  started = false;
  if (typeof window === "undefined") return;
  if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
  if (posthog.__loaded) posthog.opt_out_capturing();
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (!name || !/^(_ga|_gid|_gat|ph_)/.test(name)) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
  }
}
