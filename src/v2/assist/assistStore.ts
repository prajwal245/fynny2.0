/** Stored choices for the assistant: on or off, the last prompt, and which screens were dismissed. Never throws. */
import {
  FRESH_PREFS,
  mergeConfig,
  type AssistConfig,
  type AssistPrefs,
} from "./assistEngine";

const PREFS_KEY = "fynhelp.assist.v1";
const CONFIG_KEY = "fynhelp.assist.config";
const EVENT = "fynhelp:assist-prefs";

export function loadPrefs(): AssistPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...FRESH_PREFS, screens: {} };
    const p = JSON.parse(raw) as Partial<AssistPrefs>;
    return {
      enabled: p.enabled !== false,
      lastShownAt: typeof p.lastShownAt === "number" ? p.lastShownAt : null,
      screens: p.screens && typeof p.screens === "object" ? p.screens : {},
    };
  } catch {
    return { ...FRESH_PREFS, screens: {} };
  }
}

export function savePrefs(p: AssistPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode: the choice lasts until reload */
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* no window */
  }
}

/** Thresholds can be tuned without a release: set localStorage "fynhelp.assist.config" to a JSON object of overrides. */
export function loadConfig(): AssistConfig {
  try {
    return mergeConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null"));
  } catch {
    return mergeConfig(null);
  }
}

export function setAssistEnabled(enabled: boolean) {
  savePrefs({ ...loadPrefs(), enabled });
}

export const ASSIST_EVENT = EVENT;
