import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CRISP_WEBSITE_ID, crispHostOk, crispPathOk } from "@/lib/crisp";

type CrispQueue = unknown[][];
declare global {
  interface Window {
    $crisp?: CrispQueue;
    CRISP_WEBSITE_ID?: string;
  }
}

/** True once Crisp is the live chat on this page, so the older contact launcher can step aside. */
export function useCrispLive(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => setLive(crispHostOk(window.location.hostname)), []);
  return live;
}

let loaded = false;
function loadCrisp() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
  const s = document.createElement("script");
  s.src = "https://client.crisp.chat/l.js";
  s.async = true;
  document.head.appendChild(s);
}

/** Loads the Crisp chat after the page is ready, on the live site, everywhere except the admin panel. */
export default function CrispChat() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!crispHostOk(window.location.hostname)) return;
    if (crispPathOk(path)) {
      const start = () => {
        loadCrisp();
        window.$crisp?.push(["do", "chat:show"]);
      };
      if (document.readyState === "complete") {
        const t = window.setTimeout(start, 800);
        return () => window.clearTimeout(t);
      }
      window.addEventListener("load", start, { once: true });
      return () => window.removeEventListener("load", start);
    }
    window.$crisp?.push(["do", "chat:hide"]);
  }, [path]);
  return null;
}
