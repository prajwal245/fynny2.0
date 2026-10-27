import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid, Users, FileText, ListChecks, AlertTriangle, Send, BarChart3, Settings, Menu, X, LogOut,
  BookOpen,
  Search, Sun, Moon,
} from "lucide-react";
import { toast } from "sonner";
import { V, V2_STYLES, useV2Theme } from "./ui";
import { AGENT_STYLES, ProcessingCard, ShimmerText } from "./agents";
import { AnimatePresence, motion } from "framer-motion";
import brandMark from "@/assets/brand/fynhelp-icon-red-new.png";
import { CommandMenu, useCommandMenu } from "./components/CommandMenu";
import { V2StoreProvider, monthOf, useV2 } from "./store";
import { openExceptionsIn } from "./lib/exceptions";
import { TrialBanner } from "./components/TrialBanner";
import { TestBanner } from "./components/TestBanner";
import { PhonePrompt } from "./components/PhonePrompt";
import { FirstRunWelcome } from "./components/FirstCloseGuide";
import { SIDENAV_STYLES, SideNav } from "./components/SideNav";



const TITLES: Record<string, string> = {
  "/app": "Portfolio",
  "/app/clients": "Clients",
  "/app/documents": "Documents",
  "/app/review": "Review Queue",
  "/app/exceptions": "Exception Queue",
  "/app/chaser": "Chaser",
  "/app/reports": "MIS and Reports",
  "/app/settings": "Settings",
};

export default function V2Shell() {
  return (
    <V2StoreProvider>
      <style>{V2_STYLES + AGENT_STYLES + SIDENAV_STYLES}</style>
      <ShellBody />
    </V2StoreProvider>
  );
}


