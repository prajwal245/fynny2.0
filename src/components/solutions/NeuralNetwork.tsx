import { useState, useEffect, useRef, useMemo, KeyboardEvent, useCallback } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import {
  Brain, Check, X, Clock,
  Droplets, TrendingUp, PieChart, FileText, Shield,
  Briefcase, Users, Zap, Building2, BarChart3,
  TrendingDown, Flame, DollarSign, AlertTriangle,
  Clock as ClockIcon, BarChart2, UserX,
  ShoppingCart, Eye,
  GitCompare, Calendar, AlertCircle,
  CalendarDays, Bell, CheckCircle2, Award,
  Activity, Share2,
  User, UserMinus, Wallet,
  GitBranch, Target, AlertOctagon,
  LayoutGrid, Smartphone, CreditCard, Banknote,
  Rocket, Trophy, Map,
  type LucideIcon,
} from "lucide-react";


/* ---------------- Module data (10 suites, ordered clockwise from top) ---------------- */

interface ModuleDef {
  id: string;
  name: string;
  shortLabel: string;
  Icon: LucideIcon;
  status: "live" | "coming_soon";
  solves: string;
  whatItDoes: string[];
  metrics: string[];      // 4 children labels
  poweredBy: string[];
  dataSources: string[];
  updates: string;
}

