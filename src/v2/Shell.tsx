import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid, Users, FileText, ListChecks, AlertTriangle, Send, BarChart3, Settings, Menu, X, LogOut,
  BookOpen,
  Search, Sun, Moon, LifeBuoy, ChevronRight, ChevronDown, PanelLeft, Palette, Bell,
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
import { ASSIST_STYLES, ContextAssist } from "./assist/ContextAssist";
import { SIDENAV_STYLES, SideNav } from "./components/SideNav";
import { CONTROLS_STYLES } from "./components/Controls";
import { MOTION_STYLES } from "./components/MotionKit";



const TITLES: Record<string, string> = {
  "/app": "Portfolio",
  "/app/clients": "Clients",
  "/app/documents": "Documents",
  "/app/review": "Review Queue",
  "/app/exceptions": "Exception Queue",
  "/app/chaser": "Chaser",
  "/app/gst": "GST",
  "/app/close": "Month-end close",
  "/app/reports": "MIS and Reports",
  "/app/settings": "Settings",
};

export default function V2Shell() {
  return (
    <V2StoreProvider>
      <style>{V2_STYLES + AGENT_STYLES + SIDENAV_STYLES + CONTROLS_STYLES + MOTION_STYLES + ASSIST_STYLES}</style>
      <ShellBody />
    </V2StoreProvider>
  );
}


