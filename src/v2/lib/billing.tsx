/**
 * The firm's trial / plan, shared by the banner and Settings. Fetched once per
 * session and again after a payment or when the tab comes back into view.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getPracticeBilling } from "@/lib/practice/practice.functions";

export type Billing = Awaited<ReturnType<typeof getPracticeBilling>>;

let state: Billing | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setBilling(b: Billing) {
  state = b;
  emit();
}

export function refreshBilling(): Promise<void> {
  if (!inflight)
    inflight = getPracticeBilling()
      .then(setBilling)
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
  return inflight;
}

export function useBilling(enabled = true): Billing | null {
  const b = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => null,
  );
  useEffect(() => {
    if (!enabled) return;
    if (!state) void refreshBilling();
    const onVis = () => document.visibilityState === "visible" && void refreshBilling();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled]);
  return b;
}

let rzpScript: Promise<void> | null = null;
/** Razorpay Checkout's script, loaded only when someone pays. */
export function loadRazorpay(): Promise<void> {
  if ((window as { Razorpay?: unknown }).Razorpay) return Promise.resolve();
  if (!rzpScript)
    rzpScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        rzpScript = null;
        reject(new Error("Razorpay could not load. Check your connection and try again."));
      };
      document.head.appendChild(s);
    });
  return rzpScript;
}