const MODULES: ModuleDef[] = [
  {
    id: "liquidity", name: "Liquidity Intelligence", shortLabel: "Liquidity", Icon: Droplets,
    status: "live",
    solves: "Cash flow blindness and runway uncertainty",
    whatItDoes: [
      "Tracks 6+ bank accounts via RBI Account Aggregator",
      "Forecasts 90-day cash runway using AI predictions",
      "Monitors 150+ vendor payment schedules automatically",
      "Predicts cash crunch dates 60 days in advance",
    ],
    metrics: ["Cash Runway", "Burn Rate", "Working Capital", "Cash Crunch Date"],
    poweredBy: ["Edge Functions", "Claude API", "RBI Account Aggregator"],
    dataSources: ["Bank statements (auto, daily)", "Invoice due dates", "Payroll commitments"],
    updates: "Every 6 hours",
  },
  {
    id: "revenue", name: "Revenue Intelligence", shortLabel: "Revenue", Icon: TrendingUp,
    status: "coming_soon",
    solves: "Receivables chaos and revenue unpredictability",
    whatItDoes: [
      "Tracks 200+ customer invoices and payment patterns",
      "Scores customers on payment reliability (0–100)",
      "Auto-generates WhatsApp payment reminders",
      "Predicts which receivables will become write-offs",
    ],
    metrics: ["MRR/ARR Growth", "Aging Receivables", "Payment Patterns", "Churn Signals"],
    poweredBy: ["PostgreSQL", "Claude API", "Zoho Books"],
    dataSources: ["Invoice data (Zoho)", "Payment history", "Customer comms"],
    updates: "Real-time on new invoices",
  },
  {
    id: "cost", name: "Cost Intelligence", shortLabel: "Cost", Icon: PieChart,
    status: "coming_soon",
    solves: "Expense opacity and cost leaks",
    whatItDoes: [
      "Auto-categorizes 300+ monthly expenses",
      "Identifies duplicate vendor charges",
      "Flags unusual spending patterns instantly",
      "Recommends vendor consolidation opportunities",
    ],
    metrics: ["Category Breakdown", "Vendor Spend", "Hidden Costs", "Optimization Opps"],
    poweredBy: ["Edge Functions", "Claude API", "Bank sync"],
    dataSources: ["Bank transactions", "Card statements", "Accounting entries"],
    updates: "Daily reconciliation",
  },
  {
    id: "gst", name: "GST & Tax Intelligence", shortLabel: "GST & Tax", Icon: FileText,
    status: "coming_soon",
    solves: "GST compliance chaos and ITC loss",
    whatItDoes: [
      "Pulls GSTR-2B data on 14th of every month",
      "Matches 1000+ invoices against ITC claims",
      "Flags mismatches within 2 hours",
      "Sends deadline alerts 7 days before filing",
    ],
    metrics: ["ITC Reconciliation", "Filing Deadlines", "Notice Risk", "Unclaimed ITC"],
    poweredBy: ["GST Portal API", "Scheduled Functions", "Claude API"],
    dataSources: ["GSTR-2B (auto)", "Purchase invoices", "Vendor compliance"],
    updates: "14th of month + daily monitoring",
  },
  {
    id: "governance", name: "Governance Intelligence", shortLabel: "Governance", Icon: Shield,
    status: "coming_soon",
    solves: "Compliance deadline surprises",
    whatItDoes: [
      "Tracks 50+ annual compliance obligations",
      "Sends alerts 30/15/7 days before deadlines",
      "Maintains audit-ready documentation trail",
      "Scores compliance readiness (0–100)",
    ],
    metrics: ["Obligation Calendar", "Deadline Alerts", "Completion Rate", "Audit Score"],
    poweredBy: ["Scheduled Tasks", "Claude API", "MCA21/EPFO"],
    dataSources: ["Company registration", "Filed returns", "Regulatory DBs"],
    updates: "Daily obligation check",
  },
  {
    id: "ca-partner", name: "CA Partner Ecosystem", shortLabel: "CA Partner", Icon: Briefcase,
    status: "coming_soon",
    solves: "CA-client disconnect and manual work",
    whatItDoes: [
      "Provides CAs white-label access to client data",
      "Auto-generates monthly CFO reports for 50+ clients",
      "Shares compliance calendar with client automatically",
      "Enables bulk operations across client portfolio",
    ],
    metrics: ["Portfolio Health", "Compliance Status", "Shared Intelligence", "White-label Reports"],
    poweredBy: ["Multi-tenancy", "Role-based access", "Auto reporting"],
    dataSources: ["All client modules", "CA firm branding", "Client permissions"],
    updates: "Real-time for all clients",
  },
  {
    id: "ca-workbench", name: "CA Partner Workbench", shortLabel: "CA Workbench", Icon: Briefcase,
    status: "live",
    solves: "CAs juggling 50+ clients across spreadsheets and portals",
    whatItDoes: [
      "Manage client portfolios, file GST in bulk, run ITC reconciliation",
      "Bulk-file GSTR-1/3B across dozens of clients in one flow",
      "Runs ITC reconciliation against GSTR-2B automatically",
      "Single dashboard for compliance status across all clients",
    ],
    metrics: ["Portfolio Overview", "Bulk GST Filing", "ITC Reconciliation", "Client Dashboard"],
    poweredBy: ["Multi-tenancy", "GST Portal API", "Edge Functions"],
    dataSources: ["All client modules", "GSTR-2B", "CA firm records"],
    updates: "Real-time across all clients",
  },
  {
    id: "hr", name: "HR & Workforce Intelligence", shortLabel: "HR & Workforce", Icon: Users,
    status: "coming_soon",
    solves: "Hidden people costs and attrition surprises",
    whatItDoes: [
      "Calculates true all-in cost per employee",
      "Tracks 15+ attrition risk signals per person",
      "Models ROI of new hires vs contractors",
      "Forecasts payroll cash needs 90 days ahead",
    ],
    metrics: ["Cost per Employee", "Attrition Risk", "Headcount ROI", "Payroll Optimization"],
    poweredBy: ["PostgreSQL", "Claude API", "Payroll sync"],
    dataSources: ["Payroll (Keka/GreytHR)", "Attendance", "Performance reviews"],
    updates: "Monthly payroll sync",
  },
  {
    id: "simulator", name: "Decision Simulator Suite", shortLabel: "Simulator", Icon: Zap,
    status: "coming_soon",
    solves: "Blind business decisions",
    whatItDoes: [
      "Simulates 8 business scenarios (hiring, pricing, loans)",
      "Models cash impact over 12 months",
      "Runs Monte Carlo simulations for risk",
      "Compares 3 options side-by-side",
    ],
    metrics: ["Scenario Impact", "Break-even Period", "ROI Projections", "Risk Score"],
    poweredBy: ["Edge Functions", "Claude API", "Live data feeds"],
    dataSources: ["Cash position", "Revenue run rate", "Expense patterns"],
    updates: "On-demand simulation",
  },
  {
    id: "banking", name: "Banking & Fintech Intelligence", shortLabel: "Banking", Icon: Building2,
    status: "coming_soon",
    solves: "Multi-account chaos",
    whatItDoes: [
      "Aggregates 10+ bank accounts in one view",
      "Tracks every UPI transaction across accounts",
      "Monitors credit utilization vs available limits",
      "Surfaces working capital financing options",
    ],
    metrics: ["Unified View", "UPI Tracking", "Credit Utilization", "Financing Options"],
    poweredBy: ["RBI Account Aggregator", "Realtime", "Banking APIs"],
    dataSources: ["Bank accounts (AA)", "Credit cards", "Loan accounts"],
    updates: "Real-time transaction sync",
  },
  {
    id: "market", name: "Market & Growth Intelligence", shortLabel: "Market", Icon: BarChart3,
    status: "coming_soon",
    solves: "Industry positioning blindness",
    whatItDoes: [
      "Benchmarks performance vs 500+ similar businesses",
      "Scores growth readiness across 12 factors",
      "Maps expansion opportunities by region/vertical",
      "Tracks competitor funding and product launches",
    ],
    metrics: ["Industry Benchmarks", "Growth Readiness", "Competitive Position", "Expansion Map"],
    poweredBy: ["External Data APIs", "Claude API", "Web scraping"],
    dataSources: ["Industry reports", "Competitor sites", "Funding databases"],
    updates: "Weekly market scan",
  },
];