function ShellBody() {
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useV2Theme();
  const { hydrated, bootError, retryBoot, session, onboarded, firm, signOut, period, setPeriod, periods, role, setRole, review, exceptions, chases, firmRole, canSignOff, runs, dismissRun, reports } = useV2();
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

  const section = pathname.startsWith("/app/clients") ? "Clients" : ["/app/review", "/app/exceptions", "/app/close", "/app/gst"].some((x) => pathname.startsWith(x)) ? "Checks" : firm?.name || "Workspace";
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

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

  const needsYou = (COUNTS["/app/review"] ?? 0) + (COUNTS["/app/exceptions"] ?? 0);

  useEffect(() => {
    if (!hydrated || resetting || bootError) return;
    if ((!session || !onboarded) && !onboarding) navigate({ to: "/app/onboarding" });
    // Leaving onboarding for the portfolio is decided by the onboarding page, so a
    // new partner is not pulled out halfway (the firm exists after step two).
  }, [hydrated, bootError, session, onboarded, onboarding, resetting, navigate]);

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

  // The workspace failed to load. Say so: never fall through to the sign-up steps for a firm that already exists.
  if (bootError && !resetting) {
    return (
      <div className="v2" role="alert" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: V.bg, padding: 20 }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 14, textAlign: "center", maxWidth: 420 }}>
          <img src={brandMark} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: "contain" }} />
          <h1 style={{ fontSize: 20, margin: 0 }}>We could not open your practice just now</h1>
          <p style={{ margin: 0, fontSize: 14, color: V.body, lineHeight: 1.6 }}>
            Your firm and your data are safe. This is usually a short interruption: wait a few seconds and try again.
          </p>
          <button className="v2-btn v2-btn-primary v2-btn-lg" onClick={retryBoot}>Try again</button>
          <details style={{ fontSize: 12, color: V.muted }}><summary style={{ cursor: "pointer" }}>Details</summary>{bootError}</details>
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
              borderBottom: `1px solid ${V.line}`, padding: "12px 24px",
              display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <button className="v2-icon-btn v2-mobile-only" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={17} /></button>
              <button className="v2-icon-btn v2-hide-mobile" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }))} aria-label="Hide or show the menu" title="Hide or show the menu ([)"><PanelLeft size={17} strokeWidth={1.6} /></button>
              <h2 className="truncate v2-crumb" style={{ fontSize: 13, fontWeight: 400, letterSpacing: 0 }}><span className="v2-hide-sm" style={{ color: V.muted }}>{section}</span><ChevronRight size={13} className="v2-hide-sm" style={{ color: V.muted, flex: "none" }} aria-hidden="true" /><b className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{title}</b></h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
              <button className="v2-searchbox v2-hide-sm" onClick={() => command.setOpen(true)} aria-label="Open command menu" title="Search or run an agent (⌘K)">
                <Search size={15} strokeWidth={1.7} /> <span>Search here…</span> <span className="v2-kbd">⌘ K</span>
              </button>
              <label className="v2-pillselect v2-hide-md" title="Month shown across the product">
                <select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>{periods.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                <ChevronDown size={13} aria-hidden="true" />
              </label>
              <button className="v2-round" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"} data-testid="theme-toggle">
                {theme === "dark" ? <Sun size={16} strokeWidth={1.7} /> : <Palette size={16} strokeWidth={1.7} />}
              </button>
              <Link to="/app/review" className="v2-round" aria-label={`Needs you: ${needsYou} item${needsYou === 1 ? "" : "s"}`} title="Needs you" data-testid="bell">
                <Bell size={16} strokeWidth={1.7} />{needsYou > 0 && <i className="v2-belldot" />}
              </Link>
              {partnerView
                ? <Link to="/app/settings" className="v2-round" aria-label="Settings" title="Settings"><Settings size={16} strokeWidth={1.7} /></Link>
                : <Link to="/app/settings" search={{ tab: "help" } as never} className="v2-round" aria-label="Help and report a problem" title="Help and report a problem" data-testid="help-link"><LifeBuoy size={16} strokeWidth={1.7} /></Link>}
              <div ref={menuRef} style={{ position: "relative" }}>
                <button className="v2-userpill" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" data-testid="user-menu">
                  <span className="av">{(session?.name || session?.email || "F").split(/[\s@]+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <span className="nm v2-hide-md">{(session?.name || session?.email || "").split(" ")[0]}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {menu && (
                  <div role="menu" className="v2-usermenu">
                    <div style={{ padding: "10px 12px 8px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{session?.name || session?.email || ""}</div>
                      <div style={{ fontSize: 12, color: V.muted }} data-testid="firm-role">{firmRole ? firmRole[0].toUpperCase() + firmRole.slice(1) : role}{canSignOff && role === "Junior" ? " · viewing as Junior" : ""} · {firm?.name || "Your firm"}</div>
                    </div>
                    <button role="menuitem" onClick={() => { setMenu(false); window.dispatchEvent(new Event("fynhelp:assist-show")); }}><LifeBuoy size={15} strokeWidth={1.7} /> Tips for this screen</button>
                    <Link role="menuitem" to="/app/settings" onClick={() => setMenu(false)}><Settings size={15} strokeWidth={1.7} /> Settings</Link>
                    <button role="menuitem" className="out" onClick={() => { setMenu(false); signOut(); navigate({ to: "/app/onboarding" }); }}><LogOut size={15} strokeWidth={1.7} /> Logout</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main style={{ padding: 24, flex: 1, maxWidth: 1280, width: "100%" }}>
            <TestBanner />
            <PhonePrompt />
            <TrialBanner partnerView={partnerView} />
            <FirstRunWelcome />
            <Outlet />
            <ContextAssist facts={{ exceptions: (COUNTS["/app/exceptions"] ?? 0) || exceptions.filter((e) => e.status === "open").length, review: COUNTS["/app/review"] ?? 0, chases: COUNTS["/app/chaser"] ?? 0 }} />
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
        .v2-searchbox { display:inline-flex; align-items:center; gap:9px; height:38px; min-width:250px; padding:0 8px 0 13px; border-radius:999px; border:1px solid ${V.line}; background:${V.card}; color:${V.muted}; font:inherit; font-size:13px; cursor:pointer; box-shadow:0 1px 2px rgba(20,18,16,.03); }
        .v2-searchbox span:nth-child(2) { flex:1; text-align:left; } .v2-searchbox:hover { border-color:color-mix(in srgb, var(--v2-brand) 40%, ${V.line}); }
        .v2-pillselect { position:relative; display:inline-flex; align-items:center; height:38px; border-radius:999px; border:1px solid ${V.line}; background:${V.card}; padding:0 12px 0 14px; gap:6px; color:${V.body}; }
        .v2-pillselect select { appearance:none; -webkit-appearance:none; border:0; background:transparent; font:inherit; font-size:13px; color:${V.ink}; outline:0; cursor:pointer; padding-right:2px; }
        .v2-round { position:relative; display:inline-grid; place-items:center; width:38px; height:38px; border-radius:999px; border:1px solid ${V.line}; background:${V.card}; color:${V.body}; cursor:pointer; text-decoration:none; transition:background .15s ease, color .15s ease; }
        .v2-round:hover { background:${V.gray}; color:${V.ink}; }
        .v2-belldot { position:absolute; top:8px; right:9px; width:7px; height:7px; border-radius:999px; background:${V.brand}; box-shadow:0 0 0 2px ${V.card}; }
        .v2-userpill { display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 10px 0 4px; border-radius:999px; border:1px solid ${V.line}; background:${V.card}; color:${V.body}; font:inherit; font-size:13px; font-weight:550; cursor:pointer; }
        .v2-userpill .av { width:30px; height:30px; border-radius:999px; background:${V.beige}; color:${V.ink}; display:grid; place-items:center; font-size:11.5px; font-weight:700; }
        .v2-userpill .nm { color:${V.ink}; }
        .v2-usermenu { position:absolute; right:0; top:46px; width:250px; border-radius:16px; border:1px solid ${V.line}; background:var(--v2-pop); box-shadow:0 24px 60px -24px rgba(20,18,16,.45); padding:6px; z-index:60; }
        .v2-usermenu a, .v2-usermenu button { display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; border-radius:10px; border:0; background:transparent; font:inherit; font-size:13.5px; color:${V.ink}; cursor:pointer; text-decoration:none; text-align:left; }
        .v2-usermenu a:hover, .v2-usermenu button:hover { background:${V.gray}; } .v2-usermenu .out { color:#C23030; }
        @media (max-width:900px){ .v2-hide-mobile { display:none; } }
        @media (max-width:900px){ .v2-mobile-only { display:inline-flex; } }
        @media (max-width:560px){ .v2-hide-sm { display:none; } }
        /* Laptop widths with a side panel open: keep the header on one line. */
        @media (max-width:1180px){ .v2-hide-md { display:none !important; } }
      `}</style>
    </>
  );
}
