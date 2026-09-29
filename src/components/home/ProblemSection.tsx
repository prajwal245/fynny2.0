import { useState, useEffect, useRef } from "react";
import {
  EyeOff,
  AlertTriangle,
  TrendingDown,
  BarChart2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const RED = "#C41E1E";
const AUTO_MS = 6000;

type Slide = {
  id: string;
  Icon: LucideIcon;
  headline: string;
  statValue: string;
  statLabel: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    id: "blindness",
    Icon: EyeOff,
    headline:
      "63 million Indian businesses make ₹Crore decisions with zero financial intelligence.",
    statValue: "₹0",
    statLabel: "Average financial intelligence budget for Indian SMEs",
    body: "No CFO. No analyst. No financial model. Just gut feeling and a bank balance check.",
  },
  {
    id: "crisis",
    Icon: AlertTriangle,
    headline: "42% of Indian SMEs cite cash flow as their #1 challenge.",
    statValue: "14 days",
    statLabel: "Average time before a cash crisis is discovered",
    body: "Most owners discover a crisis 14 days before it happens, not 60 days when something can still be done about it.",
  },
  {
    id: "leak",
    Icon: TrendingDown,
    headline: "₹3.2L lost per SME annually to GST mismatches.",
    statValue: "₹3.2L",
    statLabel: "Drained yearly through vendor non-compliance & unclaimed ITC",
    body: "Vendor non-compliance, missed reconciliations, and unclaimed credit silently drain Indian businesses.",
  },
  {
    id: "failure",
    Icon: BarChart2,
    headline: "50% of Indian businesses fail within 5 years.",
    statValue: "50%",
    statLabel: "Fail within 5 years, mostly from cash & compliance surprises",
    body: "Most failures are not caused by bad products or poor sales, they are caused by cash flow mismanagement and compliance shocks.",
  },
  {
    id: "blind",
    Icon: Calculator,
    headline: "98% of Indian SMEs operate financially blind.",
    statValue: "98%",
    statLabel: "Of SMEs cannot afford a CFO",
    body: "Manufacturers in Ludhiana, traders in Surat, clinics in Chennai, exporters in Tiruppur, all making critical decisions on gut feel and a bank balance check.",
  },
];

