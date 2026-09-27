import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://app.posthog.com";

export function initAnalytics() {
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
  if (!POSTHOG_KEY) return;
  posthog.capture("$pageview", { $current_url: window.location.origin + path, ...properties });
}

export type FynHelpEvent =
  | "waitlist_signup"
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
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { ...properties, timestamp: new Date().toISOString() });
}

export function trackTiming(event: string, durationMs: number, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, { duration_ms: durationMs, ...properties });
}