/** Icon for each child metric, keyed by exact metric label. */
const CHILD_ICONS: Record<string, LucideIcon> = {
  "Cash Runway": TrendingDown, "Burn Rate": Flame, "Working Capital": DollarSign, "Cash Crunch Date": AlertTriangle,
  "MRR/ARR Growth": TrendingUp, "Aging Receivables": ClockIcon, "Payment Patterns": BarChart2, "Churn Signals": UserX,
  "Category Breakdown": PieChart, "Vendor Spend": ShoppingCart, "Hidden Costs": Eye, "Optimization Opps": Zap,
  "ITC Reconciliation": GitCompare, "Filing Deadlines": Calendar, "Notice Risk": AlertCircle, "Unclaimed ITC": DollarSign,
  "Obligation Calendar": CalendarDays, "Deadline Alerts": Bell, "Completion Rate": CheckCircle2, "Audit Score": Award,
  "Portfolio Health": Activity, "Compliance Status": Shield, "Shared Intelligence": Share2, "White-label Reports": FileText,
  "Portfolio Overview": LayoutGrid, "Bulk GST Filing": FileText, "Client Dashboard": Briefcase,
  "Cost per Employee": User, "Attrition Risk": UserMinus, "Headcount ROI": Users, "Payroll Optimization": Wallet,
  "Scenario Impact": GitBranch, "Break-even Period": Target, "ROI Projections": TrendingUp, "Risk Score": AlertOctagon,
  "Unified View": LayoutGrid, "UPI Tracking": Smartphone, "Credit Utilization": CreditCard, "Financing Options": Banknote,
  "Industry Benchmarks": BarChart3, "Growth Readiness": Rocket, "Competitive Position": Trophy, "Expansion Map": Map,
};

/** Inter-module relationships (intelligent web), by id pairs */
const RELATIONSHIPS: [string, string][] = [
  ["liquidity", "revenue"],
  ["liquidity", "cost"],
  ["liquidity", "simulator"],
  ["liquidity", "banking"],
  ["revenue", "cost"],
  ["revenue", "gst"],
  ["revenue", "market"],
  ["cost", "gst"],
  ["cost", "hr"],
  ["gst", "governance"],
  ["governance", "ca-partner"],
  ["banking", "cost"],
];

/* ---------------- Component ---------------- */

interface Layout {
  w: number;
  h: number;
  cx: number;
  cy: number;
  centerSize: number;
  moduleSize: number;
  childSize: number;
  innerR: number;
  outerR: number;
}

