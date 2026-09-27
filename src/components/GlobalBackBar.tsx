import { useNavigate, useLocation, Link } from "@/lib/router-compat";
import { ChevronLeft, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const pageTitles: Record<string, string> = {
  "/": "Home",
  "/solutions": "Solutions",
  "/pricing": "Pricing",
  "/resources": "Resources",
  "/blog": "Blog",
  "/community": "Community",
  "/about": "About",
  "/signup": "Sign Up",
  "/signin": "Sign In",
  "/onboarding": "Onboarding",
  "/dashboard/cockpit": "Cockpit",
  "/dashboard/360": "360 Dashboard",
  "/dashboard/cash-flow": "Cash Flow",
  "/dashboard/receivables": "Receivables",
  "/dashboard/simulator": "Simulator",
  "/dashboard/gst": "GST Intelligence",
  "/dashboard/hr": "HR Intelligence",
  "/dashboard/filing-calendar": "Filing Calendar",
  "/dashboard/fynny-chat": "Talk to CFO Fynny",
  "/dashboard/reports": "CFO Reports",
};

export default function GlobalBackBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname.startsWith("/dashboard");
  const isHome = location.pathname === "/";

  const homeHref = isDashboard ? "/dashboard/cockpit" : "/";
  const homeLabel = isDashboard ? "Cockpit" : "Home";

  // Build breadcrumb segments
  const segments: { label: string; href?: string }[] = [{ label: homeLabel, href: homeHref }];

  if (!isHome && !(isDashboard && location.pathname === "/dashboard/cockpit")) {
    // Handle blog article slugs
    if (location.pathname.startsWith("/blog/") && location.pathname !== "/blog") {
      segments.push({ label: "Blog", href: "/blog" });
      const slug = location.pathname.split("/blog/")[1] || "";
      segments.push({ label: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) });
    } else {
      const title = pageTitles[location.pathname] || location.pathname.split("/").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "";
      segments.push({ label: title });
    }
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(homeHref);
    }
  };

  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) < 6) return;
      // Only hide once we're past the navbar area
      if (delta > 0 && y > 80) setHidden(true);
      else if (delta < 0) setHidden(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isHome) return null;

  return (
    <div
      className="w-full flex items-center sticky"
      style={{
        height: 44,
        background: "#EDE4CB",
        borderBottom: "1px solid rgba(23,18,8,0.10)",
        top: 72,
        backdropFilter: "blur(8px)",
        zIndex: 10,
        transform: hidden ? "translateY(-120%)" : "translateY(0)",
        transition: "transform 250ms ease",
      }}
    >
      <div
        className="w-full flex items-center"
        style={{ padding: "0 48px" }}
      >
        {/* Left side */}
        <div className="flex items-center" style={{ gap: 20 }}>
          {/* Back button */}
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer rounded"
            style={{
              padding: "6px 12px",
              transition: "all 200ms cubic-bezier(0.25, 0.1, 0.25, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139,105,20,0.10)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.97)";
              e.currentTarget.style.background = "rgba(139,105,20,0.18)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.background = "rgba(139,105,20,0.10)";
            }}
          >
            <ChevronLeft size={14} strokeWidth={1.5} color="#8B6914" />
            <span className="text-accent" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 13, color: "#8B6914" }}>
              Back
            </span>
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 18, background: "rgba(23,18,8,0.15)", margin: "0 4px" }} />

          {/* Home button */}
          <Link
            to={homeHref}
            className="flex items-center gap-1.5 no-underline rounded"
            style={{
              padding: "6px 12px",
              transition: "all 200ms cubic-bezier(0.25, 0.1, 0.25, 1)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139,105,20,0.10)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.97)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <Home className="text-accent" size={14} strokeWidth={1.5} color="#8B6914" />
            <span className="text-accent" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 13, color: "#8B6914" }}>
              {homeLabel}
            </span>
          </Link>
        </div>

        {/* Breadcrumb (right side) */}
        <div className="ml-auto hidden sm:flex items-center" style={{ gap: 6 }}>
          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center" style={{ gap: 6 }}>
                {i > 0 && (
                  <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 12, color: "rgba(23,18,8,0.25)" }}>/</span>
                )}
                {isLast ? (
                  <span className="text-secondary-foreground font-serif" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 12, color: "rgba(23,18,8,0.70)" }}>
                    {seg.label}
                  </span>
                ) : (
                  <Link
                    to={seg.href || "/"}
                    className="text-secondary-foreground font-serif"
                    style={{
                      fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 12,
                      color: "rgba(23,18,8,0.45)", textDecoration: "none",
                      transition: "color 150ms",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(23,18,8,0.70)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(23,18,8,0.45)"; }}
                  >
                    {seg.label}
                  </Link>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
