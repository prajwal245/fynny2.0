/**
 * The launch offer code. Anyone who lands on the launch page keeps the code in this browser for 30 days, and the
 * sign-up applies it when their firm is created, so nobody has to type or remember it.
 */
export const LAUNCH_CODE = "FYNLAUNCH30";
export const LAUNCH_DAYS = 30;
const KEY = "fynhelp-launch-code";
const KEEP_DAYS = 30;

/** Remembers the code. Also reads ?code= from the address, for links shared elsewhere. */
export function captureLaunchCode(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase();
    if (fromUrl === LAUNCH_CODE) localStorage.setItem(KEY, JSON.stringify({ code: LAUNCH_CODE, at: Date.now() }));
    return getLaunchCode();
  } catch {
    return null;
  }
}

export function getLaunchCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (v.code !== LAUNCH_CODE || !v.at || Date.now() - v.at > KEEP_DAYS * 86_400_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return LAUNCH_CODE;
  } catch {
    return null;
  }
}

export function clearLaunchCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
