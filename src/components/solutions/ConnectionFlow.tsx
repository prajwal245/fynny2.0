import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  CreditCard,
  BookOpen,
  Building2,
  FileText,
  Brain,
  LayoutDashboard,
  Bell,
  CheckCircle,
  Lightbulb,
  ArrowRight,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

type FlowCard = {
  id: string;
  Icon: LucideIcon;
  label: string;
  sub: string;
  brandColor?: string;
};

const SOURCES: FlowCard[] = [
  { id: "razorpay", Icon: CreditCard, label: "Razorpay",     sub: "Payment Data",          brandColor: "#3395FF" },
  { id: "zoho",     Icon: BookOpen,   label: "Zoho Books",   sub: "Accounting Data",       brandColor: "#E42527" },
  { id: "bank",     Icon: Building2,  label: "Bank Account", sub: "RBI Account Aggregator" },
  { id: "gst",      Icon: FileText,   label: "GST Portal",   sub: "Tax & Compliance" },
];

const OUTPUTS: FlowCard[] = [
  { id: "dashboard",  Icon: LayoutDashboard, label: "Live Dashboard",      sub: "Real-time metrics" },
  { id: "alerts",     Icon: Bell,            label: "Smart Alerts",        sub: "Proactive warnings" },
  { id: "compliance", Icon: CheckCircle,     label: "Compliance Check",    sub: "Deadline tracking" },
  { id: "insights",   Icon: Lightbulb,       label: "Actionable Insights", sub: "What to do next" },
];

export default function ConnectionFlow() {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const goWaitlist = () => navigate("/waitlist");

  return (
    <section
      ref={sectionRef}
      aria-labelledby="cf-heading"
      style={{
        background: "#FAFAF8",
        padding: isMobile ? "60px 20px" : "100px 40px",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 600ms ease, transform 600ms ease",
      }}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Heading */}
        <h2
          id="cf-heading"
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontWeight: 700,
            fontSize: isMobile ? 28 : 40,
            lineHeight: 1.2,
            color: "#1A1A1A",
            textAlign: "center",
            maxWidth: 900,
            margin: "0 auto 16px auto",
          }}
        >
          Connect Your Business to AI-Powered Financial Intelligence
        </h2>
        <p
          style={{
            fontFamily: "'Roboto', sans-serif",
            fontWeight: 400,
            fontSize: isMobile ? 16 : 18,
            lineHeight: 1.5,
            color: "#6B7280",
            textAlign: "center",
            maxWidth: 700,
            margin: "0 auto 60px auto",
          }}
        >
          See how FYNHelp connects your data sources to give you complete financial clarity
        </p>

        {/* Diagram */}
        {isMobile ? (
          <MobileLayout inView={inView} />
        ) : (
          <DesktopLayout inView={inView} />
        )}

        {/* CTA */}
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <button
            type="button"
            onClick={goWaitlist}
            className="cf-cta"
            style={{
              background: "#C41E1E",
              color: "#FFFFFF",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 17,
              padding: "16px 40px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(196,30,30,0.2)",
              transition: "all 200ms ease",
            }}
          >
            Join the Waitlist →
          </button>
          <p
            style={{
              marginTop: 12,
              fontFamily: "'Roboto', sans-serif",
              fontSize: 14,
              color: "#6B7280",
              textAlign: "center",
            }}
          >
            Join 100+ businesses on the waitlist
          </p>
        </div>
      </div>

      <style>{`
        @keyframes cf-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes cf-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 16px 48px rgba(196,30,30,0.3);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 20px 64px rgba(196,30,30,0.5);
          }
        }
        @keyframes cf-arrow-down {
          0%, 100% { transform: translateY(-4px); opacity: 0.7; }
          50%      { transform: translateY(4px);  opacity: 1; }
        }
        .cf-card {
          transition: transform 300ms ease, box-shadow 300ms ease;
        }
        .cf-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 14px 32px rgba(0,0,0,0.12) !important;
        }
        .cf-cta:hover {
          background: #B01A1A !important;
          box-shadow: 0 8px 24px rgba(196,30,30,0.3) !important;
          transform: translateY(-2px);
        }
        .cf-cta:focus-visible,
        .cf-card:focus-visible {
          outline: 2px solid #C41E1E;
          outline-offset: 3px;
        }
      `}</style>
    </section>
  );
}

/* ---------------- Card ---------------- */

