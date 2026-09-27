import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import {
  PanelLeft, PanelRight, Menu, Search, Bell,
  Droplets, TrendingUp, DollarSign, FileText, Shield, Users,
  BarChart3, MessageSquare, FileBarChart, ArrowLeftRight, Plug,
  Settings, LayoutDashboard, CheckCircle, AlertTriangle, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenMobileDrawer: () => void;
}

const INK = "#171208";
const RED = "#A93838";
const MUTED = "rgba(23,18,8,0.62)";
const SUB = "#9E9E9E";
const SURFACE = "#F5F2EC";
const BORDER = "rgba(23,18,8,0.08)";

type BadgeDef = { icon: any; name: string; sub?: string; settings?: boolean };

function getSettingsSub(path: string): string {
  if (path.includes("personal")) return "Personal Info";
  if (path.includes("security")) return "Security";
  if (path.includes("notifications")) return "Notifications";
  if (path.includes("language")) return "Language & Region";
  if (path.includes("business")) return "Business Profile";
  if (path.includes("team")) return "Team & Access";
  if (path.includes("ca-access")) return "CA Access";
  if (path.includes("billing")) return "Billing";
  return "Account";
}

function getPageBadge(path: string): BadgeDef {
  const p = path.toLowerCase();
  if (p.includes("liquidity")) return { icon: Droplets, name: "Liquidity", sub: "Intelligence" };
  if (p.includes("revenue")) return { icon: TrendingUp, name: "Revenue", sub: "Intelligence" };
  if (p.includes("cost")) return { icon: DollarSign, name: "Cost", sub: "Intelligence" };
  if (p.includes("gst")) return { icon: FileText, name: "GST & Tax", sub: "Intelligence" };
  if (p.includes("governance") || p.includes("compliance")) return { icon: Shield, name: "Governance", sub: "Intelligence" };
  if (p.includes("/hr")) return { icon: Users, name: "HR & Workforce", sub: "Intelligence" };
  if (p.includes("investor")) return { icon: BarChart3, name: "Investor", sub: "Intelligence" };
  if (p.includes("fynny") || p.includes("nidhi")) return { icon: MessageSquare, name: "Ask Fynny", sub: "AI CFO" };
  if (p.includes("reports")) return { icon: FileBarChart, name: "Reports" };
  if (p.includes("transactions") || p.includes("data-import")) return { icon: ArrowLeftRight, name: "Transactions" };
  if (p.includes("integrations")) return { icon: Plug, name: "Integrations" };
  if (p.includes("settings")) return { icon: Settings, name: "Settings", sub: getSettingsSub(p), settings: true };
  return { icon: LayoutDashboard, name: "Dashboard" };
}

function isIntelligenceRoute(path: string) {
  const p = path.toLowerCase();
  return ["liquidity", "revenue", "cost", "gst", "governance", "compliance", "/hr", "investor", "fynny", "nidhi", "cockpit"].some(k => p.includes(k));
}

function getSearchPlaceholder(path: string) {
  const p = path.toLowerCase();
  if (p.includes("reports")) return "Search reports…";
  if (p.includes("transactions") || p.includes("data-import")) return "Search transactions…";
  if (p.includes("settings")) return "Search settings…";
  if (isIntelligenceRoute(path)) return "Search customers, invoices…";
  return "Search…";
}

