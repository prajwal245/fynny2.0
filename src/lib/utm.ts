const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ref"] as const;
const STORAGE_KEY = "fynhelp-attribution";

export type Attribution = Partial<Record<(typeof KEYS)[number], string>> & {
  landing_page?: string;
  referrer?: string;
  captured_at?: string;
};

/** Captures campaign params on first landing and keeps them for the session. */
export function captureUtm(): Attribution {
  try {
    const existing = getAttribution();
    const params = new URLSearchParams(window.location.search);
    const found: Attribution = {};
    KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) found[k] = v.slice(0, 200);
    });

    if (Object.keys(found).length === 0) return existing;

    const attribution: Attribution = {
      ...found,
      landing_page: window.location.pathname,
      referrer: document.referrer || undefined,
      captured_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return {};
  }
}

export function getAttribution(): Attribution {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}
