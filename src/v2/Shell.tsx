import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid, Users, FileText, ListChecks, AlertTriangle, Send, BarChart3, Settings, Menu, X, LogOut,
} from "lucide-react";
import { V, V2_STYLES } from "./ui";
import { AGENT_STYLES } from "./agents";
import { PERIODS, V2StoreProvider, useV2 } from "./store";

/** Partners live in Portfolio and MIS. Juniors also work the queues. */
const PARTNER_NAV = ["/v2", "/v2/clients", "/v2/reports", "/v2/settings"];

const NAV = [
  { to: "/v2", label: "Portfolio", icon: LayoutGrid, exact: true },
  { to: "/v2/clients", label: "Clients", icon: Users },
  { to: "/v2/documents", label: "Documents", icon: FileText },
  { to: "/v2/review", label: "Review Queue", icon: ListChecks },
  { to: "/v2/exceptions", label: "Exception Queue", icon: AlertTriangle },
  { to: "/v2/chaser", label: "Chaser", icon: Send },
  { to: "/v2/reports", label: "MIS and Reports", icon: BarChart3 },
  { to: "/v2/settings", label: "Settings", icon: Settings },
] as const;

const TITLES: Record<string, string> = {
  "/v2": "Portfolio",
  "/v2/clients": "Clients",
  "/v2/documents": "Documents",
  "/v2/review": "Review Queue",
  "/v2/exceptions": "Exception Queue",
  "/v2/chaser": "Chaser",
  "/v2/reports": "MIS and Reports",
  "/v2/settings": "Settings",
};

export default function V2Shell() {
  return (
    <V2StoreProvider>
      <style>{V2_STYLES + AGENT_STYLES}</style>
      <ShellBody />
    </V2StoreProvider>
  );
}


function ShellBody() {
  const [open, setOpen] = useState(false);
  const { hydrated, session, onboarded, firm, signOut, period, setPeriod, role, setRole, review, exceptions, chases } = useV2();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    TITLES[pathname] ??
    (pathname.startsWith("/v2/clients/") ? "Client workspace" : pathname.startsWith("/v2/reports/") ? "MIS report" : "FynHelp");

  const onboarding = pathname === "/v2/onboarding";

  const COUNTS: Record<string, number> = {
    "/v2/review": review.filter((r) => r.status === "open").length,
    "/v2/exceptions": exceptions.filter((e) => e.status === "open").length,
    "/v2/chaser": chases.filter((c) => c.status !== "Resolved").length,
  };

  useEffect(() => {
    if (!hydrated) return;
    if ((!session || !onboarded) && !onboarding) navigate({ to: "/v2/onboarding" });
    if (session && onboarded && onboarding) navigate({ to: "/v2" });
  }, [hydrated, session, onboarded, onboarding, navigate]);

  if (!hydrated) {
    return (
      <div className="v2" style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: V.muted, fontSize: 13 }}>
        Loading your workspace
      </div>
    );
  }

  if (onboarding) {
    return (
      <div className="v2" style={{ minHeight: "100vh", padding: "48px 20px" }}>
        <Outlet />
      </div>
    );
  }

  return (
    <>
      <div className="v2" style={{ minHeight: "100vh", display: "flex" }}>
        {open && (
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,20,.3)", zIndex: 55 }} />
        )}
        <aside
          className={`v2-sidebar${open ? " open" : ""}`}
          style={{
            width: 244, flex: "0 0 244px", background: V.card, borderRight: `1px solid ${V.line}`,
            padding: "22px 14px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
            transition: "transform .22s ease",
          }}
        >
          <div style={{ padding: "0 8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.03em" }}>FynHelp</div>
              <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: V.muted, marginTop: 3 }}>{firm?.name || "Practice OS"}</div>
            </div>
            <button className="v2-btn v2-btn-quiet" style={{ display: "none" }} onClick={() => setOpen(false)}><X size={15} /></button>
          </div>

          <div style={{ padding: "0 8px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: V.muted, fontWeight: 700, marginBottom: 6 }}>Working as</div>
            <div style={{ display: "flex", gap: 4, background: V.gray, padding: 3, borderRadius: 999 }}>
              {(["Partner", "Junior"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1, border: 0, cursor: "pointer", borderRadius: 999, padding: "6px 0", fontSize: 12, fontWeight: 600,
                    fontFamily: "inherit", background: role === r ? V.card : "transparent", color: role === r ? V.ink : V.muted,
                    boxShadow: role === r ? "0 1px 3px rgba(20,20,20,.10)" : "none",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <nav className="v2-nav" style={{ flex: 1, overflowY: "auto" }}>
            {NAV.filter((n) => role === "Junior" || PARTNER_NAV.includes(n.to)).map(({ to, label, icon: Icon, ...rest }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: "exact" in rest ? true : false }}
              >
                <Icon size={16} />
                <span>{label}</span>
                {COUNTS[to] !== undefined && COUNTS[to] > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: V.beige, borderRadius: 999, padding: "1px 7px" }}>{COUNTS[to]}</span>
                )}
              </Link>
            ))}
          </nav>

          <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 14, fontSize: 11.5, color: V.muted, padding: "14px 8px 0" }}>
            <button className="v2-btn v2-btn-quiet" onClick={() => { signOut(); navigate({ to: "/v2/onboarding" }); }}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header
            style={{
              position: "sticky", top: 0, zIndex: 40, background: "rgba(248,247,244,.86)", backdropFilter: "blur(10px)",
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label className="v2-hide-sm" style={{ fontSize: 11.5, color: V.muted }}>Period</label>
              <select
                className="v2-input"
                style={{ width: "auto", padding: "7px 10px", fontSize: 12.5 }}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{ textAlign: "right", lineHeight: 1.25 }} className="v2-hide-sm">
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{session?.name || "Partner"}</div>
                <div style={{ fontSize: 11, color: V.muted }}>{role} · {firm?.name || "Your firm"}</div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: 999, background: V.beige, display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700 }}>{(session?.name || "F").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
            </div>
          </header>

          <main style={{ padding: 24, flex: 1, maxWidth: 1280, width: "100%" }}>
            <Outlet />
          </main>
        </div>
      </div>
      <style>{`
        .v2-mobile-only { display:none; }
        @media (max-width:900px){ .v2-mobile-only { display:inline-flex; } }
        @media (max-width:560px){ .v2-hide-sm { display:none; } }
      `}</style>
    </>
  );
}