export default function ProblemSection() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setProgress(0);
    if (paused) return;
    const tick = 50;
    const step = (100 / AUTO_MS) * tick;
    const p = setInterval(
      () => setProgress((v) => Math.min(100, v + step)),
      tick
    );
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      AUTO_MS
    );
    return () => {
      clearInterval(p);
      clearTimeout(t);
    };
  }, [index, paused]);

  const go = (i: number) => setIndex((i + SLIDES.length) % SLIDES.length);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? index + 1 : index - 1);
    touchStartX.current = null;
  };

  const slide = SLIDES[index];
  const Icon = slide.Icon;

  return (
    <section
      aria-labelledby="problem-heading"
      style={{
        background:
          "linear-gradient(180deg, #1F1610 0%, #15100A 100%)",
        padding: "clamp(72px, 9vw, 110px) clamp(20px, 5vw, 60px)",
      }}
    >
      <div className="mx-auto w-full max-w-[1200px]">
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "3px",
            color: RED,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          The Problem
        </div>

        <h2
          id="problem-heading"
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontWeight: 700,
            color: "#FFFFFF",
            fontSize: "clamp(26px, 3vw, 38px)",
            lineHeight: 1.2,
            marginBottom: 20,
            maxWidth: 820,
          }}
        >
          Your business is growing. Your financial visibility isn't.
        </h2>

        <p
          style={{
            fontFamily: "'Roboto', sans-serif",
            fontSize: "clamp(15px, 1.2vw, 18px)",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.75)",
            marginBottom: 16,
            maxWidth: 820,
          }}
        >
          Cash flow confusion, GST chaos, delayed numbers, payment uncertainty,
          scattered spreadsheets, and zero forecasting.
        </p>

        <p
          style={{
            fontFamily: "'Roboto', sans-serif",
            fontSize: "clamp(15px, 1.2vw, 18px)",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.9)",
            marginBottom: 40,
            maxWidth: 820,
          }}
        >
          FynHelp gives businesses a real-time AI CFO layer for complete
          financial clarity and smarter decisions.
        </p>

        {/* Carousel */}
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: "relative",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(196,30,30,0.06))",
            border: "1px solid rgba(196,30,30,0.25)",
            borderRadius: 16,
            padding: "clamp(28px, 4vw, 56px)",
            overflow: "hidden",
            minHeight: 360,
          }}
        >
          {/* Progress bar */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 3,
              width: `${progress}%`,
              background: RED,
              transition: "width 50ms linear",
            }}
          />

          <div
            className="grid"
            style={{
              gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
              gap: "clamp(24px, 4vw, 56px)",
              alignItems: "center",
            }}
          >
            {/* LEFT: copy */}
            <div key={slide.id} style={{ animation: "fyn-fade 0.5s ease both" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(196,30,30,0.12)",
                  border: "1px solid rgba(196,30,30,0.4)",
                  color: "#FFB4B4",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  marginBottom: 20,
                }}
              >
                <Icon size={14} strokeWidth={2.5} />
                Slide {index + 1} of {SLIDES.length}
              </div>

              <h3
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(22px, 2.6vw, 32px)",
                  lineHeight: 1.25,
                  color: "#FFFFFF",
                  marginBottom: 18,
                }}
              >
                {slide.headline}
              </h3>

              <p
                style={{
                  fontFamily: "'Roboto', sans-serif",
                  fontSize: "clamp(14px, 1.15vw, 17px)",
                  lineHeight: 1.7,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                {slide.body}
              </p>
            </div>

            {/* RIGHT: stat card */}
            <div
              key={`stat-${slide.id}`}
              style={{
                background:
                  "linear-gradient(160deg, rgba(196,30,30,0.18), rgba(0,0,0,0.4))",
                border: "1px solid rgba(196,30,30,0.4)",
                borderRadius: 14,
                padding: "clamp(24px, 3vw, 36px)",
                textAlign: "center",
                boxShadow: "0 18px 48px rgba(196,30,30,0.18)",
                animation: "fyn-fade 0.6s ease both",
              }}
            >
              <Icon
                size={36}
                strokeWidth={2}
                color={RED}
                style={{ margin: "0 auto 16px", display: "block" }}
              />
              <div
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(40px, 6vw, 72px)",
                  lineHeight: 1,
                  color: "#FFFFFF",
                  textShadow: "0 4px 20px rgba(196,30,30,0.5)",
                  marginBottom: 14,
                }}
              >
                {slide.statValue}
              </div>
              <div
                style={{
                  fontFamily: "'Roboto', sans-serif",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                {slide.statLabel}
              </div>
            </div>
          </div>

          {/* Arrows */}
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(index - 1)}
            style={arrowStyle("left")}
          >
            <ChevronLeft size={20} color="#fff" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(index + 1)}
            style={arrowStyle("right")}
          >
            <ChevronRight size={20} color="#fff" />
          </button>
        </div>

        {/* Dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            marginTop: 24,
          }}
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              style={{
                width: i === index ? 32 : 10,
                height: 10,
                borderRadius: 999,
                border: "none",
                background:
                  i === index ? RED : "rgba(255,255,255,0.25)",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <a
            href="#product-ecosystem"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: 15,
              color: "#FFB4B4",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,180,180,0.4)",
              paddingBottom: 2,
            }}
          >
            See how FynHelp fixes this →
          </a>
        </div>
      </div>

      <style>{`
        @keyframes fyn-fade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 16,
    transform: "translateY(-50%)",
    width: 40,
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  } as React.CSSProperties;
}
