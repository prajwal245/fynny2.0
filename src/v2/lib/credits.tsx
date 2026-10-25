/**
 * The firm's WhatsApp credits, shared by the Chaser and Settings. Fetched once per session, and again
 * after a purchase, a setting change or when the tab comes back into view.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getPracticeCredits } from "@/lib/practice/practice.functions";

export type Credits = Awaited<ReturnType<typeof getPracticeCredits>>;

let state: Credits | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setCredits(c: Credits) {
  state = c;
  emit();
}

export function refreshCredits(): Promise<void> {
  if (!inflight)
    inflight = getPracticeCredits()
      .then(setCredits)
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
  return inflight;
}

export function useCredits(enabled = true): Credits | null {
  const c = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => null,
  );
  useEffect(() => {
    if (!enabled) return;
    if (!state) void refreshCredits();
    const onVis = () => document.visibilityState === "visible" && void refreshCredits();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);
  return c;
}