function Card({ card, delayMs, slideFrom }: { card: FlowCard; delayMs: number; slideFrom: "left" | "right" | "none" }) {
  const Icon = card.Icon;
  const initialTranslate =
    slideFrom === "left" ? "translateX(-50px)" : slideFrom === "right" ? "translateX(50px)" : "translateY(0)";
  return (
    <button
      type="button"
      tabIndex={0}
      aria-label={`${card.label}, ${card.sub}`}
      className="cf-card"
      style={{
        width: 140,
        height: 100,
        background: "#FFFFFF",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        padding: 16,
        border: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        animation: `cf-float 3500ms ease-in-out ${delayMs}ms infinite`,
        transform: initialTranslate,
        opacity: 0,
        animationFillMode: "both",
      }}
      ref={(el) => {
        if (!el) return;
        // Trigger slide-in by clearing transform/opacity once mounted
        requestAnimationFrame(() => {
          el.style.transition = "transform 800ms ease, opacity 800ms ease";
          el.style.transform = "translate(0,0)";
          el.style.opacity = "1";
          // Re-apply float animation after slide-in completes
          setTimeout(() => {
            el.style.transition = "transform 300ms ease, box-shadow 300ms ease";
          }, 850);
        });
      }}
    >
      <Icon size={28} color={card.brandColor ?? "#1A1A1A"} strokeWidth={2} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Roboto', sans-serif", fontWeight: 500, fontSize: 13, color: "#1A1A1A", lineHeight: 1.2 }}>
          {card.label}
        </div>
        <div style={{ fontFamily: "'Roboto', sans-serif", fontWeight: 400, fontSize: 11, color: "#6B7280", lineHeight: 1.2, marginTop: 2 }}>
          {card.sub}
        </div>
      </div>
    </button>
  );
}

/* ---------------- Column heading ---------------- */

function ColHeading({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: "'Raleway', sans-serif",
        fontWeight: 700,
        fontSize: 14,
        color: "#C41E1E",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        textAlign: "center",
        marginBottom: 24,
      }}
    >
      {text}
    </div>
  );
}

/* ---------------- Center brain ---------------- */

function CenterBrain({ size, inView }: { size: number; inView: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        aria-label="CFO Fynny"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #FF4444 0%, #C41E1E 75%)",
          boxShadow: "0 16px 48px rgba(196,30,30,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "cf-pulse 2500ms ease-in-out infinite",
          transform: inView ? "scale(1)" : "scale(0.8)",
          transition: "transform 600ms ease",
        }}
      >
        <Brain size={Math.round(size * 0.5)} color="#FFFFFF" strokeWidth={1.8} />
      </div>
      <div
        style={{
          marginTop: 16,
          fontFamily: "'Raleway', sans-serif",
          fontWeight: 700,
          fontSize: 20,
          color: "#1A1A1A",
          textAlign: "center",
        }}
      >
        CFO Fynny
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: "'Roboto', sans-serif",
          fontSize: 14,
          color: "#6B7280",
          textAlign: "center",
        }}
      >
        Central Intelligence
      </div>
    </div>
  );
}

/* ---------------- Desktop layout (3 columns + SVG lines) ---------------- */

