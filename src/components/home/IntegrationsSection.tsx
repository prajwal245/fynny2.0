import { useScrollReveal } from "@/hooks/useScrollReveal";

type LogoItem = {
  name: string;
  color?: string;       // brand-style accent color for the text
  badge?: string;
  featured?: boolean;   // gold "GST Certified" style
};

type Carousel = {
  label: string;
  items: LogoItem[];
  trailing?: string;    // appended as a card at end of the strip (e.g. "+15 more banks…")
  caption?: string;     // small text rendered below the carousel
  speed?: number;       // seconds for one full loop
};

const CAROUSELS: Carousel[] = [
  {
    label: "Banking, Via RBI Account Aggregator",
    speed: 40,
    items: [
      { name: "HDFC Bank", color: "#004C8F" },
      { name: "ICICI Bank", color: "#F37920" },
      { name: "State Bank of India", color: "#22409A" },
      { name: "Axis Bank", color: "#97144D" },
      { name: "Kotak Mahindra Bank", color: "#ED1C24" },
      { name: "Yes Bank", color: "#00408F" },
      { name: "IndusInd Bank", color: "#7E2A8E" },
      { name: "Punjab National Bank", color: "#A8132B" },
      { name: "Bank of Baroda", color: "#F26B22" },
      { name: "Canara Bank", color: "#00558C" },
      { name: "Union Bank", color: "#E31E24" },
      { name: "UCO Bank", color: "#003E7E" },
      { name: "IDFC First Bank", color: "#9B1B30" },
      { name: "Federal Bank", color: "#003C71" },
    ],
    trailing: "+ 15 more banks via Finvu & OneMoney AA",
  },
  {
    label: "Accounting",
    speed: 32,
    items: [
      { name: "Tally Prime", color: "#C8102E", badge: "ODBC" },
      { name: "Zoho Books", color: "#E42527", badge: "OAuth API" },
      { name: "QuickBooks India", color: "#2CA01C", badge: "OAuth API" },
      { name: "Busy Accounting", color: "#1F4E8A", badge: "CSV Import" },
      { name: "Marg ERP", color: "#0E76A8", badge: "CSV Import" },
      { name: "SAP Business One", color: "#003D7C", badge: "Enterprise" },
    ],
  },
  {
    label: "Payroll & HR",
    speed: 30,
    items: [
      { name: "Keka HR", color: "#3F51B5" },
      { name: "GreytHR", color: "#0F9D58" },
      { name: "Razorpay Payroll", color: "#072654" },
      { name: "Darwinbox", color: "#1A1A1A" },
      { name: "EPFO Portal", color: "#1B5E20" },
    ],
  },
  {
    label: "Government Portals (Direct API Access)",
    speed: 32,
    items: [
      { name: "GST Portal (GSTN)", color: "#1A4480", badge: "GST Certified", featured: true },
      { name: "e-Invoice Portal", color: "#1A4480" },
      { name: "e-Way Bill Portal", color: "#1A4480" },
      { name: "TRACES (TDS)", color: "#0E4D2D" },
      { name: "MCA21 (ROC)", color: "#7B1E1E" },
      { name: "EPFO", color: "#1B5E20" },
    ],
  },
  {
    label: "Communication & Delivery",
    speed: 28,
    items: [
      { name: "WhatsApp Business", color: "#25D366" },
      { name: "Gmail", color: "#EA4335" },
      { name: "Outlook", color: "#0078D4" },
      { name: "SMS", color: "#1A1008" },
      { name: "In-App", color: "#C41E1E" },
    ],
    caption: "Morning briefs • Payment reminders • Compliance alerts • Collection chases • Monthly reports",
  },
];

function LogoCard({ item }: { item: LogoItem }) {
  return (
    <div className="shrink-0 mx-3 group">
      <div className="h-[56px] min-w-[160px] px-5 flex items-center justify-center gap-2 bg-fyn-beige-card border border-fyn-ink/8 rounded-md shadow-xs transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-0.5">
        <span
          className="font-semibold text-[15px] tracking-tight whitespace-nowrap transition-colors"
          style={{ color: item.color || "#1A1008", fontFamily: "'DM Sans', 'Inter', sans-serif" }}
        >
          {item.name}
        </span>
        {item.badge && (
          <span
            className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold ${
              item.featured
                ? "bg-fyn-gold text-white"
                : "bg-fyn-ink/8 text-fyn-ink/60"
            }`}
            style={{ fontFamily: "'Work Sans', sans-serif" }}
          >
            {item.badge}
          </span>
        )}
      </div>
    </div>
  );
}

function TrailingCard({ text }: { text: string }) {
  return (
    <div className="shrink-0 mx-3">
      <div className="h-[56px] px-5 flex items-center bg-fyn-ink/5 border border-dashed border-fyn-ink/20 rounded-md">
        <span className="text-fyn-ink/70 text-sm italic whitespace-nowrap">{text}</span>
      </div>
    </div>
  );
}

function Marquee({ carousel }: { carousel: Carousel }) {
  const items = carousel.items;
  const renderStrip = (key: string) => (
    <div key={key} className="flex items-center shrink-0" aria-hidden={key === "dup"}>
      {items.map((it, i) => (
        <LogoCard key={`${key}-${i}`} item={it} />
      ))}
      {carousel.trailing && <TrailingCard text={carousel.trailing} />}
    </div>
  );

  return (
    <div className="mb-8">
      <p
        className="fyn-caption text-fyn-gold mb-3 text-xs uppercase tracking-[0.18em]"
        style={{ fontFamily: "'Raleway', sans-serif" }}
      >
        {carousel.label}
      </p>

      <div
        className="marquee group relative overflow-hidden"
        style={{ ["--duration" as string]: `${carousel.speed ?? 35}s` }}
      >
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-fyn-beige-dark to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-fyn-beige-dark to-transparent" />

        <div className="marquee-track flex">
          {renderStrip("a")}
          {renderStrip("dup")}
        </div>
      </div>

      {carousel.caption && (
        <p className="text-fyn-ink/60 text-xs mt-3 italic">{carousel.caption}</p>
      )}
    </div>
  );
}

export default function IntegrationsSection() {
  const ref = useScrollReveal();

  return (
    <section className="bg-fyn-beige-dark py-20 overflow-hidden" ref={ref}>
      <div className="fyn-container">
        <span className="fyn-caption text-fyn-gold block mb-4 reveal-up text-base">
          Works With What You Already Use
        </span>
        <h2 className="text-3xl lg:text-[44px] leading-[1.2] text-fyn-ink mb-12 reveal-up">
          Built for the Indian business technology stack
        </h2>
      </div>

      {/* Edge-to-edge carousels */}
      <div className="space-y-2">
        {CAROUSELS.map((c) => (
          <div key={c.label} className="px-4 lg:px-8">
            <Marquee carousel={c} />
          </div>
        ))}
      </div>

      <style>{`
        .marquee-track {
          width: max-content;
          animation: fyn-marquee var(--duration, 35s) linear infinite;
          will-change: transform;
        }
        .marquee:hover .marquee-track,
        .marquee:focus-within .marquee-track {
          animation-play-state: paused;
        }
        @keyframes fyn-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }
      `}</style>
    </section>
  );
}
