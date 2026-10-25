/**
 * QA mode: a switch that keeps a browser out of production analytics.
 *
 *   ?utm_source=qa  or  ?debug_mode=true   turns it on (and keeps it on in this browser)
 *   ?debug_mode=false                       turns it off again
 *
 * A signed-in tester account turns it on by itself. In QA mode nothing is sent to Google Analytics or
 * PostHog; events are printed to the browser console instead, so testers can still see what would be tracked.
 */
const KEY = "fynhelp.qa";

export type QaSwitch = "on" | "off" | null;

/** What an address says about QA mode. debug_mode=false wins over everything else. */
export function qaSwitchFromSearch(search: string): QaSwitch {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (q.get("debug_mode") === "false") return "off";
  if (q.get("debug_mode") === "true" || q.get("utm_source")?.toLowerCase() === "qa") return "on";
  return null;
}

export function setQaMode(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: QA lasts for this page only */
  }
}

/** Reads the address and remembers what it asks for. */
export function applyQaFromUrl(): void {
  try {
    const sw = qaSwitchFromSearch(window.location.search);
    if (sw) setQaMode(sw === "on");
  } catch {
    /* no window */
  }
}

export function isQaMode(): boolean {
  try {
    if (qaSwitchFromSearch(window.location.search) === "on") return true;
    if (qaSwitchFromSearch(window.location.search) === "off") return false;
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** The same decision as a script for the page <head>, which runs before the app does and must stop Google's tag too. */
export const qaHeadScript = (gaId: string) =>
  `try{var q=new URLSearchParams(location.search),k='${KEY}';if(q.get('debug_mode')==='false')localStorage.removeItem(k);else if(q.get('debug_mode')==='true'||(q.get('utm_source')||'').toLowerCase()==='qa')localStorage.setItem(k,'1');if(localStorage.getItem(k)==='1')window['ga-disable-${gaId}']=true;}catch(e){}`;
