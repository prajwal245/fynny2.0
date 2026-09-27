import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "@/lib/router-compat";
import {
  LayoutDashboard, MessageSquare, Droplets, TrendingUp, DollarSign,
  FileText, Users, BarChart3, Upload,
  ArrowLeftRight, FileBarChart, Plug, Building, Settings,
  X, ChevronLeft, ChevronRight, ChevronUp,
} from "lucide-react";
import { motion } from "framer-motion";
import FynLogo from "@/components/FynLogo";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}

export const SIDEBAR_WIDTH_EXPANDED = 180;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

type Item = { icon: any; label: string; path: string; soon?: boolean };
type Section = { title: string; items: Item[] };

const menuSections: Section[] = [
  {
    title: "OVERVIEW",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard/cockpit" },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { icon: Droplets, label: "Liquidity", path: "/dashboard/liquidity" },
      { icon: TrendingUp, label: "Revenue", path: "/dashboard/revenue-intelligence" },
      { icon: DollarSign, label: "Cost", path: "/dashboard/cost" },
      { icon: FileText, label: "GST & Tax", path: "/dashboard/gst" },
      { icon: BarChart3, label: "Investor", path: "/dashboard/investor" },
      { icon: MessageSquare, label: "Ask Fynny", path: "/dashboard/fynny-chat" },
      { icon: Users, label: "My CA", path: "/dashboard/my-ca" },
    ],
  },
  {
    title: "DATA",
    items: [
      { icon: ArrowLeftRight, label: "Transactions", path: "/dashboard/data-import" },
      { icon: Upload, label: "Import Data", path: "/dashboard/import" },
      { icon: FileBarChart, label: "Reports", path: "/dashboard/reports" },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { icon: Plug, label: "Integrations", path: "/dashboard/settings/integrations" },
      { icon: Building, label: "Business", path: "/dashboard/settings/business" },
      { icon: Settings, label: "Account", path: "/dashboard/settings/profile" },
    ],
  },
];

const ACTIVE = "#A93838";
const INK = "#171208";
const INACTIVE_ICON = "#9E9E9E";
const INACTIVE_TEXT = "rgba(23,18,8,0.62)";

const Divider = ({ collapsed }: { collapsed: boolean }) => (
  <div
    style={{
      height: "0.5px",
      background: "rgba(23,18,8,0.05)",
      margin: collapsed ? "6px 10px" : "4px 14px",
    }}
  />
);

function getInitials(name?: string | null, email?: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "T";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 1).toUpperCase();
}

