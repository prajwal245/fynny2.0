import { useEffect, useState } from "react";
import { Outlet, useLocation } from "@/lib/router-compat";
import { Menu } from "lucide-react";
import CASidebar from "./CASidebar";
import CAAuthGuard from "./CAAuthGuard";
import CAMfaBanner from "./CAMfaBanner";
import { CA } from "./portalUi";
import { useIsCompactPortal } from "@/hooks/useMediaQuery";
import FynLogo from "@/components/FynLogo";

export default function CAPortalLayout() {
  const compact = useIsCompactPortal();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    console.log("[fyn:ca] phase-1-complete sidebar-rebuilt logo-updated design-tokens-applied");
  }, []);

  // Close the drawer on route change and whenever we grow back to desktop.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => { if (!compact) setOpen(false); }, [compact]);

  // Lock background scroll and allow Escape to dismiss the drawer.
  useEffect(() => {
    if (!compact || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [compact, open]);



  return (
    <CAAuthGuard>
      <div className="min-h-screen ca-portal" style={{ background: CA.page }}>
        <style>{`
          .ca-portal .bg-white { background: ${CA.card} !important; }
          .ca-portal .hover\\:bg-\\[\\#F8F6F1\\]:hover { background: rgba(23,18,8,0.045) !important; }
          .ca-portal, .ca-portal input, .ca-portal select, .ca-portal button, .ca-portal textarea { font-family: ${CA.sans}; }
        `}</style>
        <CASidebar drawer={compact} open={!compact || open} onNavigate={() => setOpen(false)} />

        {compact && open && (
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(26,26,26,0.35)", border: "none", padding: 0 }}
          />
        )}

        <main
          className="ca-portal-main"
          style={{
            marginLeft: compact ? 0 : 236,
            padding: compact ? "12px 14px 28px" : "28px 32px",
            minHeight: "100vh",
          }}
        >
          {compact && (
            <div
              className="flex items-center gap-3"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 30,
                margin: "-12px -14px 12px",
                padding: "10px 14px",
                background: CA.card,
                borderBottom: `0.5px solid ${CA.line}`,
              }}
            >
              <button
                aria-label="Open menu"
                onClick={() => setOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 44, height: 44, marginLeft: -10, borderRadius: 10,
                  background: "transparent", border: "none", color: CA.ink, cursor: "pointer",
                }}
              >
                <Menu size={20} />
              </button>
              <FynLogo variant="dark" size="sm" />
              <div
                style={{
                  fontFamily: CA.sans, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: CA.teal,
                }}
              >
                CA Portal
              </div>
            </div>
          )}
          <CAMfaBanner />
          <Outlet />
        </main>
      </div>
    </CAAuthGuard>
  );
}
