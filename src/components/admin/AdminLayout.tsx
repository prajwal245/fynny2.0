import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "@/lib/router-compat";
import {
  BarChart3, Users, CreditCard, FileText, MessageCircle, TrendingUp, Bot,
  Send, Flag, Settings, Activity, ClipboardList, Menu, X, LogOut, ChevronDown,
  Search, Bell, LayoutDashboard, Lock, UserPlus, Image as ImageIcon, Newspaper, ShieldCheck, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth, type AdminRole } from "@/contexts/AdminAuthContext";
import FynLogo from "@/components/FynLogo";

type NavItem =
  | { divider: true }
  | { divider?: false; to: string; label: string; icon: typeof BarChart3; roles: AdminRole[]; badgeKey?: string };

const NAV_ITEMS: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: BarChart3, roles: ["super_admin","ops_admin","support_agent","analyst"] },
  { to: "/admin/ceo-view", label: "CEO View", icon: LayoutDashboard, roles: ["super_admin"] },
  { to: "/admin/users", label: "Users", icon: Users, roles: ["super_admin","ops_admin","support_agent"] },
  { to: "/admin/ca-approvals", label: "CA Approvals", icon: ShieldCheck, roles: ["super_admin","ops_admin","admin"] },
  { to: "/admin/ca-verification", label: "CA Verification", icon: ShieldCheck, roles: ["super_admin","ops_admin"], badgeKey: "ca_pending" },

  { to: "/admin/waitlist", label: "Waitlist", icon: UserPlus, roles: ["super_admin","ops_admin","support_agent","analyst"] },
  { to: "/admin/subscriptions", label: "Subscriptions & Billing", icon: CreditCard, roles: ["super_admin","ops_admin"] },
  { to: "/admin/content", label: "Content Management", icon: FileText, roles: ["super_admin","ops_admin","support_agent"] },
  { to: "/admin/blog", label: "Blog", icon: Newspaper, roles: ["super_admin","ops_admin","admin","support_agent"] },
  { to: "/admin/media", label: "Media Library", icon: ImageIcon, roles: ["super_admin","admin","support_agent"] },
  { to: "/admin/support", label: "Support Tickets", icon: MessageCircle, roles: ["super_admin","ops_admin","support_agent"] },
  { to: "/admin/analytics", label: "Analytics", icon: TrendingUp, roles: ["super_admin","ops_admin","analyst"] },
  { to: "/admin/ai-monitoring", label: "AI Monitoring", icon: Bot, roles: ["super_admin","ops_admin","analyst"] },
  { to: "/admin/ai-credits", label: "AI Credits & Usage", icon: Gauge, roles: ["super_admin","ops_admin","analyst"] },
  { to: "/admin/ca-invites", label: "CA Portal Invites", icon: UserPlus, roles: ["super_admin","admin","ops_admin"] },
  { to: "/admin/communications", label: "Communications Hub", icon: Send, roles: ["super_admin","ops_admin","support_agent"] },
  { to: "/admin/feature-flags", label: "Feature Flags", icon: Flag, roles: ["super_admin","ops_admin"] },
  { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck, roles: ["super_admin"] },
  { to: "/admin/settings", label: "Settings", icon: Settings, roles: ["super_admin"] },
  { to: "/admin/system-health", label: "System Health", icon: Activity, roles: ["super_admin","ops_admin"] },
  { to: "/admin/internal-access", label: "Internal Access", icon: Lock, roles: ["super_admin","ops_admin"] },
  { divider: true },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList, roles: ["super_admin","ops_admin","support_agent","analyst"] },
];

const SUPPORT_EMAIL = "support@fynhelp.com";
const SUPPORT_ALLOWED_PATHS = ["/admin/content", "/admin/media", "/admin/communications", "/admin/blog/new", "/admin/blog/"];

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin", admin: "Admin", ops_admin: "Ops Admin",
  support_agent: "Support Agent", analyst: "Analyst", user: "User",
};