export default function Sidebar({ isOpen, onToggle, collapsed, onCollapsedChange }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const [isDesktop, setIsDesktop] = useState(typeof window !== "undefined" ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isActive = (path: string) => location.pathname === path;
  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const visible = isDesktop || isOpen;

  const fullName = profile?.full_name || (user?.email ? user.email.split("@")[0] : "User");
  const role = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Owner";
  const initials = getInitials(profile?.full_name, user?.email);

  const handleUserClick = () => navigate("/dashboard/settings/profile");

  return (
    <>
      {isOpen && !isDesktop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <motion.aside
        initial={false}
        animate={{ width, x: visible ? 0 : -width }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="fixed top-0 left-0 h-full z-50 flex flex-col bg-white"
        style={{
          overflowY: "auto",
          overflowX: "hidden",
          minWidth: width,
          maxWidth: width,
          borderRight: "1px solid rgba(23,18,8,0.06)",
        }}
      >
        {/* Logo */}
        {collapsed ? (
          <div
            style={{
              padding: "12px 0",
              display: "flex",
              justifyContent: "center",
              borderBottom: "0.5px solid rgba(23,18,8,0.06)",
              marginBottom: 6,
            }}
          >
            <button
              onClick={() => navigate("/dashboard/cockpit")}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              aria-label="Go to dashboard"
            >
              <FynLogo variant="dark" showTagline={false} iconOnly />
            </button>
          </div>
        ) : (
          <>
            <div
              className="flex items-center justify-between"
              style={{ padding: "20px 16px 8px", minHeight: 60 }}
            >
              <button
                onClick={() => navigate("/dashboard/cockpit")}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Go to dashboard"
              >
                <FynLogo variant="dark" showTagline={false} iconOnly={false} />
              </button>

              <button
                onClick={() => onCollapsedChange(true)}
                className="hidden lg:flex items-center justify-center rounded-md"
                style={{
                  width: 24, height: 24, background: "transparent", border: "none", cursor: "pointer",
                  color: INACTIVE_ICON,
                }}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>

              <button
                onClick={onToggle}
                className="lg:hidden"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: INACTIVE_ICON }}
                aria-label="Close menu"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            {/* Plan badge */}
            <div
              style={{
                background: "#EFE8D8",
                borderRadius: 6,
                padding: "5px 10px",
                margin: "8px 12px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 500, color: INK }}>Early Access</span>
              <span
                style={{
                  background: "#FAEEDA",
                  color: "#633806",
                  fontSize: 8,
                  fontWeight: 500,
                  padding: "2px 6px",
                  borderRadius: 20,
                }}
              >
                Free
              </span>
            </div>
          </>
        )}

        {collapsed && (
          <button
            onClick={() => onCollapsedChange(false)}
            className="hidden lg:flex items-center justify-center mx-auto rounded-md"
            style={{
              width: 28, height: 28, background: "transparent", border: "none", cursor: "pointer",
              color: INACTIVE_ICON, marginBottom: 4,
            }}
            aria-label="Expand sidebar"
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
        )}

        <nav
          className="flex-1"
          style={{ padding: collapsed ? "4px 0" : "4px 8px" }}
        >
          {menuSections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              {sectionIdx > 0 && <Divider collapsed={collapsed} />}

              {!collapsed && (
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    color: ACTIVE,
                    textTransform: "uppercase",
                    padding: "10px 12px 4px",
                    margin: 0,
                  }}
                >
                  {section.title}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);

                  if (collapsed) {
                    return (
                      <div
                        key={item.path}
                        className="relative group"
                        style={{ display: "flex", justifyContent: "center" }}
                      >
                        <button
                          onClick={() => {
                            navigate(item.path);
                            if (!isDesktop) onToggle();
                          }}
                          style={{
                            width: 40,
                            height: 34,
                            borderRadius: 8,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "2px auto",
                            cursor: "pointer",
                            background: active ? "rgba(169,56,56,0.10)" : "transparent",
                            border: "none",
                            position: "relative",
                            color: active ? ACTIVE : INACTIVE_ICON,
                            transition: "background 0.15s ease, color 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!active) e.currentTarget.style.background = "rgba(23,18,8,0.04)";
                          }}
                          onMouseLeave={(e) => {
                            if (!active) e.currentTarget.style.background = "transparent";
                          }}
                          aria-current={active ? "page" : undefined}
                          aria-label={item.label}
                        >
                          <Icon size={18} strokeWidth={1.75} style={{ color: "currentColor" }} />
                          {item.soon && (
                            <span
                              style={{
                                position: "absolute",
                                top: 4,
                                right: 6,
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: ACTIVE,
                              }}
                            />
                          )}
                        </button>

                        <div
                          className="absolute opacity-0 group-hover:opacity-100 pointer-events-none"
                          style={{
                            left: "calc(100% + 8px)",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: INK,
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 400,
                            padding: "5px 10px",
                            borderRadius: 7,
                            whiteSpace: "nowrap",
                            zIndex: 100,
                            transition: "opacity 120ms ease",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          }}
                        >
                          {item.label}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        if (!isDesktop) onToggle();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: active ? "rgba(169,56,56,0.07)" : "transparent",
                        borderLeft: active ? `2px solid ${ACTIVE}` : "2px solid transparent",
                        borderTop: "none",
                        borderRight: "none",
                        borderBottom: "none",
                        cursor: "pointer",
                        borderRadius: active ? "0 8px 8px 0" : 8,
                        padding: "7px 10px",
                        width: "100%",
                        height: 34,
                        color: active ? INK : INACTIVE_TEXT,
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: active ? 500 : 400,
                        transition: "background 0.15s ease, color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.background = "rgba(23,18,8,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = "transparent";
                      }}
                      aria-current={active ? "page" : undefined}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          background: active ? "rgba(169,56,56,0.12)" : "transparent",
                          color: active ? ACTIVE : INACTIVE_ICON,
                        }}
                      >
                        <Icon size={16} strokeWidth={1.75} style={{ color: "currentColor" }} />
                      </span>

                      <span
                        style={{
                          flex: 1,
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "currentColor",
                        }}
                      >
                        {item.label}
                      </span>
                      {item.soon && (
                        <span
                          style={{
                            fontSize: 9,
                            fontStyle: "italic",
                            color: "#9B9B9B",
                            fontWeight: 400,
                            flexShrink: 0,
                          }}
                        >
                          Soon
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile bottom */}
        <div
          style={{
            marginTop: "auto",
            borderTop: "0.5px solid rgba(23,18,8,0.06)",
            padding: collapsed ? "10px 0" : "10px 8px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {collapsed ? (
            <button
              onClick={handleUserClick}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: ACTIVE,
                color: "#fff",
                fontSize: 11,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: "none",
              }}
              aria-label="Open user menu"
            >
              {initials}
            </button>
          ) : (
            <button
              onClick={handleUserClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(23,18,8,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-label="Open user menu"
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: ACTIVE,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {initials}
              </span>
              <span style={{ flex: 1, textAlign: "left", overflow: "hidden" }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 500,
                    color: INK,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {fullName}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 9,
                    color: "#9E9E9E",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {role}
                </span>
              </span>
              <ChevronUp size={13} strokeWidth={1.75} style={{ color: "#9E9E9E", flexShrink: 0 }} />
            </button>
          )}
        </div>
      </motion.aside>
    </>
  );
}
