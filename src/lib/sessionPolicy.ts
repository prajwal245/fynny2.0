/**
 * "Remember me" enforcement.
 *
 * When the user signs in WITHOUT "Remember me", we don't just set a flag that
 * the app checks later — we make the browser itself drop the credential:
 * the Supabase auth token is purged from localStorage when the page is being
 * unloaded/hidden, so nothing survives closing the tab or the browser.
 * The in-memory session keeps the current tab working until it is closed.
 *
 * Note: this is a client-side convenience for the user's own device. Server
 * side, session lifetime is governed by the backend's JWT/refresh settings.
 */

const SESSION_ONLY_KEY = "fyn.sessionOnly";

const authTokenKeys = (): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("sb-") && k.includes("-auth-token")) keys.push(k);
  }
  return keys;
};

export const isSessionOnly = (): boolean =>
  sessionStorage.getItem(SESSION_ONLY_KEY) === "1" ||
  localStorage.getItem(SESSION_ONLY_KEY) === "1";

/** Call right before signing in. `remember === false` => ephemeral session. */
export const setRememberMe = (remember: boolean) => {
  console.log(`[fyn:auth] remember me set to ${remember}`);
  if (remember) {
    sessionStorage.removeItem(SESSION_ONLY_KEY);
    localStorage.removeItem(SESSION_ONLY_KEY);
  } else {
    // Kept in both: sessionStorage survives reloads in this tab, localStorage
    // lets a fresh browser session detect and clean up a leftover token.
    sessionStorage.setItem(SESSION_ONLY_KEY, "1");
    localStorage.setItem(SESSION_ONLY_KEY, "1");
  }
};

/** Initial checkbox state: remembered unless a session-only flag exists. */
export const getRememberMe = (): boolean => !isSessionOnly();

export const clearRememberMeFlags = () => {
  sessionStorage.removeItem(SESSION_ONLY_KEY);
  localStorage.removeItem(SESSION_ONLY_KEY);
};

/** Purge persisted auth tokens (used on unload for ephemeral sessions). */
export const purgePersistedAuthTokens = () => {
  authTokenKeys().forEach((k) => localStorage.removeItem(k));
};

/**
 * Installs the unload guard. Returns a cleanup function.
 * Idempotent enough to be called once from AuthProvider.
 */
export const installEphemeralSessionGuard = (): (() => void) => {
  const onLeave = () => {
    if (isSessionOnly()) purgePersistedAuthTokens();
  };
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("beforeunload", onLeave);
  return () => {
    window.removeEventListener("pagehide", onLeave);
    window.removeEventListener("beforeunload", onLeave);
  };
};