function DesktopLayout({ inView }: { inView: boolean }) {
  // Geometry constants for the SVG overlay
  // Container is 3 columns of equal width; we draw curves from each card edge to the brain.
  const COL_W = 200;       // card column width
  const CARD_W = 140;
  const CARD_H = 100;
  const GAP_Y = 16;
  const COLS_GAP = 80;     // horizontal gap between columns
  const BRAIN = 200;
  const SECTION_H = 4 * CARD_H + 3 * GAP_Y + 40; // include heading

  // X positions inside the SVG (svg width = COL_W*3 + COLS_GAP*2)
  const svgW = COL_W * 3 + COLS_GAP * 2;
  const svgH = SECTION_H;
  const leftEdgeX = COL_W;                                  // right edge of left card column
  const rightEdgeX = COL_W + COLS_GAP * 2 + COL_W * 2 - COL_W; // left edge of right card column = COL_W + COLS_GAP*2 + COL_W ... simplify
  // Simpler: left column occupies x in [COL_W-CARD_W, COL_W] roughly. Use centered cards.
  const leftCardCenterX = COL_W - CARD_W / 2;
  const rightCardCenterX = COL_W * 2 + COLS_GAP * 2 + CARD_W / 2;
  const brainCenterX = svgW / 2;
  const brainCenterY = svgH / 2;

  // Y center for each of 4 cards
  const cardCenterY = (i: number) => 40 + (CARD_H + GAP_Y) * i + CARD_H / 2;

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `${COL_W}px ${COLS_GAP}px ${COL_W}px ${COLS_GAP}px ${COL_W}px`,
        justifyContent: "center",
        alignItems: "start",
      }}
    >
      {/* SVG overlay for connecting lines + particles */}
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{
          position: "absolute",
          top: 40, // align with first card top region
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
        aria-hidden="true"
      >
        <defs>
          {[0, 1, 2, 3].map((i) => {
            const sy = cardCenterY(i);
            // left -> brain
            const lx1 = leftCardCenterX + CARD_W / 2;
            const ly1 = sy;
            const lx2 = brainCenterX - BRAIN / 2;
            const ly2 = brainCenterY;
            const lcx = (lx1 + lx2) / 2;
            // right -> brain (reversed direction = brain -> right)
            const rx1 = brainCenterX + BRAIN / 2;
            const ry1 = brainCenterY;
            const rx2 = rightCardCenterX - CARD_W / 2;
            const ry2 = sy;
            const rcx = (rx1 + rx2) / 2;
            return (
              <g key={i}>
                <path id={`cf-left-${i}`} d={`M${lx1},${ly1} Q${lcx},${ly1} ${(lx1+lx2)/2},${(ly1+ly2)/2} T${lx2},${ly2}`} fill="none" />
                <path id={`cf-right-${i}`} d={`M${rx1},${ry1} Q${rcx},${ry2} ${rx2},${ry2}`} fill="none" />
              </g>
            );
          })}
        </defs>

        {[0, 1, 2, 3].map((i) => {
          const sy = cardCenterY(i);
          const lx1 = leftCardCenterX + CARD_W / 2;
          const lx2 = brainCenterX - BRAIN / 2;
          const ly2 = brainCenterY;
          const rx1 = brainCenterX + BRAIN / 2;
          const ry1 = brainCenterY;
          const rx2 = rightCardCenterX - CARD_W / 2;
          return (
            <g key={`lines-${i}`}>
              <path
                d={`M${lx1},${sy} Q${(lx1+lx2)/2},${sy} ${(lx1+lx2)/2},${(sy+ly2)/2} T${lx2},${ly2}`}
                stroke="#D1D5DB" strokeWidth={2} strokeDasharray="8 4" opacity={0.6} fill="none"
              />
              <path
                d={`M${rx1},${ry1} Q${(rx1+rx2)/2},${ry1} ${rx2},${sy}`}
                stroke="#D1D5DB" strokeWidth={2} strokeDasharray="8 4" opacity={0.6} fill="none"
              />
            </g>
          );
        })}

        {/* Particles */}
        {[0, 1, 2, 3].map((i) => (
          <g key={`pts-${i}`}>
            <circle r={4} fill="#C41E1E" opacity={0.7}>
              <animateMotion dur="2.5s" repeatCount="indefinite" begin={`${i * 0.2}s`}>
                <mpath href={`#cf-left-${i}`} />
              </animateMotion>
            </circle>
            <circle r={4} fill="#C41E1E" opacity={0.7}>
              <animateMotion dur="2.5s" repeatCount="indefinite" begin={`${i * 0.2 + 0.3}s`}>
                <mpath href={`#cf-right-${i}`} />
              </animateMotion>
            </circle>
          </g>
        ))}

        {/* Arrowheads at card ends */}
        {[0, 1, 2, 3].map((i) => {
          const sy = cardCenterY(i);
          const rx2 = rightCardCenterX - CARD_W / 2;
          return (
            <polygon
              key={`arr-${i}`}
              points={`${rx2 - 8},${sy - 5} ${rx2},${sy} ${rx2 - 8},${sy + 5}`}
              fill="#C41E1E"
            />
          );
        })}
      </svg>

      {/* Column 1, Connect */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
        <ColHeading text="Connect" />
        <div style={{ display: "flex", flexDirection: "column", gap: GAP_Y }}>
          {SOURCES.map((c, i) => (
            <Card key={c.id} card={c} delayMs={i * 200} slideFrom="left" />
          ))}
        </div>
      </div>

      <div /> {/* spacer */}

      {/* Column 2, Analyze */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, minHeight: SECTION_H }}>
        <ColHeading text="Analyze" />
        <CenterBrain size={BRAIN} inView={inView} />
      </div>

      <div /> {/* spacer */}

      {/* Column 3, Act */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
        <ColHeading text="Act" />
        <div style={{ display: "flex", flexDirection: "column", gap: GAP_Y }}>
          {OUTPUTS.map((c, i) => (
            <Card key={c.id} card={c} delayMs={i * 200 + 100} slideFrom="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mobile layout (vertical stack) ---------------- */

function MobileLayout({ inView }: { inView: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
      <ColHeading text="Connect" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", alignItems: "center" }}>
        {SOURCES.map((c, i) => (
          <Card key={c.id} card={c} delayMs={i * 200} slideFrom="none" />
        ))}
      </div>

      <DownArrow />

      <ColHeading text="Analyze" />
      <CenterBrain size={160} inView={inView} />

      <DownArrow />

      <ColHeading text="Act" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", alignItems: "center" }}>
        {OUTPUTS.map((c, i) => (
          <Card key={c.id} card={c} delayMs={i * 200 + 100} slideFrom="none" />
        ))}
      </div>
    </div>
  );
}

function DownArrow() {
  return (
    <ArrowDown
      size={28}
      color="#C41E1E"
      style={{ animation: "cf-arrow-down 1500ms ease-in-out infinite" }}
      aria-hidden="true"
    />
  );
}
