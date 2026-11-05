/** The firm's Tally posting pages, shared by Settings and the Tally approval panel. Same pattern as WhatsApp credits. */
import { useEffect, useSyncExternalStore } from "react";
import { getPracticePages } from "@/lib/practice/practice.functions";

export type Pages = Awaited<ReturnType<typeof getPracticePages>>;

let state: Pages | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setPages(p: Pages) {
  state = p;
  emit();
}

export function refreshPages(): Promise<void> {
  if (!inflight)
    inflight = getPracticePages()
      .then(setPages)
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
  return inflight;
}

export function usePages(enabled = true): Pages | null {
  const p = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => null,
  );
  useEffect(() => {
    if (!enabled) return;
    if (!state) void refreshPages();
    const onVis = () => document.visibilityState === "visible" && void refreshPages();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);
  return p;
}
