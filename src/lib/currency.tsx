/**
 * ₹ / $ display on the website. Prices are set in rupees (GST included) and
 * charged in rupees through Razorpay; dollars are a guide for visitors abroad.
 */
import { useSyncExternalStore } from "react";

export type Currency = "INR" | "USD";

/** Rupees per US dollar used for the $ guide prices. */
export const INR_PER_USD = 84;

const KEY = "fynhelp.currency";
let current: Currency = "INR";
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    if (window.localStorage.getItem(KEY) === "USD") current = "USD";
  } catch {
    /* storage blocked: stay on ₹ */
  }
}

export function setCurrency(c: Currency) {
  current = c;
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    /* not remembered, still switched */
  }
  subs.forEach((f) => f());
}

export function useCurrency(): Currency {
  return useSyncExternalStore(
    (f) => {
      load();
      subs.add(f);
      if (current === "USD") queueMicrotask(f);
      return () => subs.delete(f);
    },
    () => current,
    () => "INR",
  );
}

/** A rupee amount shown in the chosen currency. */
export function money(inr: number, c: Currency): string {
  if (c === "INR") return `₹${Math.round(inr).toLocaleString("en-IN")}`;
  const usd = inr / INR_PER_USD;
  return usd >= 10 ? `$${Math.round(usd).toLocaleString("en-US")}` : `$${usd.toFixed(2)}`;
}

/** Every "₹1,234" inside a sentence, shown in the chosen currency. */
export function localize(text: string, c: Currency): string {
  if (c === "INR") return text;
  return text.replace(/₹\s?([\d,]+(?:\.\d+)?)/g, (_m, n: string) => money(Number(n.replace(/,/g, "")), c));
}

export function CurrencySwitch({ className, value }: { className?: string; value: Currency }) {
  return (
    <div className={className} role="group" aria-label="Currency">
      {(["INR", "USD"] as Currency[]).map((c) => (
        <button key={c} type="button" className={value === c ? "on" : ""} aria-pressed={value === c} onClick={() => setCurrency(c)} data-testid={`currency-${c}`}>
          {c === "INR" ? "₹ INR" : "$ USD"}
        </button>
      ))}
    </div>
  );
}
