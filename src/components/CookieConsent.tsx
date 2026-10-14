/**
 * Cookie banner: shown until the visitor chooses, then never again (the choice
 * is kept in this browser). Analytics stays off until "Accept all" or until
 * analytics is switched on in Cookie settings.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { OPEN_SETTINGS_EVENT, readConsent, saveConsent } from "@/lib/consent";

const ink = "#171208";
const maroon = "#8A1E18";
const line = "rgba(23,18,8,.12)";

export default function CookieConsent() {
  const { pathname } = useLocation();
  const [mounted, setMounted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const c = readConsent();
    setShowBanner(!c);
    setAnalytics(c?.analytics ?? false);
    const open = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setSettings(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  useEffect(() => {
    if (!settings) return;
    dialog.current?.querySelector<HTMLElement>("input,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSettings(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings]);

  // The internal admin panel and shared report links carry no analytics choice of their own.
  if (!mounted || pathname.startsWith("/admin")) return null;

  const choose = (allow: boolean) => {
    saveConsent(allow);
    setAnalytics(allow);
    setShowBanner(false);
    setSettings(false);
  };

  const btn = (kind: "primary" | "ghost") =>
    ({
      border: kind === "primary" ? `1px solid ${maroon}` : `1px solid ${line}`,
      background: kind === "primary" ? maroon : "#fff",
      color: kind === "primary" ? "#fff" : ink,
      borderRadius: 999,
      padding: "10px 18px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
    }) as const;

  return (
    <>
      {showBanner && !settings && (
        <div
          role="region"
          aria-label="Cookie choices"
          data-testid="cookie-banner"
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 2147483000,
            margin: "0 auto",
            maxWidth: 980,
            background: "#FFFDF9",
            color: ink,
            border: `1px solid ${line}`,
            borderRadius: 16,
            boxShadow: "0 18px 50px -20px rgba(23,18,8,.45)",
            padding: "16px 18px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px 20px",
            fontFamily: "inherit",
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, flex: "1 1 320px" }}>
            We use essential cookies to keep you signed in and secure. With your permission we also use analytics
            cookies (Google Analytics, PostHog) to see which pages help. No advertising cookies.{" "}
            <a href="/privacy#s6" style={{ color: maroon, fontWeight: 600, textDecoration: "underline" }}>Privacy Policy</a>
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: "0 1 auto" }}>
            <button type="button" style={btn("ghost")} onClick={() => setSettings(true)} data-testid="cookie-settings">Cookie settings</button>
            <button type="button" style={btn("ghost")} onClick={() => choose(false)} data-testid="cookie-reject">Reject non-essential</button>
            <button type="button" style={btn("primary")} onClick={() => choose(true)} data-testid="cookie-accept">Accept all</button>
          </div>
        </div>
      )}

      {settings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(23,18,8,.4)" }} onClick={() => setSettings(false)} />
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            data-testid="cookie-dialog"
            style={{ position: "relative", width: "100%", maxWidth: 520, background: "#FFFDF9", color: ink, borderRadius: 18, padding: 22, boxShadow: "0 30px 80px -30px rgba(0,0,0,.5)", fontFamily: "inherit", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}
          >
            <h2 id="cookie-settings-title" style={{ margin: "0 0 6px", fontSize: 19 }}>Cookie settings</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.55, opacity: 0.8 }}>
              Choose what this browser allows. You can change this any time from "Cookie settings" at the foot of any page.
            </p>
            <Row
              title="Strictly necessary"
              text="Keep you signed in, protect forms from abuse and remember this choice. The site does not work without them."
              control={<span style={{ fontSize: 12.5, fontWeight: 600, color: "#166534" }}>Always on</span>}
            />
            <Row
              title="Analytics"
              text="Google Analytics 4 and PostHog count visits and which pages help, so we can improve them. Off until you switch it on."
              control={
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} data-testid="cookie-analytics" style={{ width: 18, height: 18, accentColor: maroon }} />
                  {analytics ? "On" : "Off"}
                </label>
              }
            />
            <Row title="Advertising" text="None. FynHelp does not use advertising or cross-site tracking cookies." control={<span style={{ fontSize: 12.5, opacity: 0.7 }}>Not used</span>} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" style={btn("ghost")} onClick={() => choose(false)}>Reject non-essential</button>
              <button type="button" style={btn("ghost")} onClick={() => choose(analytics)} data-testid="cookie-save">Save choices</button>
              <button type="button" style={btn("primary")} onClick={() => choose(true)}>Accept all</button>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 12.5 }}>
              <a href="/privacy#s6" style={{ color: maroon, textDecoration: "underline" }}>How we use cookies (Privacy Policy, section 6)</a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ title, text, control }: { title: string; text: string; control: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderTop: `1px solid ${line}` }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.78, marginTop: 2 }}>{text}</div>
      </div>
      <div style={{ flex: "0 0 auto", paddingTop: 2 }}>{control}</div>
    </div>
  );
}