export default function NeuralNetwork() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [centerHover, setCenterHover] = useState(false);
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<number | null>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [pinnedChild, setPinnedChild] = useState<{ moduleId: string; childIdx: number } | null>(null);
  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1280);

  const bp: "mobile" | "tablet" | "desktop" =
    vw < 768 ? "mobile" : vw < 1200 ? "tablet" : "desktop";
  const active = pinned ?? hovered;
  const isMobile = bp === "mobile";

  /* ----- Responsive layout (mathematical), recomputes on resize via vw ----- */
  useEffect(() => {
    const update = () => setVw(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const layout: Layout = useMemo(() => {
    if (bp === "mobile") {
      // Use full available width, clamped. Square-ish, with extra vertical room
      // for labels that sit beneath the outer modules.
      const w = Math.max(280, Math.min(vw - 24, 420));
      const h = w + 160;
      const innerR = w * 0.34;
      const outerR = w * 0.46;
      return { w, h, cx: w / 2, cy: h / 2, centerSize: 72, moduleSize: 44, childSize: 32, innerR, outerR };
    }

    if (bp === "tablet") {
      const w = Math.min(vw - 48, 900);
      const h = Math.min(w + 80, 760);
      const minDim = Math.min(w, h);
      const innerR = minDim * 0.30;
      const outerR = minDim * 0.46;
      return { w, h, cx: w / 2, cy: h / 2, centerSize: 110, moduleSize: 70, childSize: 50, innerR, outerR };
    }
    const w = Math.min(vw - 80, 1280);
    const h = 900;
    return { w, h, cx: w / 2, cy: h / 2, centerSize: 150, moduleSize: 90, childSize: 65, innerR: 280, outerR: 450 };
  }, [bp, vw]);


  /* ----- Compute node positions via trigonometry ----- */
  const nodes = useMemo(() => {
    const total = MODULES.length;
    const step = 360 / total;
    const start = -90; // top
    const childSpread = 15; // degrees between children
    const childCount = 4;

    return MODULES.map((m, i) => {
      const angleDeg = start + step * i;
      const rad = (angleDeg * Math.PI) / 180;
      const x = layout.cx + layout.innerR * Math.cos(rad);
      const y = layout.cy + layout.innerR * Math.sin(rad);

      const children = m.metrics.map((label, ci) => {
        const offset = childSpread * (ci - (childCount - 1) / 2);
        const cAng = ((angleDeg + offset) * Math.PI) / 180;
        return {
          id: `${m.id}-c${ci}`,
          label,
          x: layout.cx + layout.outerR * Math.cos(cAng),
          y: layout.cy + layout.outerR * Math.sin(cAng),
        };
      });

      return { ...m, x, y, angleDeg, children };
    });
  }, [layout]);

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  /* ----- Hover debounce (100ms) ----- */
  const debouncedSetHovered = useCallback((id: string | null) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovered(id), 100);
  }, []);

  /* ----- Navigation: live → /products anchor; others → waitlist with module slug ----- */
  const navigateToModule = (id: string) => {
    const m = nodeById[id];
    if (id === "ca-workbench") { navigate("/ca/login"); return; }
    if (m?.status === "live") navigate(`/products#${id}`);
    else navigate(`/waitlist?module=${id}`);
  };

  const handleClick = (id: string) => {
    if (isMobile) {
      // First tap: highlight & expand children. Second tap: open card.
      if (hovered !== id) {
        setHovered(id);
        return;
      }
      setPinned(id);
      return;
    }
    setPinned(id);
  };

  const closeCard = useCallback(() => {
    setPinned(null);
    setHovered(null);
    setPinnedChild(null);
  }, []);

  // ESC closes card
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeCard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, closeCard]);

  const onNodeKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPinned(id);
    }
  };

  /* ----- Related modules (for hover dimming) ----- */
  const relatedOf = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    nodes.forEach((n) => (map[n.id] = new Set()));
    RELATIONSHIPS.forEach(([a, b]) => {
      map[a]?.add(b);
      map[b]?.add(a);
    });
    return map;
  }, [nodes]);

  /* ----- Card placement (desktop/tablet) ----- */
  const cardPos = (n: { x: number; y: number }) => {
    const cardW = bp === "tablet" ? 380 : 420;
    const cardH = 560;
    const onLeft = n.x < layout.cx;
    const gap = layout.moduleSize / 2 + 28;
    let left = onLeft ? n.x + gap : n.x - gap - cardW;
    let top = n.y - cardH / 2;
    left = Math.max(12, Math.min(left, layout.w - cardW - 12));
    top = Math.max(12, Math.min(top, layout.h - cardH - 12));
    return { left, top, width: cardW };
  };

  const activeNode = active ? nodeById[active] : null;
  const showChildren = (id: string) => active === id;

  return (
    <div
      ref={containerRef}
      className="relative mx-auto"
      style={{
        width: layout.w,
        height: layout.h,
        maxWidth: "100%",
        background: "transparent",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        overflow: "visible",
      }}
    >
      {/* ============ SVG: lines + particles ============ */}
      <svg
        width={layout.w}
        height={layout.h}
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="absolute inset-0"
        style={{ pointerEvents: "none", overflow: isMobile ? "hidden" : "visible" }}
        aria-hidden="true"
      >
        <defs>
          {/* Center → module paths */}
          {nodes.map((n) => {
            const dx = n.x - layout.cx;
            const dy = n.y - layout.cy;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const sx = layout.cx + ux * (layout.centerSize / 2);
            const sy = layout.cy + uy * (layout.centerSize / 2);
            const ex = n.x - ux * (layout.moduleSize / 2);
            const ey = n.y - uy * (layout.moduleSize / 2);
            return (
              <path
                key={`pp-${n.id}`}
                id={`nn-cm-${n.id}`}
                d={`M${sx},${sy} L${ex},${ey}`}
                fill="none"
              />
            );
          })}
        </defs>

        {/* Inter-module curved connections (dashed) */}
        {!isMobile && RELATIONSHIPS.map(([aId, bId]) => {
          const a = nodeById[aId];
          const b = nodeById[bId];
          if (!a || !b) return null;
          // Bend the curve toward the center for organic feel
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const tx = layout.cx - mx;
          const ty = layout.cy - my;
          const tlen = Math.hypot(tx, ty) || 1;
          const bend = layout.innerR * 0.18;
          const qx = mx + (tx / tlen) * bend;
          const qy = my + (ty / tlen) * bend;
          const isActive =
            active === aId || active === bId;
          return (
            <path
              key={`rel-${aId}-${bId}`}
              d={`M${a.x},${a.y} Q${qx},${qy} ${b.x},${b.y}`}
              stroke={isActive ? "#C41E1E" : "#D1D5DB"}
              strokeWidth={1.5}
              strokeDasharray="8 4"
              opacity={isActive ? 0.8 : 0.28}
              fill="none"
              style={{ transition: "stroke 200ms ease, opacity 200ms ease" }}
            />
          );
        })}

        {/* Center → module lines */}
        {nodes.map((n) => {
          const dx = n.x - layout.cx;
          const dy = n.y - layout.cy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const sx = layout.cx + ux * (layout.centerSize / 2);
          const sy = layout.cy + uy * (layout.centerSize / 2);
          const ex = n.x - ux * (layout.moduleSize / 2);
          const ey = n.y - uy * (layout.moduleSize / 2);
          const isActive = active === n.id;
          const dimmed = active && !isActive && !relatedOf[active]?.has(n.id);
          return (
            <line
              key={`cm-${n.id}`}
              x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={isActive ? "#C41E1E" : "#D1D5DB"}
              strokeWidth={isActive ? 2.5 : 2}
              opacity={isActive ? 1 : dimmed ? 0.2 : 0.5}
              style={{
                transition: "stroke 200ms ease, opacity 200ms ease, stroke-width 200ms ease",
                filter: isActive ? "drop-shadow(0 0 4px rgba(196,30,30,0.5))" : undefined,
              }}
            />
          );
        })}

        {/* Module → child lines (only show when module is active, on mobile too) */}
        {nodes.map((n) =>
          n.children.map((c) => {
            const dx = c.x - n.x;
            const dy = c.y - n.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const sx = n.x + ux * (layout.moduleSize / 2);
            const sy = n.y + uy * (layout.moduleSize / 2);
            const ex = c.x - ux * (layout.childSize / 2);
            const ey = c.y - uy * (layout.childSize / 2);
            const isVisible = showChildren(n.id) || (!isMobile && !active);
            const isActive = showChildren(n.id);
            return (
              <line
                key={`mc-${c.id}`}
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke={isActive ? "#C41E1E" : "#D1D5DB"}
                strokeWidth={isActive ? 2 : 1.5}
                opacity={isActive ? 1 : isVisible ? 0.35 : 0}
                style={{ transition: "stroke 200ms ease, opacity 250ms ease, stroke-width 200ms ease" }}
              />
            );
          })
        )}

        {/* Particles flowing inward on center→module paths */}
        {nodes.map((n, i) => {
          const isActive = active === n.id;
          return (
            <circle
              key={`pt-${n.id}`}
              r={isActive ? 5 : 3.5}
              fill={isActive ? "#FF4444" : "#C41E1E"}
              opacity={isActive ? 0.95 : 0.6}
              style={{
                filter: isActive ? "drop-shadow(0 0 6px rgba(255,68,68,0.75))" : undefined,
                transition: "r 200ms ease, opacity 200ms ease",
              }}
            >
              <animateMotion
                dur={isActive ? "1.5s" : "2.5s"}
                repeatCount="indefinite"
                begin={`${(i * 0.22).toFixed(2)}s`}
                keyPoints="1;0"
                keyTimes="0;1"
                calcMode="linear"
              >
                <mpath href={`#nn-cm-${n.id}`} />
              </animateMotion>
            </circle>
          );
        })}
      </svg>

      {/* ============ Center node, CFO Fynny ============ */}
      <div
        className="absolute flex flex-col items-center center-node"
        style={{
          left: layout.cx,
          top: layout.cy,
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          willChange: "transform",
          cursor: "pointer",
        }}
        onMouseEnter={() => setCenterHover(true)}
        onMouseLeave={() => setCenterHover(false)}
        onClick={() => navigate(user ? "/dashboard" : "/waitlist")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(user ? "/dashboard" : "/waitlist");
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="CFO Fynny, Central Intelligence. Click to get started."
      >
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: layout.centerSize,
            height: layout.centerSize,
            background: "radial-gradient(circle at 35% 30%, #FF4444 0%, #C41E1E 75%)",
            position: "relative",
            animation: active || centerHover
              ? "nn-center-pulse-active 2000ms ease-in-out infinite"
              : "nn-center-pulse 3000ms ease-in-out infinite",
            transition: "box-shadow 250ms ease, transform 250ms ease",
            transform: centerHover ? "scale(1.05)" : "scale(1)",
            boxShadow: centerHover
              ? "0 0 0 10px rgba(196,30,30,0.12), 0 16px 48px rgba(196,30,30,0.45)"
              : undefined,
          }}
          aria-hidden="true"
        >
          <Brain
            color="#FFFFFF"
            size={Math.round(layout.centerSize * 0.47)}
            strokeWidth={2}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
        <div className="text-center" style={{ pointerEvents: "none", marginTop: 18 }}>
          <div
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontWeight: 700,
              fontSize: isMobile ? 18 : 20,
              color: "#1A1A1A",
              lineHeight: 1.2,
            }}
          >
            CFO Fynny
          </div>
          <div
            style={{
              fontFamily: "'Roboto', sans-serif",
              fontWeight: 400,
              fontSize: isMobile ? 12 : 14,
              color: "#6B7280",
              marginTop: 6,
            }}
          >
            Central Intelligence
          </div>
        </div>

        {/* Hover popup (desktop/tablet) */}
        {centerHover && !isMobile && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              top: `calc(100% + 16px)`,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1A1A1A",
              color: "#FFFFFF",
              padding: "14px 18px",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
              width: 280,
              pointerEvents: "none",
              zIndex: 60,
              animation: "nn-tip-in 160ms ease-out",
            }}
          >
            <div style={{ fontFamily: "'Raleway', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              Central Intelligence Brain
            </div>
            <div style={{ fontFamily: "'Roboto', sans-serif", fontSize: 13, lineHeight: 1.5, color: "#D1D5DB" }}>
              Processes data from all 10 modules to give you unified financial intelligence.
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, marginTop: 10, color: "#FF6B6B" }}>
              Click to get started →
            </div>
          </div>
        )}
      </div>

      {/* ============ Hover zones (invisible bounding boxes covering module + 4 children + padding) ============
          Keeps cluster "hovered" while user moves between module → children → info card. */}
      {!isMobile && nodes.map((n) => {
        const pts = [{ x: n.x, y: n.y }, ...n.children.map((c) => ({ x: c.x, y: c.y }))];
        const pad = layout.childSize / 2 + 24;
        const labelAllowance = 56; // include the text label that sits below the module circle
        const minX = Math.min(...pts.map((p) => p.x)) - pad;
        const minY = Math.min(...pts.map((p) => p.y)) - pad;
        const maxX = Math.max(...pts.map((p) => p.x)) + pad;
        const maxY = Math.max(...pts.map((p) => p.y)) + pad + labelAllowance;
        const isActive = active === n.id;
        return (
          <div
            key={`hz-${n.id}`}
            onMouseEnter={() => debouncedSetHovered(n.id)}
            onMouseLeave={() => debouncedSetHovered(null)}
            style={{
              position: "absolute",
              left: minX,
              top: minY,
              width: maxX - minX,
              height: maxY - minY,
              zIndex: isActive ? 25 : 10,
              pointerEvents: "auto",
              background: "transparent",
            }}
            aria-hidden="true"
          />
        );
      })}

      {/* ============ Module nodes (Layer 2) ============ */}
      {nodes.map((n, idx) => {
        const Icon = n.Icon;
        const isActive = active === n.id;
        const isLive = n.status === "live";
        const isRelated = active && relatedOf[active]?.has(n.id);
        const dimmed = active && !isActive && !isRelated;
        return (
          <div
            key={n.id}
            className="absolute flex flex-col items-center"
            onMouseEnter={() => !isMobile && debouncedSetHovered(n.id)}
            onMouseLeave={() => !isMobile && debouncedSetHovered(null)}
            style={{
              left: n.x,
              top: n.y,
              transform: "translate(-50%, -50%)",
              zIndex: isActive ? 100 : 30,
              opacity: dimmed ? 0.4 : 1,
              transition: "opacity 200ms ease",
              willChange: "transform, opacity",
              pointerEvents: "auto",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <button
              type="button"
              tabIndex={0}
              aria-label={`${n.name} module. Status: ${isLive ? "Live" : "In development"}. Click to explore.`}
              onClick={() => handleClick(n.id)}
              onKeyDown={(e) => onNodeKey(e, n.id)}
              className="relative rounded-full flex items-center justify-center focus-visible:outline-hidden"
              style={{
                width: layout.moduleSize,
                height: layout.moduleSize,
                background: "#FFFFFF",
                border: `2px solid ${isActive ? "#C41E1E" : isRelated ? "rgba(196,30,30,0.3)" : "#E5E7EB"}`,
                boxShadow: isActive
                  ? "0 0 35px rgba(196,30,30,0.45), 0 14px 40px rgba(196,30,30,0.35), 0 4px 12px rgba(0,0,0,0.15)"
                  : "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
                transform: isActive ? "scale(1.15)" : isRelated ? "scale(1.05)" : "scale(1)",
                transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms ease, box-shadow 250ms ease",
                cursor: "pointer",
                animation: (isActive || isRelated)
                  ? undefined
                  : `nn-breathe 4000ms ease-in-out ${(idx * 0.3).toFixed(2)}s infinite`,
                willChange: "transform",
                outline: "none",
                pointerEvents: "auto",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = "0 0 0 3px #C41E1E, 0 6px 18px rgba(0,0,0,0.08)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = isActive
                  ? "0 0 35px rgba(196,30,30,0.45), 0 14px 40px rgba(196,30,30,0.35), 0 4px 12px rgba(0,0,0,0.15)"
                  : "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)";
              }}
            >
              <Icon
                size={Math.round(layout.moduleSize * 0.4)}
                color="#1A1A1A"
                strokeWidth={2}
              />
              {/* Status dot */}
              <span
                aria-hidden="true"
                className="absolute"
                style={{
                  top: -3,
                  right: -3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: isLive ? "#1F5A46" : "#9CA3AF",
                  border: "3px solid #FFFFFF",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  zIndex: 1,
                }}
              />
            </button>
            <div
              className="text-center"
              style={{
                pointerEvents: "none",
                marginTop: 10,
                fontFamily: "'Raleway', sans-serif",
                fontWeight: 600,
                fontSize: isMobile ? 11 : 15,
                color: "#1A1A1A",
                maxWidth: isMobile ? 80 : 130,
                lineHeight: 1.25,
                whiteSpace: "normal",
              }}
            >
              {n.shortLabel}
            </div>

          </div>
        );
      })}

      {/* ============ Child nodes (Layer 3) ============ */}
      {nodes.map((n) =>
        n.children.map((c, ci) => {
          const isActive = showChildren(n.id);
          // Hide on mobile unless module is active
          const visible = isActive || (!isMobile && !active);
          const ChildIcon = CHILD_ICONS[c.label];
          const isChildPinned =
            pinnedChild?.moduleId === n.id && pinnedChild.childIdx === ci;
          return (
            <div
              key={c.id}
              className="absolute flex flex-col items-center"
              style={{
                left: c.x,
                top: c.y,
                transform: `translate(-50%, -50%) scale(${isActive ? 1.08 : visible ? 1 : 0})`,
                opacity: isActive ? 1 : visible ? 0.85 : 0,
                zIndex: isChildPinned ? 110 : isActive ? 90 : 20,
                transition: `transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1) ${ci * 40}ms, opacity 250ms ease ${ci * 40}ms`,
                willChange: "transform, opacity",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedChild({ moduleId: n.id, childIdx: ci });
                  setHovered(n.id);
                }}
                aria-label={`${c.label} metric. Click for details.`}
                className="rounded-full flex items-center justify-center focus-visible:outline-hidden"
                style={{
                  width: layout.childSize,
                  height: layout.childSize,
                  background: "#FFFFFF",
                  border: `1.5px solid ${isActive ? "#C41E1E" : "#E5E7EB"}`,
                  boxShadow: isActive
                    ? "0 0 20px rgba(196,30,30,0.3), 0 6px 18px rgba(0,0,0,0.1)"
                    : "0 4px 12px rgba(0,0,0,0.06)",
                  transition: "border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {ChildIcon && (
                  <ChildIcon
                    size={Math.round(layout.childSize * 0.42)}
                    color={isActive ? "#C41E1E" : "#1A1A1A"}
                    strokeWidth={2}
                    style={{ transition: "color 200ms ease" }}
                  />
                )}
              </button>

              {/* Child info popup */}
              {isChildPinned && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: layout.childSize + 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 260,
                    background: "#FFFFFF",
                    borderRadius: 12,
                    padding: 18,
                    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
                    border: "1px solid #E5E7EB",
                    zIndex: 1100,
                    animation: "nn-card-in 200ms ease-out",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinnedChild(null);
                    }}
                    aria-label="Close"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      lineHeight: 0,
                    }}
                  >
                    <X size={16} color="#6B7280" />
                  </button>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "#F9F7F4",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}
                  >
                    {ChildIcon && <ChildIcon size={22} color="#C41E1E" strokeWidth={2} />}
                  </div>
                  <h4
                    style={{
                      fontFamily: "'Raleway', sans-serif",
                      fontWeight: 700,
                      fontSize: 15,
                      color: "#1A1A1A",
                      margin: "0 0 6px 0",
                      lineHeight: 1.3,
                    }}
                  >
                    {c.label}
                  </h4>
                  <p
                    style={{
                      fontFamily: "'Roboto', sans-serif",
                      fontSize: 12.5,
                      color: "#6B7280",
                      lineHeight: 1.55,
                      margin: 0,
                    }}
                  >
                    {n.name} metric, part of {n.shortLabel}.
                  </p>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ============ Backdrop when card pinned ============ */}
      {pinned && (
        <div
          onClick={closeCard}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            zIndex: 900,
          }}
        />
      )}

      {/* ============ Info card, desktop/tablet beside cluster ============ */}
      {activeNode && pinned && !isMobile && (() => {
        const pos = cardPos(activeNode);
        return (
          <InfoCard
            module={activeNode}
            onAction={() => navigateToModule(activeNode.id)}
            onClose={closeCard}
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              position: "absolute",
              zIndex: 1000,
            }}
          />
        );
      })()}

      {/* ============ Mobile bottom-sheet card ============ */}
      {activeNode && pinned && isMobile && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
          onClick={closeCard}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "75vh",
              overflowY: "auto",
              background: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              animation: "nn-sheet-up 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 40, height: 4, borderRadius: 2,
                background: "#E5E7EB",
                margin: "12px auto",
              }}
            />
            <InfoCard
              module={activeNode}
              onAction={() => navigateToModule(activeNode.id)}
              onClose={closeCard}
              style={{
                position: "relative",
                width: "100%",
                boxShadow: "none",
                borderRadius: 0,
              }}
              showClose
            />
          </div>
        </div>
      )}

      {/* ============ Keyframes ============ */}
      <style>{`
        @keyframes nn-center-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow:
              0 0 40px rgba(255, 68, 68, 0.4),
              0 0 80px rgba(196, 30, 30, 0.2),
              0 15px 50px rgba(196, 30, 30, 0.45),
              inset 0 0 30px rgba(255, 255, 255, 0.1);
          }
          50% {
            transform: scale(1.06);
            box-shadow:
              0 0 60px rgba(255, 68, 68, 0.6),
              0 0 100px rgba(196, 30, 30, 0.3),
              0 20px 70px rgba(196, 30, 30, 0.65),
              inset 0 0 30px rgba(255, 255, 255, 0.15);
          }
        }
        @keyframes nn-center-pulse-active {
          0%, 100% {
            transform: scale(1.04);
            box-shadow:
              0 0 60px rgba(255, 68, 68, 0.7),
              0 0 110px rgba(196, 30, 30, 0.4),
              0 22px 70px rgba(196, 30, 30, 0.7),
              inset 0 0 30px rgba(255, 255, 255, 0.18);
          }
          50% {
            transform: scale(1.10);
            box-shadow:
              0 0 80px rgba(255, 68, 68, 0.85),
              0 0 130px rgba(196, 30, 30, 0.5),
              0 28px 90px rgba(196, 30, 30, 0.85),
              inset 0 0 30px rgba(255, 255, 255, 0.22);
          }
        }
        @keyframes nn-breathe {
          0%, 100% { transform: scale(1); opacity: 0.96; }
          50%      { transform: scale(1.02); opacity: 1; }
        }
        @keyframes nn-tip-in {
          from { opacity: 0; transform: translate(-50%, -4px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes nn-card-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes nn-sheet-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}

/* ---------------- Info Card ---------------- */

interface InfoCardProps {
  module: ModuleDef;
  onAction: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
  showClose?: boolean;
}

function InfoCard({ module: m, onAction, onClose, style, showClose }: InfoCardProps) {
  const isLive = m.status === "live";
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Roboto', sans-serif",
    fontWeight: 500,
    fontSize: 11,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 8,
  };
  return (
    <div
      role="dialog"
      aria-label={`${m.name} details`}
      style={{
        background: "#FFFFFF",
        borderRadius: 16,
        boxShadow: "0 30px 80px rgba(0,0,0,0.15)",
        border: "1px solid #E5E7EB",
        padding: 32,
        animation: "nn-card-in 250ms ease-out",
        ...style,
      }}
    >
      {showClose && (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 8,
            zIndex: 2,
          }}
        >
          <X size={20} color="#6B7280" />
        </button>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <h3 style={{
          fontFamily: "'Raleway', sans-serif",
          fontWeight: 700,
          fontSize: 24,
          color: "#1A1A1A",
          margin: 0,
          lineHeight: 1.2,
        }}>{m.name}</h3>
        <span style={{
          background: isLive ? "#1F5A46" : "#6B7280",
          color: "#FFFFFF",
          padding: "6px 14px",
          borderRadius: 16,
          fontFamily: "'Work Sans', sans-serif",
          fontWeight: 500,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {isLive ? "Live" : "In Development"}
        </span>
      </div>

      {/* Solves */}
      <div style={labelStyle}>Solves:</div>
      <p style={{
        fontFamily: "'Roboto', sans-serif",
        fontWeight: 600,
        fontSize: 17,
        color: "#1A1A1A",
        lineHeight: 1.4,
        margin: "0 0 20px 0",
      }}>{m.solves}</p>

      {/* What it does */}
      <div style={labelStyle}>What it actually does:</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0" }}>
        {m.whatItDoes.map((item) => (
          <li key={item} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            fontFamily: "'Roboto', sans-serif",
            fontSize: 14, color: "#1A1A1A", lineHeight: 1.6, marginBottom: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#C41E1E", marginTop: 8, flexShrink: 0,
            }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {/* Metrics */}
      <div style={labelStyle}>Key metrics you'll get:</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0" }}>
        {m.metrics.map((mt) => (
          <li key={mt} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            fontFamily: "'Roboto', sans-serif",
            fontWeight: 500, fontSize: 14, color: "#1A1A1A",
            lineHeight: 1.6, marginBottom: 8,
          }}>
            <Check size={16} color="#1F5A46" strokeWidth={2.5} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{mt}</span>
          </li>
        ))}
      </ul>

      {/* Powered by */}
      <div style={labelStyle}>Powered by:</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {m.poweredBy.map((p) => (
          <span key={p} style={{
            background: "#F3F4F6",
            padding: "6px 12px",
            borderRadius: 8,
            fontFamily: "'Roboto', sans-serif",
            fontWeight: 500, fontSize: 13, color: "#1A1A1A",
          }}>{p}</span>
        ))}
      </div>

      {/* Data sources */}
      <div style={labelStyle}>Data sources:</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0" }}>
        {m.dataSources.map((d) => (
          <li key={d} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            fontFamily: "'Roboto', sans-serif",
            fontSize: 13, color: "#6B7280", lineHeight: 1.6, marginBottom: 4,
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: "50%",
              background: "#9CA3AF", marginTop: 8, flexShrink: 0,
            }} />
            <span>{d}</span>
          </li>
        ))}
      </ul>

      {/* Update frequency */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "#F9F7F4",
        padding: "8px 12px",
        borderRadius: 8,
        marginBottom: 24,
        fontFamily: "'Roboto', sans-serif",
        fontWeight: 500, fontSize: 13, color: "#6B7280",
      }}>
        <Clock size={14} color="#6B7280" />
        <span>{m.updates}</span>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAction}
        style={{
          width: "100%",
          padding: 16,
          borderRadius: 10,
          background: isLive ? "#C41E1E" : "#6B7280",
          color: "#FFFFFF",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          fontSize: 16,
          border: "none",
          cursor: "pointer",
          transition: "all 200ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isLive ? "#B01A1A" : "#5A6169";
          e.currentTarget.style.transform = "scale(1.02)";
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isLive ? "#C41E1E" : "#6B7280";
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {isLive ? "Click to explore →" : "Join waitlist for early access →"}
      </button>
    </div>
  );
}
