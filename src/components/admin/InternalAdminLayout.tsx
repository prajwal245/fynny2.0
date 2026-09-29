import { NavLink, Outlet } from "@/lib/router-compat";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const TEAL = "#A93838";
const INK = "#171208";

const LINKS = [{ to: "/admin/ca-approvals", label: "CA Approvals", icon: ShieldCheck }];

/** Minimal internal-admin chrome for the email-allowlisted tools. */
export default function AdminLayout() {
  const [email, setEmail] = useState("");
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? "");
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F2EEE7", color: INK, fontFamily: "'Instrument Sans', Inter, sans-serif" }}>
      <header
        style={{
          height: 64, background: "#FFFFFF", borderBottom: "1px solid rgba(26,26,26,0.10)",
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
          position: "sticky", top: 0, zIndex: 20,
        }}
      >
        <span style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: TEAL }}>
          FynHelp Admin
        </span>
        <span style={{ fontSize: 13, color: "rgba(26,26,26,0.6)" }}>{email}</span>
      </header>

      <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 64px)" }}>
        <aside
          style={{
            width: 232, background: "#FFFFFF", borderRight: "1px solid rgba(26,26,26,0.10)",
            padding: "18px 12px", flexShrink: 0,
          }}
          className="hidden md:block"
        >
          {LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                style={({ isActive }) => ({
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 9, textDecoration: "none", fontSize: 14, fontWeight: 600,
                  background: isActive ? TEAL : "transparent",
                  color: isActive ? "#FFFFFF" : "rgba(26,26,26,0.72)",
                })}
              >
                <Icon size={17} /> {l.label}
              </NavLink>
            );
          })}
        </aside>

        <main style={{ flex: 1, padding: 28, overflowX: "hidden" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