function ShellBody() {
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useV2Theme();
  const { hydrated, session, onboarded, firm, signOut, period, setPeriod, periods, role, setRole, review, exceptions, chases, firmRole, canSignOff, runs, dismissRun, reports } = useV2();
  const navigate = useNavigate();
  // The page actually on screen (not one still loading), without a trailing slash.
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname.replace(/(.)\/+$/, "$1") });
  // Messages belong to the screen they were shown on: when the page or month
  // changes, older ones are cleared (one fired just before the move stays).
  const toastSeen = useRef(new Map<string | number, number>());
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const live = new Set<string | number>();
      for (const x of toast.getToasts()) {
        live.add(x.id);
        if (!toastSeen.current.has(x.id)) toastSeen.current.set(x.id, now);
      }
      for (const id of [...toastSeen.current.keys()]) if (!live.has(id)) toastSeen.current.delete(id);
    }, 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const now = Date.now();
    for (const x of toast.getToasts()) {
      const seen = toastSeen.current.get(x.id);
      if (seen !== undefined && now - seen > 1200) toast.dismiss(x.id);
    }
  }, [pathname, period]);
  // A toast belongs to the page it was raised on.
  useEffect(() => {
    toast.dismiss();
  }, [pathname]);
  const title =
    TITLES[pathname] ??
    (pathname.startsWith("/app/clients/") ? "Client workspace" : pathname.startsWith("/app/reports/") ? "MIS report" : "FynHelp");

  const onboarding = pathname === "/app/onboarding";
  const command = useCommandMenu();
  // The reset link signs the user in only to set a password: no redirects there.
  const resetting = pathname === "/app/reset-password";

  // Working as Partner: reviewer and approver, plus firm settings. Working as Junior: the preparer's tabs.
  const partnerView = canSignOff && role === "Partner";
  const COUNTS: Record<string, number> = {
    // Partner: reports waiting for sign-off. Junior: reports sent back for correction.
    "/app/reports": partnerView
      ? reports.filter((r) => !r.signedOff && !r.correction).length
      : reports.filter((r) => r.correction && !r.signedOff).length,
    "/app/review": review.filter((r) => r.status === "open").length,
    // Same count the Exception Queue opens with: the month selected at the top.
    "/app/exceptions": openExceptionsIn(exceptions, monthOf, period).length,
    "/app/chaser": chases.filter((c) => c.status !== "Resolved").length,
  };

  useEffect(() => {
    if (!hydrated || resetting) return;
    if ((!session || !onboarded) && !onboarding) navigate({ to: "/app/onboarding" });
    // Leaving onboarding for the portfolio is decided by the onboarding page, so a
    // new partner is not pulled out halfway (the firm exists after step two).
  }, [hydrated, session, onboarded, onboarding, resetting, navigate]);

  if (!hydrated && !resetting) {
    return (
      <div className="v2" role="status" aria-live="polite" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: V.bg }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 16 }}>
          <motion.img
            src={brandMark}
            alt=""
            width={56}
            height={56}
            style={{ width: 56, height: 56, objectFit: "contain" }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <ShimmerText text="Opening your practice…" agent="extract" style={{ fontSize: 15, fontWeight: 600 }} />
          <div className="v2-bar" style={{ width: 160 }}><i style={{ background: V.brand }} /></div>
        </div>
      </div>
    );
  }

  if (onboarding || resetting) {
    return (
      <div className="v2" style={{ minHeight: "100vh", padding: onboarding ? 0 : "48px 20px" }}>
        <Outlet />
      </div>
    );
  }

  return (
    <>
      <div className="v2" style={{ minHeight: "100vh", display: "flex" }}>
        {open && (
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "var(--v2-overlay)", zIndex: 55 }} />
        )}
        <SideNav
          pathname={pathname}
          partnerView={partnerView}
          counts={COUNTS}
          open={open}
          onClose={() => setOpen(false)}
          firmName={firm?.name || ""}
          canSignOff={canSignOff}
          role={role}
          setRole={setRole}
          onSignOut={() => { signOut(); navigate({ to: "/app/onboarding" }); }}
        />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header
            style={{
              position: "sticky", top: 0, zIndex: 40, background: "var(--v2-head)", backdropFilter: "blur(14px)",
              borderBottom: `1px solid ${V.line}`, padding: "14px 24px",
              display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button className="v2-btn v2-btn-ghost v2-mobile-only" onClick={() => setOpen(true)} style={{ padding: "8px 10px" }}>
                <Menu size={16} />
              </button>
              <h2 className="truncate" style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, whiteSpace: "nowrap" }}>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm v2-hide-sm"
                onClick={() => command.setOpen(true)}
                aria-label="Open command menu"
                title="Search or run an agent (⌘K)"
                style={{ color: V.muted, gap: 10 }}
              >
                <Search size={14} /> <span className="v2-hide-md">Search or run an agent…</span> <span className="v2-kbd">⌘K</span>
              </button>
              <button
                className="v2-icon-btn"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                data-testid="theme-toggle"
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <label className="v2-hide-sm" style={{ fontSize: 11.5, color: V.muted }}>Period</label>
              <select
                className="v2-input"
                style={{ width: "auto", maxWidth: 150, padding: "7px 28px 7px 10px", fontSize: 12.5 }}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {periods.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{ textAlign: "right", lineHeight: 1.25, maxWidth: 220, minWidth: 0 }} className="v2-hide-md" title={`${session?.name || session?.email || ""} · ${firm?.name || ""}`}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{session?.name || session?.email || ""}</div>
                <div style={{ fontSize: 11, color: V.muted, overflow: "hidden", textOverflow: "ellipsis" }} data-testid="firm-role">{firmRole ? firmRole[0].toUpperCase() + firmRole.slice(1) : role}{canSignOff && role === "Junior" ? " · viewing as Junior" : ""} · {firm?.name || "Your firm"}</div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: 999, background: V.beige, display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700 }}>{(session?.name || "F").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
            </div>
          </header>

          <main style={{ padding: 24, flex: 1, maxWidth: 1280, width: "100%" }}>
            <TestBanner />
            <PhonePrompt />
            <TrialBanner partnerView={partnerView} />
            <FirstRunWelcome />
            <Outlet />
            {/* Live agent cards dock at the bottom of the page: opening or closing one never moves what is under the cursor. */}
            <div data-testid="run-dock" style={{ position: "sticky", bottom: 16, zIndex: 30, display: "grid", gap: 10, width: "min(520px, 100%)", marginLeft: "auto", marginTop: runs.length ? 18 : 0 }}>
              <AnimatePresence>
                {runs.slice(0, 3).map((r) => (
                  <ProcessingCard key={r.id} run={r} onDismiss={() => dismissRun(r.id)} />
                ))}
              </AnimatePresence>
            </div>
          </main>
          <CommandMenu open={command.open} onClose={() => command.setOpen(false)} />
        </div>
      </div>
      <style>{`
        .v2-mobile-only { display:none; }
        @media (max-width:900px){ .v2-mobile-only { display:inline-flex; } }
        @media (max-width:560px){ .v2-hide-sm { display:none; } }
        /* Laptop widths with a side panel open: keep the header on one line. */
        @media (max-width:1180px){ .v2-hide-md { display:none !important; } }
      `}</style>
    </>
  );
}
