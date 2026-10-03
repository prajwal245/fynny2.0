import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://app.posthog.com";
/** GA4 measurement ID (G-XXXXXXX). Unset = GA4 off. */
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** GA4 conversion names for our events (the rest are sent as they are). */
const GA_EVENT: Partial<Record<string, string>> = {
  demo_requested: "generate_lead",
  sign_up: "sign_up",
  onboarding_completed: "tutorial_complete",
};

/**
 * GA4, loaded after the page has finished loading so it never competes with
 * first paint. Page views are sent by trackPageView on every route change.
 */
function initGA() {
  if (!GA_ID || typeof window === "undefined" || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
  const load = () => {
    const sc = document.createElement("script");
    sc.async = true;
    sc.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(sc);
  };
  if (document.readyState === "complete") setTimeout(load, 1200);
  else window.addEventListener("load", () => setTimeout(load, 1200), { once: true });
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

export function initAnalytics() {
  initGA();
  if (!POSTHOG_KEY) return;
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
  const search = safeSearch(properties?.search as string | undefined);
  if (window.gtag && GA_ID) {
    window.gtag("event", "page_view", {
      page_location: window.location.origin + path + search,
      page_path: path,
      page_title: document.title,
    });
  }
  if (!POSTHOG_KEY) return;
  posthog.capture("$pageview", { $current_url: window.location.origin + path + search, ...properties, search });
}

export type FynHelpEvent =
  | "waitlist_signup"
  | "cta_click"
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

export function track(event: FynHelpEvent, properties?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.gtag && GA_ID) window.gtag("event", GA_EVENT[event] ?? event, properties ?? {});
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { ...properties, timestamp: new Date().toISOString() });
}

export function trackTiming(event: string, durationMs: number, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { duration_ms: durationMs, ...properties });
}
