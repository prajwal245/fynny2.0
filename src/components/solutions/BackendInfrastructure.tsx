import { useEffect, useRef, useState } from "react";
import {
  Database, Brain, CreditCard, BookOpen, Building2, FileText,
  type LucideIcon,
} from "lucide-react";

interface TechCard {
  Icon: LucideIcon;
  name: string;
  description: string;
  tags: string[];
}

const CARDS: TechCard[] = [
  {
    Icon: Database,
    name: "Supabase Backend",
    description: "PostgreSQL database with Edge Functions, real-time subscriptions, and row-level security for data protection",
    tags: ["21 Edge Functions", "Row-level security", "Mumbai region"],
  },
  {
    Icon: Brain,
    name: "Claude AI Engine",
    description: "GPT-4 class reasoning engine with 200K context window for deep financial analysis and multi-language support",
    tags: ["Financial reasoning", "5 languages", "Sonnet 4"],
  },
  {
    Icon: CreditCard,
    name: "Payment Integration",
    description: "Real-time payment tracking, automatic settlement sync, and refund reconciliation for complete payment visibility",
    tags: ["Real-time sync", "Webhook events", "India leader"],
  },
  {
    Icon: BookOpen,
    name: "Accounting Sync",
    description: "Automatic invoice pull, expense synchronization, and contact management with daily data updates",
    tags: ["OAuth secure", "Daily sync", "2-way sync"],
  },
  {
    Icon: Building2,
    name: "Banking Data",
    description: "Multi-bank aggregation with consent-based secure access via RBI's Account Aggregator framework",
    tags: ["14+ banks", "RBI compliant", "Secure pull"],
  },
  {
    Icon: FileText,
    name: "Tax Compliance",
    description: "Direct GST Portal API integration for GSTR-2B auto-pull, filing status tracking, and ITC reconciliation",
    tags: ["Direct API", "Monthly sync", "Auto-match"],
  },
];

export default function BackendInfrastructure() {
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

  return (
    <section
      ref={sectionRef}
      aria-labelledby="bi-heading"
      style={{
        background: "linear-gradient(180deg, rgba(196,30,30,0.04) 0%, transparent 100%), #F9F7F4",
        padding: isMobile ? "60px 20px" : "80px 40px",
        borderTop: "1px solid #E5E7EB",
      }}
    >
      <h2
        id="bi-heading"
        style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 700,
          fontSize: isMobile ? 28 : 38,
          lineHeight: 1.2,
          color: "#1A1A1A",
          textAlign: "center",
          margin: "0 0 16px 0",
        }}
      >
        Powered by Enterprise-Grade Technology
      </h2>
      <p
        style={{
          fontFamily: "'Roboto', sans-serif",
          fontSize: isMobile ? 15 : 17,
          color: "#6B7280",
          textAlign: "center",
          maxWidth: 700,
          margin: "0 auto 60px auto",
          lineHeight: 1.5,
        }}
      >
        Built on battle-tested infrastructure trusted by millions of businesses worldwide
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 28,
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {CARDS.map((card, i) => (
          <BiCard
            key={card.name}
            card={card}
            index={i}
            inView={inView}
          />
        ))}
      </div>

      <style>{`
        .bi-card {
          transition: transform 250ms ease, box-shadow 250ms ease;
          will-change: transform;
        }
        .bi-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.12) !important;
        }
        .bi-card:focus-visible {
          outline: 3px solid #C41E1E;
          outline-offset: 3px;
        }
      `}</style>
    </section>
  );
}

function BiCard({
  card, index, inView,
}: { card: TechCard; index: number; inView: boolean }) {
  const Icon = card.Icon;
  return (
    <div
      tabIndex={0}
      role="article"
      aria-label={`${card.name}. ${card.description}`}
      className="bi-card"
      style={{
        background: "#FFFFFF",
        padding: 28,
        borderRadius: 14,
        border: "1px solid #E5E7EB",
        boxShadow: "0 6px 18px rgba(0,0,0,0.07)",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(20px)",
        transitionProperty: "opacity, transform, box-shadow",
        transitionDuration: "600ms, 600ms, 250ms",
        transitionTimingFunction: "ease-out",
        transitionDelay: `${index * 90}ms, ${index * 90}ms, 0ms`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          background: "#F9F7F4",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
        }}
      >
        <Icon size={32} color="#C41E1E" strokeWidth={2} />
      </div>

      <h3 style={{
        fontFamily: "'Raleway', sans-serif",
        fontWeight: 700,
        fontSize: 20,
        color: "#1A1A1A",
        margin: "0 0 10px 0",
        lineHeight: 1.25,
      }}>
        {card.name}
      </h3>

      <p style={{
        fontFamily: "'Roboto', sans-serif",
        fontSize: 14,
        color: "#6B7280",
        lineHeight: 1.6,
        margin: "0 0 16px 0",
      }}>
        {card.description}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {card.tags.map((tag) => (
          <span
            key={tag}
            style={{
              background: "#F3F4F6",
              padding: "5px 11px",
              borderRadius: 8,
              fontFamily: "'Roboto', sans-serif",
              fontWeight: 500,
              fontSize: 12,
              color: "#1A1A1A",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