export default function GlobalHeader({ sidebarOpen, onToggleSidebar, onOpenMobileDrawer }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, businessId } = useAuth();
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [badgeKey, setBadgeKey] = useState(location.pathname);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDemo = location.pathname.startsWith("/demo");
  const badge = useMemo(() => getPageBadge(location.pathname), [location.pathname]);
  const showLive = isIntelligenceRoute(location.pathname) && !location.pathname.toLowerCase().includes("cockpit") ? true : isIntelligenceRoute(location.pathname);
  const placeholder = getSearchPlaceholder(location.pathname);

  useEffect(() => {
    const r = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);

  useEffect(() => {
    setBadgeKey(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // hook into existing palette if available
        const ev = new CustomEvent("fynhelp:open-search");
        window.dispatchEvent(ev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // GST badge state
  const [gst, setGst] = useState<{ state: "filed" | "due" | "overdue"; days: number; label: string } | null>(
    isDemo ? { state: "due", days: 8, label: "GSTR-3B in 8d" } : null,
  );

  useEffect(() => {
    if (isDemo || !businessId) return;
    let cancelled = false;
    (async () => {
      try {
        // Try demo table first (seeded data uses gst_filings_demo with capitalised
        // status values + filing_type column). Falls back to real gst_filings.
        const demoRes = await (supabase as any)
          .from("gst_filings_demo")
          .select("due_date, filing_type, status")
          .eq("business_id", businessId)
          .in("status", ["Pending", "Overdue"])
          .order("due_date", { ascending: true })
          .limit(1);

        let row: any = demoRes?.data?.[0];
        let periodField = "filing_type";

        if (!row) {
          const realRes = await (supabase as any)
            .from("gst_filings")
            .select("due_date, return_type, status")
            .eq("business_id", businessId)
            .in("status", ["pending", "overdue"])
            .order("due_date", { ascending: true })
            .limit(1);
          row = realRes?.data?.[0];
          periodField = "return_type";
        }

        if (cancelled) return;
        if (!row || !row.due_date) {
          // Empty != filed — hide the badge rather than show a false-positive "GST ✓".
          setGst(null);
          return;
        }
        const days = Math.ceil((new Date(row.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const period = row[periodField] || "GSTR-3B";
        if (days <= 0) setGst({ state: "overdue", days, label: `${period} overdue!` });
        else if (days <= 14) setGst({ state: "due", days, label: `${period} in ${days}d` });
        else setGst({ state: "filed", days, label: "GST ✓" });
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [isDemo, businessId]);

  const unreadCount = isDemo ? 3 : 0;
  const isOverdue = gst?.state === "overdue";

  const initials = useMemo(() => {
    if (isDemo) return "T";
    const name = profile?.full_name || user?.email || "U";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [isDemo, profile, user]);

  const BadgeIcon = badge.icon;
  const badgeIconBg = badge.settings ? "rgba(23,18,8,0.62)" : RED;

  const headerBorder = isOverdue ? "0.5px solid rgba(169,56,56,0.3)" : `0.5px solid ${BORDER}`;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const Divider = () => (
    <span style={{ width: 1, height: 16, background: "rgba(23,18,8,0.1)", flexShrink: 0 }} />
  );

  return (
    <header
      style={{
        height: 46,
        background: "#FFFFFF",
        borderBottom: headerBorder,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Toggle / hamburger */}
      {isMobile ? (
        <button
          onClick={onOpenMobileDrawer}
          aria-label="Open menu"
          style={iconBtn()}
        >
          <Menu size={16} color={MUTED} />
        </button>
      ) : (
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          style={iconBtn()}
        >
          {sidebarOpen ? <PanelLeft size={16} color={MUTED} /> : <PanelRight size={16} color={MUTED} />}
        </button>
      )}

      {!isMobile && <Divider />}

      {/* Logo */}
      <Link to="/dashboard" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", flexShrink: 0 }}>
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" aria-hidden>
          <rect x="1" y="1" width="22" height="22" rx="3" stroke={INK} strokeWidth="1.5" />
          <line x1="5" y1="17" x2="10" y2="17" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <line x1="5" y1="13" x2="13" y2="13" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <line x1="5" y1="9" x2="8" y2="9" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="14" x2="18" y2="6" stroke={RED} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="18" cy="6" r="2" fill={RED} />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.02em", color: INK }}>
          Fyn<span style={{ color: RED }}>Help</span>
        </span>
      </Link>

      {!isMobile && <Divider />}

      {/* Page badge */}
      <div
        key={badgeKey}
        style={{
          background: "#EFE8D8",
          border: "0.5px solid rgba(169,56,56,0.2)",
          borderRadius: 20,
          padding: isMobile ? "3px" : "3px 10px 3px 6px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          animation: "fyn-fade-in 150ms ease",
        }}
        title={isMobile ? badge.name : undefined}
      >
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          background: badgeIconBg, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <BadgeIcon size={10} color="#FFFFFF" />
        </span>
        {!isMobile && (
          <>
            <span style={{ fontSize: 11, fontWeight: 500, color: INK }}>{badge.name}</span>
            {badge.sub && <span style={{ fontSize: 10, color: SUB }}>{badge.sub}</span>}
          </>
        )}
      </div>

      {/* Search */}
      <div
        onClick={() => window.dispatchEvent(new CustomEvent("fynhelp:open-search"))}
        style={{
          flex: 1,
          maxWidth: 240,
          background: SURFACE,
          borderRadius: 8,
          padding: isMobile ? "6px 8px" : "5px 11px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          minWidth: isMobile ? 32 : 0,
        }}
        role="button"
        aria-label="Search"
      >
        <Search size={13} color={SUB} />
        {!isMobile && (
          <>
            <span style={{ fontSize: 11, color: "#B0ABA4", flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>
              {placeholder}
            </span>
            <span style={{
              fontSize: 9, color: "#B0ABA4",
              background: "rgba(23,18,8,0.07)", borderRadius: 4, padding: "1px 5px",
              marginLeft: "auto",
            }}>
              ⌘K
            </span>
          </>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {/* Live dot */}
        {!isMobile && isIntelligenceRoute(location.pathname) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#1F5A46",
              animation: "fyn-pulse 2s infinite",
            }} />
            <span style={{ fontSize: 10, color: MUTED }}>Live</span>
          </div>
        )}

        {/* GST badge */}
        {gst && (
          <button
            onClick={() => navigate("/dashboard/gst")}
            style={{
              ...gstBadgeStyle(gst.state),
              padding: isMobile ? "4px 6px" : "3px 9px",
              cursor: "pointer",
              transition: "background 200ms ease, color 200ms ease",
            }}
            aria-label={gst.label}
          >
            {gst.state === "filed" && <CheckCircle size={11} />}
            {gst.state === "due" && <AlertTriangle size={11} />}
            {gst.state === "overdue" && <AlertCircle size={11} />}
            {!isMobile && <span>{gst.label}</span>}
          </button>
        )}

        {/* Bell */}
        <button
          aria-label="Notifications"
          style={{
            ...iconBtn(),
            background: isOverdue ? "#FCEBEB" : SURFACE,
            position: "relative",
          }}
        >
          <Bell size={15} color={isOverdue ? RED : MUTED} />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: 5, right: 5,
              width: 7, height: 7, borderRadius: "50%",
              background: RED, border: "1.5px solid white",
            }} />
          )}
        </button>

        {/* Avatar */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="User menu"
            style={{
              width: 32, height: 32, borderRadius: 8, background: RED,
              color: "#FFFFFF", fontSize: 11, fontWeight: 500,
              border: "none", cursor: "pointer", flexShrink: 0,
            }}
          >
            {initials}
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                background: "#FFFFFF",
                border: `0.5px solid ${BORDER}`,
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(23,18,8,0.08)",
                minWidth: 200,
                padding: 6,
                zIndex: 60,
                animation: "fyn-pop 150ms ease",
              }}
            >
              <div style={{ padding: "8px 10px 10px", borderBottom: `0.5px solid ${BORDER}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>
                  {isDemo ? "Tarun" : profile?.full_name || "User"}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                  {isDemo ? "demo@fynhelp.com" : user?.email}
                </div>
              </div>
              <MenuItem onClick={() => { setMenuOpen(false); navigate("/dashboard/settings/profile"); }}>
                Profile & Settings
              </MenuItem>
              <div style={{ height: 1, background: BORDER, margin: "4px 0" }} />
              <MenuItem onClick={() => { setMenuOpen(false); handleLogout(); }}>
                Log out
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fyn-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes fyn-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fyn-pop { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </header>
  );
}

function MenuItem({ children, onClick }: { children: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "7px 10px", background: "transparent", border: "none",
        cursor: "pointer", borderRadius: 6, fontSize: 12, color: INK,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = SURFACE)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function iconBtn(): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 8, background: SURFACE,
    border: "none", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
    position: "relative",
  };
}

function gstBadgeStyle(state: "filed" | "due" | "overdue"): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 9, fontWeight: 500, borderRadius: 20,
    display: "flex", alignItems: "center", gap: 3,
    border: "none", flexShrink: 0,
  };
  if (state === "filed") return { ...base, background: "#EAF3DE", color: "#27500A" };
  if (state === "due") return { ...base, background: "#FAEEDA", color: "#633806" };
  return { ...base, background: "#FCEBEB", color: "#791F1F" };
}
