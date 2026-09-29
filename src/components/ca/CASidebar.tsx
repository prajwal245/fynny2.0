import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "@/lib/router-compat";
import {
  LayoutGrid, Users, Bell, Settings, LogOut,
  Archive, Scale, AlertTriangle, CalendarCheck, FileStack, ListTodo, BellRing, ShieldCheck,
  BarChart3, Receipt, FileText, UserCog, MonitorSmartphone, Plug, Inbox, CheckCheck,
  Brain, TrendingUp, CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { CA } from "./portalUi";
import { C } from "@/components/site/siteTheme";
import FynLogo from "@/components/FynLogo";
import { toast } from "sonner";

type NavItem = { label: string; path: string; icon: typeof LayoutGrid; badge?: "urgent" | "unread"; roleRequired?: "admin" };

const GROUPS: { group: string; links: NavItem[] }[] = [
  {
    group: "Now",
    links: [
      { label: "Portfolio", path: "/ca/dashboard", icon: LayoutGrid, badge: "urgent" },
      { label: "Exceptions", path: "/ca/exceptions", icon: AlertTriangle, badge: "urgent" },
      { label: "Alert Monitor", path: "/ca/notifications", icon: Bell, badge: "unread" },
    ],
  },
  {
    group: "Workflow",
    links: [
      { label: "Intake", path: "/ca/intake/inbox", icon: Inbox },
      { label: "Review queue", path: "/ca/intake/review", icon: CheckCheck },
      { label: "Reconciliation", path: "/ca/reconciliation", icon: Scale },
      { label: "Exceptions", path: "/ca/exceptions", icon: AlertTriangle },
    ],
  },
  {
    group: "Practice",
    links: [
      { label: "Clients", path: "/ca/clients", icon: Users },
      { label: "Tasks", path: "/ca/tasks", icon: ListTodo },
      { label: "Month-end close", path: "/ca/close", icon: CalendarCheck },
      { label: "Chaser queue", path: "/ca/chaser", icon: BellRing },
    ],
  },
  {
    group: "Compliance",
    links: [
      { label: "Filing calendar", path: "/ca/filing-calendar", icon: CalendarCheck },
      { label: "GST portfolio", path: "/ca/gst-portfolio", icon: Receipt },
      { label: "ITC recon", path: "/ca/itc-recon", icon: Scale, roleRequired: "admin" },
      { label: "TDS tracker", path: "/ca/tds-tracker", icon: FileText },
      { label: "Compliance", path: "/ca/compliance", icon: ShieldCheck },
    ],
  },
  {
    group: "Process",
    links: [
      { label: "Working papers", path: "/ca/working-papers", icon: FileStack },
      { label: "Reports", path: "/ca/reports", icon: FileText },
      { label: "Evidence vault", path: "/ca/vault", icon: Archive },
    ],
  },
  {
    group: "Intelligence",
    links: [
      { label: "Practice analytics", path: "/ca/practice-analytics", icon: BarChart3 },
      { label: "Portfolio health", path: "/ca/portfolio-health", icon: TrendingUp },
      { label: "Brain insights", path: "/ca/brain-insights", icon: Brain },
    ],
  },
  {
    group: "Data",
    links: [
      { label: "Integrations", path: "/ca/integrations", icon: Plug },
      { label: "Ledgers", path: "/ca/ledgers", icon: FileStack },
      { label: "Data quality", path: "/ca/data-quality", icon: ShieldCheck },
    ],
  },
  {
    group: "Firm",
    links: [
      { label: "Billing", path: "/ca/billing", icon: CreditCard, roleRequired: "admin" },
      { label: "Users and Roles", path: "/ca/users", icon: UserCog, roleRequired: "admin" },
      { label: "Client portal", path: "/ca/client-portal", icon: MonitorSmartphone },
      { label: "Audit trail", path: "/ca/audit-trail", icon: ShieldCheck, roleRequired: "admin" },
      { label: "Settings", path: "/ca/settings", icon: Settings },
    ],
  },
];

export default function CASidebar({
  open = false,
  onNavigate,
  drawer = false,
}: {
  open?: boolean;
  onNavigate?: () => void;
  drawer?: boolean;
}) {
  const { firmId, firmName, caName, caRole } = useCAPortal();
  const isAdmin = caRole === "admin" || caRole === "partner";
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("ca_notifications")
        .select("id", { count: "exact", head: true })
        .eq("ca_firm_id", firmId)
        .eq("is_read", false);
      if (!cancelled) setUnread(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: clients } = await supabase
          .from("ca_clients")
          .select("business_id")
          .eq("ca_firm_id", firmId);
        const businessIds = (clients ?? [])
          .map((c) => c.business_id)
          .filter((id): id is string => !!id);
        let overdue = 0;
        if (businessIds.length > 0) {
          const { count } = await supabase
            .from("ca_compliance_events")
            .select("id", { count: "exact", head: true })
            .in("business_id", businessIds)
            .neq("status", "filed")
            .lt("due_date", today);
          overdue = count ?? 0;
        }
        const { count: mismatched } = await supabase
          .from("ca_itc_records")
          .select("id", { count: "exact", head: true })
          .eq("ca_firm_id", firmId)
          .eq("match_status", "mismatched")
          .eq("is_demo", false);
        const { count: pendingVerif } = await supabase
          .from("ca_document_extractions")
          .select("id", { count: "exact", head: true })
          .eq("ca_firm_id", firmId)
          .eq("review_state", "pending_verification");
        if (!cancelled) setUrgentCount(overdue + (mismatched ?? 0) + (pendingVerif ?? 0));
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/ca/login", { replace: true });
  };

  const signOutAllDevices = async () => {
    const confirmed = window.confirm(
      "This will sign you out on all browsers and devices. You will need to sign in again on each device. Continue?"
    );
    if (!confirmed) return;
    // Global sign out revokes all refresh tokens for this user.
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      toast.error(error.message);
      return;
    }
    localStorage.removeItem("fyn.sessionOnly");
    sessionStorage.removeItem("fyn.sessionOnly");
    toast.success("Signed out from all devices");
    navigate("/ca/login", { replace: true });
  };

  return (
    <aside
      className="fixed inset-y-0 left-0 flex flex-col z-50"
      style={{
        width: 236,
        maxWidth: "84vw",
        background: "#FFFFFF",
        borderRight: `0.5px solid ${CA.line}`,
        transform: drawer && !open ? "translateX(-100%)" : "translateX(0)",
        transition: drawer ? "transform 200ms ease" : undefined,
        boxShadow: drawer && open ? "0 0 40px rgba(0,0,0,0.18)" : undefined,
      }}
    >
      <div style={{ padding: "22px 20px 16px" }}>
        <FynLogo variant="dark" size="md" />
        <div style={{ fontFamily: CA.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.maroon, marginTop: 8 }}>
          CA Portal
        </div>
        <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 12 }}>
          {firmName ?? "Firm"}
        </div>
        {caName && <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint }}>{caName}</div>}
      </div>

      <nav style={{ padding: "6px 12px", flex: 1, overflowY: "auto" }}>
        {GROUPS.map(({ group, links }) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: CA.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: CA.faint, padding: "6px 12px 4px" }}>
              {group}
            </div>
            {links.filter((l) => !l.roleRequired || isAdmin).map(({ label, path, icon: Icon, badge }) => {
              const count = badge === "urgent" ? urgentCount : badge === "unread" ? unread : 0;
              return (
                <NavLink
                  key={group + path + label}
                  to={path}
                  className="ca-nav-link"
                  end={path === "/ca/clients"}
                  onClick={onNavigate}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 9, marginBottom: 1,
                    fontFamily: CA.sans, fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? C.maroon : CA.ink,
                    background: isActive ? "rgba(169,56,56,0.08)" : "transparent",
                    textDecoration: "none",
                  })}
                >
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {count > 0 && (
                    <span style={{ fontFamily: CA.mono, fontSize: 10.5, fontWeight: 700, color: C.onDark, fontVariantNumeric: "tabular-nums", background: C.maroon, borderRadius: 999, padding: "1px 7px" }}>
                      {count}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        onClick={signOut}
        style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 12px 6px", padding: "9px 12px", borderRadius: 9, background: "transparent", border: "none", fontFamily: CA.sans, fontSize: 13, color: CA.muted, cursor: "pointer" }}
      >
        <LogOut size={15} /> Sign out
      </button>
      <button
        onClick={signOutAllDevices}
        style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 12px 18px", padding: "4px 12px", borderRadius: 9, background: "transparent", border: "none", fontFamily: CA.sans, fontSize: 12, color: C.maroon, cursor: "pointer" }}
      >
        Sign out all devices
      </button>
    </aside>
  );
}