export function AdminProtected({ children, allowed }: { children?: ReactNode; allowed?: AdminRole[] }) {
  const { user, loading, isAdmin, hasRole } = useAdminAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0EBE0" }}>
        <div className="text-sm" style={{ color: "#171208" }}>Checking access…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  if (allowed && allowed.length && !hasRole(...allowed)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

const SIDEBAR_W = 260;
const MOBILE_W = 280;
const TOP_H = 70;

export default function AdminLayout() {
  const { user, signOut, primaryRole, hasRole, loading, roles } = useAdminAuth();
  const isSuperAdmin = hasRole("super_admin");
  const isSupport = user?.email === SUPPORT_EMAIL;
  const location = useLocation();
  const nav = useNavigate();

  // Roles arrive asynchronously after sign-in; running the guards before they
  // land caused a redirect/toast loop on every admin page load.
  const rolesReady = !loading && roles.length > 0;

  useEffect(() => {
    if (!rolesReady) return;
    if (isSupport && !SUPPORT_ALLOWED_PATHS.some((p) => location.pathname.startsWith(p))) {
      nav("/admin/content", { replace: true });
    }
  }, [rolesReady, isSupport, location.pathname, nav]);

  // Route-level least privilege: block direct URL access to sections the
  // signed-in admin's roles do not cover. The support account is exempt on its
  // own allowed paths — otherwise the two guards bounce against each other.
  useEffect(() => {
    if (!rolesReady) return;
    const onSupportPath = isSupport && SUPPORT_ALLOWED_PATHS.some((p) => location.pathname.startsWith(p));
    if (onSupportPath) return;
    const match = NAV_ITEMS.filter((i): i is Extract<NavItem, { to: string }> => !("divider" in i && i.divider))
      .filter((i) => location.pathname === i.to || location.pathname.startsWith(i.to + "/"))
      .sort((a, b) => b.to.length - a.to.length)[0];
    if (match && !hasRole(...match.roles) && location.pathname !== "/admin/dashboard") {
      toast.error("You do not have access to that section.");
      nav("/admin/dashboard", { replace: true });
    }
  }, [rolesReady, isSupport, location.pathname, hasRole, nav]);


  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isDesktop = windowWidth >= 1024;

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isDesktop) setSidebarOpen(true);
    else if (isMobile) setSidebarOpen(false);
  }, [isDesktop, isMobile]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen && !isDesktop) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [sidebarOpen, isDesktop]);

  const [caPending, setCaPending] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from("ca_firms")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending");
      if (!cancelled) setCaPending(count ?? 0);
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [location.pathname]);
  const badges: Record<string, number> = { ca_pending: caPending };

  // Least-privilege: a nav item is visible only when the signed-in admin holds
  // one of its declared roles. Support agent is additionally path-restricted.
  const visible = NAV_ITEMS.filter((i) => {
    if ("divider" in i && i.divider) return !isSupport;
    const it = i as Extract<NavItem, { to: string }>;
    if (isSupport) return SUPPORT_ALLOWED_PATHS.includes(it.to) && hasRole(...it.roles);
    return hasRole(...it.roles);
  });


  const initials = (user?.email ?? "A").slice(0, 2).toUpperCase();

  // Derived layout values
  const sidebarLeft = isMobile ? (sidebarOpen ? 0 : -MOBILE_W) : 0;
  const sidebarWidth = isMobile ? MOBILE_W : isTablet ? (sidebarOpen ? SIDEBAR_W : 0) : SIDEBAR_W;
  const mainMargin = isMobile ? 0 : isTablet ? (sidebarOpen ? SIDEBAR_W : 0) : SIDEBAR_W;
  const mainPad = isMobile ? 20 : isTablet ? 32 : 40;

  return (
    <div className="admin-layout" style={{ minHeight: "100vh", background: "hsl(var(--fyn-beige))" }}>
      {/* Backdrop (mobile only) */}
      {sidebarOpen && isMobile && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 40, transition: "opacity 0.3s ease",
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        role="navigation"
        aria-label="Admin navigation"
        style={{
          position: "fixed",
          top: 0, left: sidebarLeft,
          width: isMobile ? MOBILE_W : sidebarWidth,
          height: "100vh",
          background: "hsl(var(--fyn-ink))",
          zIndex: 50,
          overflowY: "auto", overflowX: "hidden",
          transition: "left 0.3s cubic-bezier(0.4,0,0.2,1), width 0.3s cubic-bezier(0.4,0,0.2,1)",
          display: "flex", flexDirection: "column",
        }}
      >
        {!isDesktop && (
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            style={{
              position: "absolute", top: 16, right: 16,
              background: "transparent", border: "none", cursor: "pointer",
              color: "#F4EDDA", padding: 6, zIndex: 60, transition: "opacity 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <X size={24} strokeWidth={2.5} />
          </button>
        )}

        <div style={{ padding: "20px 20px 12px" }}>
          <button
            onClick={() => { if (isMobile) setSidebarOpen(false); nav("/"); }}
            aria-label="Go to FYNHelp home"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: 0, transition: "opacity 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <FynLogo variant="light" showTagline={false} size="sm" className="" />
            <span style={{ fontFamily: "Raleway, sans-serif", fontSize: 11, color: "hsl(var(--fyn-gold))", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              {isSupport ? "Content Admin" : "Admin"}
            </span>
          </button>
        </div>

        <nav className="flex-1" style={{ paddingBottom: 60 }}>
          {visible.map((item, idx) => {
            if ("divider" in item && item.divider) {
              return (
                <div
                  key={`div-${idx}`}
                  style={{ height: 1, background: "rgba(244,237,218,0.1)", margin: "12px 16px" }}
                />
              );
            }
            const it = item as Extract<NavItem, { to: string }>;
            const Icon = it.icon;
            const isActive = location.pathname === it.to || location.pathname.startsWith(it.to + "/");
            return (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={() => { if (isMobile) setSidebarOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 20px",
                  background: isActive ? "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)" : "transparent",
                  color: isActive ? "#FFFFFF" : "rgba(244,237,218,0.8)",
                  borderLeft: isActive ? "4px solid #8B6914" : "4px solid transparent",
                  paddingLeft: isActive ? 16 : 20,
                  fontFamily: "Raleway, sans-serif", fontWeight: 500, fontSize: 15,
                  textDecoration: "none",
                  transition: "all 0.25s ease",
                  boxShadow: isActive ? "0 4px 12px rgba(196,30,30,0.3)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(139,105,20,0.15)";
                    e.currentTarget.style.color = "#F4EDDA";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "rgba(244,237,218,0.8)";
                  }
                }}
              >
                <Icon size={20} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.badgeKey && badges[it.badgeKey] > 0 && (
                  <span style={{
                    background: "#C41E1E", color: "#fff", fontSize: 11, fontWeight: 700,
                    padding: "2px 7px", borderRadius: 999, minWidth: 20, textAlign: "center",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  }}>{badges[it.badgeKey]}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "16px 20px",
            borderTop: "1px solid rgba(244,237,218,0.1)",
            color: "rgba(244,237,218,0.5)",
            fontFamily: "Roboto, sans-serif", fontSize: 12,
            background: "hsl(var(--fyn-ink))",
          }}
        >
          v1.0.0
        </div>
      </aside>

      {/* Main wrapper */}
      <div
        style={{
          marginLeft: mainMargin,
          transition: "margin-left 0.3s cubic-bezier(0.4,0,0.2,1)",
          display: "flex", flexDirection: "column", minHeight: "100vh",
        }}
      >
        {/* Top nav */}
        <header
          style={{
            height: TOP_H, background: "#FFFFFF",
            borderBottom: "1px solid hsl(var(--fyn-ink) / 0.08)",
            boxShadow: "0 2px 8px hsl(var(--fyn-ink) / 0.04)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: isMobile ? "0 16px" : "0 32px",
            position: "sticky", top: 0, zIndex: 30,
          }}
        >
          <div className="flex items-center gap-3">
            {!isDesktop && (
              <button
                onClick={() => setSidebarOpen((s) => !s)}
                aria-label="Toggle sidebar"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: 8, color: "hsl(var(--fyn-ink))", borderRadius: 8,
                  transition: "background 0.2s ease", minWidth: 44, minHeight: 44,
                  display: "grid", placeItems: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(23,18,8,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Menu size={24} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Search */}
            <button
              onClick={() => toast.info("Global search coming in Part 4")}
              className="p-2 rounded-lg hover:bg-[hsl(var(--fyn-ink)/0.05)]"
              aria-label="Search"
              style={{ minWidth: 40, minHeight: 40, display: "grid", placeItems: "center" }}
            >
              <Search size={20} color="hsl(var(--fyn-ink) / 0.7)" />
            </button>
            {/* Notifications */}
            <button
              onClick={() => toast.info("Notifications coming in Part 4")}
              className="relative p-2 rounded-lg hover:bg-[hsl(var(--fyn-ink)/0.05)]"
              aria-label="Notifications"
              style={{ minWidth: 40, minHeight: 40, display: "grid", placeItems: "center" }}
            >
              <Bell size={20} color="hsl(var(--fyn-ink) / 0.7)" />
              <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "#C41E1E" }} />
            </button>

            <div className="relative ml-1">
            <button
              onClick={() => setMenuOpen((s) => !s)}
              className="flex items-center gap-3 rounded-xl pl-2 pr-3 py-1.5 hover:bg-[hsl(var(--fyn-ink)/0.04)]"
              style={{ minHeight: 44 }}
            >
              <span
                className="grid place-items-center rounded-full text-white"
                style={{
                  width: 36, height: 36,
                  background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
                  fontFamily: "Raleway, sans-serif", fontWeight: 700, fontSize: 13,
                }}
              >{initials}</span>
              <div className="hidden sm:flex flex-col items-start leading-tight">
                <span style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>
                  {user?.email?.split("@")[0] ?? "Admin"}
                </span>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "hsl(var(--fyn-gold))", fontWeight: 600 }}>
                  {primaryRole ? ROLE_LABEL[primaryRole] : "Admin"}
                </span>
              </div>
              <ChevronDown size={16} color="hsl(var(--fyn-ink) / 0.5)" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  className="absolute right-0 mt-2 w-56 z-20 overflow-hidden rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.98)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid hsl(var(--fyn-gold) / 0.2)",
                    boxShadow: "0 12px 32px hsl(var(--fyn-ink) / 0.15)",
                  }}
                >
                  {isSuperAdmin && (
                    <button
                      onClick={() => { setMenuOpen(false); nav("/admin/ceo-view"); toast.info("Switched to CEO Strategic View"); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--fyn-ink)/0.05)] text-left"
                      style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))" }}
                    >
                      <Lock size={14} color="hsl(var(--fyn-gold))" /> CEO View
                    </button>
                  )}
                  <button
                    onClick={async () => { await signOut(); nav("/admin/login"); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--fyn-ink)/0.05)] text-left"
                    style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))" }}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: mainPad, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
