/**
 * "Book a demo" as one direct action: the calendar opens over the page the
 * visitor is on. No form, no extra page. If the calendar can't load, it
 * opens in a new tab instead, so the click always does something.
 */
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { CALENDLY_URL, trackCta } from "./cta";
import { track } from "@/lib/analytics";

type CalendlyApi = { initPopupWidget: (o: { url: string }) => void };
declare global {
  interface Window {
    Calendly?: CalendlyApi;
  }
}

let loading: Promise<CalendlyApi> | null = null;
let listening = false;

function loadCalendly(): Promise<CalendlyApi> {
  if (window.Calendly) return Promise.resolve(window.Calendly);
  if (loading) return loading;
  loading = new Promise<CalendlyApi>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://assets.calendly.com/assets/external/widget.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://assets.calendly.com/assets/external/widget.js";
    js.async = true;
    js.onload = () => (window.Calendly ? resolve(window.Calendly) : reject(new Error("no Calendly")));
    js.onerror = () => reject(new Error("Calendly blocked"));
    document.head.appendChild(js);
    setTimeout(() => reject(new Error("Calendly slow")), 5000);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Opens the booking calendar over the current page. */
export function openDemo(location: string) {
  trackCta("demo", location);
  if (!listening) {
    listening = true;
    window.addEventListener("message", (e) => {
      if (e.origin === "https://calendly.com" && e.data?.event === "calendly.event_scheduled") track("demo_requested", { location });
    });
  }
  loadCalendly()
    .then((c) => c.initPopupWidget({ url: `${CALENDLY_URL}?hide_gdpr_banner=1` }))
    .catch(() => window.open(CALENDLY_URL, "_blank", "noopener"));
}

/** A real link (works without scripts or with a middle-click) that opens the calendar in place. */
export function DemoLink({
  location,
  className,
  style,
  children,
}: {
  location: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openDemo(location);
  };
  return (
    <a href={CALENDLY_URL} target="_blank" rel="noreferrer" className={className} style={style} onClick={onClick}>
      {children}
    </a>
  );
}
