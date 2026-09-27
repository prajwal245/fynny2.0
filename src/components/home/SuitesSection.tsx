import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@/lib/router-compat";
import {
  Droplets,
  TrendingUp,
  PieChart,
  FileText,
  Shield,
  Users,
  Zap,
  BarChart3,
  Building2,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type Status = "live" | "dev";

interface Suite {
  id: string;
  name: string;
  short: string;
  Icon: LucideIcon;
  modules: number;
  desc: string;
  status: Status;
  href: string;
  accent: string;
  Widget: React.FC;
}

/* ---------------- Widgets (mini product previews) ---------------- */

const LiquidityWidget: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-end justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>
          Available Cash
        </div>
        <div className="text-3xl text-fyn-ink mt-1" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>
          ₹12.4L
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>Runway</div>
        <div className="text-xl text-fyn-success mt-1" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}>52 days</div>
      </div>
    </div>
    {/* Sparkline */}
    <svg viewBox="0 0 200 60" className="w-full h-14">
      <path d="M0,45 L20,40 L40,42 L60,30 L80,32 L100,25 L120,28 L140,18 L160,20 L180,12 L200,15"
        fill="none" stroke="#C41E1E" strokeWidth="2" />
      <path d="M0,45 L20,40 L40,42 L60,30 L80,32 L100,25 L120,28 L140,18 L160,20 L180,12 L200,15 L200,60 L0,60 Z"
        fill="#C41E1E" fillOpacity="0.08" />
    </svg>
    <div className="flex items-center gap-2 text-xs">
      <ArrowUpRight className="w-3.5 h-3.5 text-fyn-success" />
      <span className="text-fyn-ink/70">Burn rate down 12% this month</span>
    </div>
  </div>
);

const RevenueWidget: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-end justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>MRR</div>
        <div className="text-3xl text-fyn-ink mt-1" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>₹8.2L</div>
      </div>
      <div className="flex items-center gap-1 text-fyn-success text-sm">
        <ArrowUpRight className="w-4 h-4" /> +18.4%
      </div>
    </div>
    <svg viewBox="0 0 200 60" className="w-full h-14">
      {[10, 18, 15, 24, 22, 30, 28, 36, 34, 42, 48].map((h, i) => (
        <rect key={i} x={i * 18 + 2} y={60 - h} width="14" height={h} fill="#1A4A8B" rx="1" />
      ))}
    </svg>
    <div className="flex items-center justify-between text-xs">
      <span className="text-fyn-ink/70">At-risk receivables</span>
      <span className="text-fyn-red font-medium">₹2.4L · 3 customers</span>
    </div>
  </div>
);

const CostWidget: React.FC = () => {
  const segs = [
    { label: "Salaries", pct: 42, color: "#1A6B3C" },
    { label: "Rent & Ops", pct: 22, color: "#8B6914" },
    { label: "Marketing", pct: 18, color: "#C41E1E" },
    { label: "Tools", pct: 12, color: "#1A4A8B" },
    { label: "Other", pct: 6, color: "#6B7280" },
  ];
  let acc = 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
          {segs.map((s) => {
            const dash = (s.pct / 100) * 100;
            const el = (
              <circle key={s.label} cx="18" cy="18" r="15.915" fill="transparent"
                stroke={s.color} strokeWidth="5"
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-acc} />
            );
            acc += dash;
            return el;
          })}
        </svg>
        <div className="flex-1 space-y-1.5">
          {segs.slice(0, 3).map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              <span className="text-fyn-ink/70 flex-1">{s.label}</span>
              <span className="text-fyn-ink font-medium">{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-fyn-ink/70 border-t border-fyn-ink/10 pt-2">
        Save <span className="text-fyn-success font-medium">₹46K/mo</span> by consolidating 3 vendors
      </div>
    </div>
  );
};

const GstWidget: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>ITC at Risk</div>
        <div className="text-2xl text-fyn-red mt-1" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>₹3.2L</div>
      </div>
      <div className="text-right">
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>GSTR-3B</div>
        <div className="flex items-center gap-1 text-fyn-warning text-sm mt-1">
          <Clock className="w-3.5 h-3.5" /> 4 days left
        </div>
      </div>
    </div>
    <div className="space-y-1.5">
      {[
        { name: "Acme Suppliers", amt: "₹84K", ok: false },
        { name: "Patel Trading Co", amt: "₹1.2L", ok: false },
        { name: "Mehta Logistics", amt: "₹62K", ok: true },
      ].map((r) => (
        <div key={r.name} className="flex items-center justify-between text-xs bg-fyn-beige/60 rounded px-2 py-1.5">
          <div className="flex items-center gap-2">
            {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-fyn-success" /> : <AlertCircle className="w-3.5 h-3.5 text-fyn-red" />}
            <span className="text-fyn-ink/80">{r.name}</span>
          </div>
          <span className="font-medium text-fyn-ink">{r.amt}</span>
        </div>
      ))}
    </div>
  </div>
);

const GovernanceWidget: React.FC = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>Compliance Health</div>
      <div className="text-fyn-success text-sm font-medium">94 / 100</div>
    </div>
    <div className="h-2 bg-fyn-ink/10 rounded-full overflow-hidden">
      <div className="h-full bg-fyn-success rounded-full" style={{ width: "94%" }} />
    </div>
    <div className="space-y-1.5 pt-1">
      {[
        { d: "Apr 30", t: "TDS Q4 Return", c: "#C41E1E" },
        { d: "May 11", t: "GSTR-1 Filing", c: "#8B6914" },
        { d: "May 20", t: "PF Contribution", c: "#1A6B3C" },
      ].map((e) => (
        <div key={e.t} className="flex items-center gap-3 text-xs">
          <span className="w-1 h-6 rounded" style={{ background: e.c }} />
          <span className="text-fyn-ink/60 w-12">{e.d}</span>
          <span className="text-fyn-ink/85 flex-1">{e.t}</span>
        </div>
      ))}
    </div>
  </div>
);

const HrWidget: React.FC = () => (
  <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      {[
        { l: "Headcount", v: "24", s: "+2 MoM" },
        { l: "Cost / FTE", v: "₹68K", s: "+4%" },
        { l: "Attrition", v: "8.2%", s: "-1.1%" },
      ].map((m) => (
        <div key={m.l} className="bg-fyn-beige/60 rounded p-2">
          <div className="text-[10px] uppercase tracking-wider text-fyn-ink/50">{m.l}</div>
          <div className="text-lg text-fyn-ink mt-0.5" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}>{m.v}</div>
          <div className="text-[10px] text-fyn-ink/55">{m.s}</div>
        </div>
      ))}
    </div>
    <div className="bg-fyn-beige/60 rounded p-2.5 text-xs">
      <div className="flex items-center gap-1.5 text-fyn-warning mb-1">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="font-medium">2 attrition risks identified</span>
      </div>
      <div className="text-fyn-ink/60">Hire window opens in ~6 weeks based on runway.</div>
    </div>
  </div>
);

const SimulatorWidget: React.FC = () => (
  <div className="space-y-2">
    <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>
      Scenario: Hire 2 engineers
    </div>
    {[
      { label: "Today", runway: 52, color: "#1A6B3C", w: "100%" },
      { label: "Hire +2", runway: 38, color: "#8B6914", w: "73%" },
      { label: "Hire +2 + 15% price↑", runway: 61, color: "#1A4A8B", w: "100%" },
    ].map((s) => (
      <div key={s.label} className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-fyn-ink/75">{s.label}</span>
          <span className="text-fyn-ink font-medium">{s.runway} days</span>
        </div>
        <div className="h-2 bg-fyn-ink/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ background: s.color, width: s.w }} />
        </div>
      </div>
    ))}
  </div>
);

const MarketWidget: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-end justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>Industry Percentile</div>
        <div className="text-3xl text-fyn-ink mt-1" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>72<span className="text-base text-fyn-ink/50">th</span></div>
      </div>
      <div className="text-right text-xs">
        <div className="text-fyn-ink/50">Credit Rating</div>
        <div className="text-fyn-success font-medium text-sm">BBB+</div>
      </div>
    </div>
    <div className="grid grid-cols-5 gap-1">
      {[40, 55, 65, 80, 50].map((h, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="w-full bg-fyn-ink/10 rounded relative h-12">
            <div className="absolute bottom-0 inset-x-0 rounded" style={{ height: `${h}%`, background: i === 3 ? "#C41E1E" : "#1A4A8B" }} />
          </div>
          <span className="text-[9px] text-fyn-ink/50">Q{i + 1}</span>
        </div>
      ))}
    </div>
    <div className="text-xs text-fyn-ink/70">Fundraise readiness: <span className="text-fyn-ink font-medium">Ready in 2 quarters</span></div>
  </div>
);

const BankingWidget: React.FC = () => (
  <div className="space-y-2">
    {[
      { bank: "HDFC ····4521", bal: "₹6.8L", c: "#1A4A8B" },
      { bank: "ICICI ····8830", bal: "₹3.2L", c: "#DC6B19" },
      { bank: "Axis ····2104", bal: "₹2.4L", c: "#8B1A4A" },
    ].map((a) => (
      <div key={a.bank} className="flex items-center justify-between bg-fyn-beige/60 rounded p-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-8 rounded" style={{ background: a.c }} />
          <div>
            <div className="text-xs text-fyn-ink/85 font-medium">{a.bank}</div>
            <div className="text-[10px] text-fyn-ink/50">Synced 2 min ago</div>
          </div>
        </div>
        <div className="text-sm text-fyn-ink" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600 }}>{a.bal}</div>
      </div>
    ))}
    <div className="flex justify-between items-center pt-1 text-xs">
      <span className="text-fyn-ink/60">Total liquidity</span>
      <span className="text-fyn-ink font-medium">₹12.4L</span>
    </div>
  </div>
);

const CaWidget: React.FC = () => (
  <div className="space-y-3">
    <div className="flex items-end justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-fyn-ink/50" style={{ fontFamily: "'Raleway', sans-serif" }}>Active Clients</div>
        <div className="text-3xl text-fyn-ink mt-1" style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}>52</div>
      </div>
      <div className="text-right text-xs">
        <div className="text-fyn-ink/50">Filings this week</div>
        <div className="text-fyn-ink font-medium text-sm">18 / 23</div>
      </div>
    </div>
    <div className="space-y-1.5">
      {[
        { n: "Sharma Textiles", s: "Filed", ok: true },
        { n: "Nova Tech Pvt Ltd", s: "Pending", ok: false },
        { n: "Greenfield Foods", s: "Filed", ok: true },
      ].map((c) => (
        <div key={c.n} className="flex items-center justify-between text-xs bg-fyn-beige/60 rounded px-2 py-1.5">
          <span className="text-fyn-ink/85">{c.n}</span>
          <span className={c.ok ? "text-fyn-success" : "text-fyn-warning"}>{c.s}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ---------------- Suites data ---------------- */

const SUITES: Suite[] = [
  { id: "liquidity", name: "Liquidity Intelligence", short: "Liquidity", Icon: Droplets, modules: 6,
    desc: "Real-time cash position, burn rate, runway forecast, and working capital, every morning before you ask.",
    status: "live", href: "/products#liquidity", accent: "#C41E1E", Widget: LiquidityWidget },
  { id: "revenue", name: "Revenue Intelligence", short: "Revenue", Icon: TrendingUp, modules: 8,
    desc: "Know which customers will pay, who won't, and what to do before a ₹10L receivable becomes a write-off.",
    status: "dev", href: "/products#revenue", accent: "#1A4A8B", Widget: RevenueWidget },
  { id: "cost", name: "Cost Intelligence", short: "Cost", Icon: PieChart, modules: 6,
    desc: "See where every rupee of your business expense goes, and where to cut without cutting what matters.",
    status: "dev", href: "/products#cost", accent: "#1A6B3C", Widget: CostWidget },
  { id: "gst", name: "GST & Tax Intelligence", short: "GST & Tax", Icon: FileText, modules: 10,
    desc: "Stop paying for vendors' non-compliance. Protect your ITC, reduce notice risk, file with confidence.",
    status: "dev", href: "/products#gst", accent: "#8B5A00", Widget: GstWidget },
  { id: "governance", name: "Governance Intelligence", short: "Governance", Icon: Shield, modules: 10,
    desc: "50+ annual compliance obligations. One intelligent calendar that tells you what to do and when.",
    status: "dev", href: "/products#governance", accent: "#8B6914", Widget: GovernanceWidget },
  { id: "hr", name: "HR & Workforce Intelligence", short: "HR", Icon: Users, modules: 10,
    desc: "Know when you can afford to hire, who's an attrition risk, and what every team member truly costs.",
    status: "dev", href: "/products#hr", accent: "#0F766E", Widget: HrWidget },
  { id: "simulator", name: "Decision Simulator Suite", short: "Simulator", Icon: Zap, modules: 8,
    desc: "See the exact cash impact of every major decision before you make it. 8 scenarios. Your live data.",
    status: "dev", href: "/products#simulator", accent: "#C41E1E", Widget: SimulatorWidget },
  { id: "market", name: "Market & Growth Intelligence", short: "Market", Icon: BarChart3, modules: 6,
    desc: "Know where you stand in your industry, what you qualify for, and when you're ready to grow.",
    status: "dev", href: "/products#market", accent: "#DC6B19", Widget: MarketWidget },
  { id: "banking", name: "Banking & Fintech Intelligence", short: "Banking", Icon: Building2, modules: 6,
    desc: "All your bank accounts, UPI transactions, and loan options, unified and intelligently analyzed.",
    status: "dev", href: "/products#banking", accent: "#1A4A8B", Widget: BankingWidget },
  { id: "ca-partner", name: "CA & Partner Ecosystem", short: "CA Partner", Icon: Briefcase, modules: 4,
    desc: "For CA firms managing 50+ SME clients, a white-label intelligence platform that makes you indispensable.",
    status: "dev", href: "/products#ca-partner", accent: "#8B6914", Widget: CaWidget },
];

const AUTO_MS = 8000;

export default function SuitesSection() {
  const ref = useScrollReveal();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  const next = useCallback(() => setIndex((i) => (i + 1) % SUITES.length), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + SUITES.length) % SUITES.length), []);

  // Auto-rotate
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(next, AUTO_MS);
    return () => clearTimeout(t);
  }, [index, paused, next]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    touchStart.current = null;
  };

  const suite = SUITES[index];
  const { Icon, Widget } = suite;
  const isLive = suite.status === "live";

  return (
    <section className="bg-fyn-beige py-24" ref={ref}>
      <div className="fyn-container">
        <span className="fyn-caption text-fyn-gold block mb-4 reveal-up text-base">What FynHelp Does</span>
        <h2 className="text-3xl md:text-4xl leading-[1.2] text-fyn-ink mb-3 reveal-up font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>
          10 intelligence suites. 50+ modules. One AI connecting everything.
        </h2>
        <p className="text-fyn-ink/60 text-lg mb-12 max-w-3xl reveal-up" style={{ transitionDelay: "100ms", fontFamily: "'Roboto', sans-serif" }}>
          Most financial tools give you dashboards. FynHelp gives you a CFO who has read every dashboard and tells you what matters.
        </p>

        {/* Carousel */}
        <div
          className="relative reveal-up"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Arrows */}
          <button
            onClick={prev}
            aria-label="Previous suite"
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 lg:-translate-x-6 z-20 w-12 h-12 items-center justify-center rounded-full bg-fyn-ink text-white shadow-lg hover:scale-110 transition-transform"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            aria-label="Next suite"
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 lg:translate-x-6 z-20 w-12 h-12 items-center justify-center rounded-full bg-fyn-ink text-white shadow-lg hover:scale-110 transition-transform"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Slide frame */}
          <div
            key={suite.id}
            className="relative rounded-2xl overflow-hidden border border-fyn-ink/10 bg-fyn-beige-card animate-[fade-in_0.4s_ease-out]"
            style={{
              minHeight: 460,
              boxShadow: "0 20px 60px -20px rgba(26,16,8,0.18)",
            }}
          >
            {/* Layered background, accent gradient + faux dashboard pattern */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 85% 15%, ${suite.accent}22, transparent 55%), radial-gradient(circle at 10% 90%, ${suite.accent}18, transparent 50%), linear-gradient(180deg, #FAF6EC 0%, #F4EDDA 100%)`,
              }}
            />
            {/* Faint grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.06] pointer-events-none"
              style={{
                backgroundImage: "linear-gradient(#1A1008 1px, transparent 1px), linear-gradient(90deg, #1A1008 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            {/* In-development watermark */}
            {!isLive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                <span
                  className="text-[140px] md:text-[200px] font-bold whitespace-nowrap text-fyn-ink/[0.04] -rotate-12 select-none"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  IN DEVELOPMENT
                </span>
              </div>
            )}

            {/* Content grid */}
            <div className={`relative grid lg:grid-cols-2 gap-8 p-8 md:p-12 ${!isLive ? "opacity-95" : ""}`}>
              {/* Left: text */}
              <div className="flex flex-col justify-center order-2 lg:order-1">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: suite.accent, color: "white" }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded bg-fyn-ink/8 text-fyn-ink/70 font-medium"
                    style={{ fontFamily: "'Work Sans', sans-serif" }}
                  >
                    {suite.modules} Modules
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded text-white font-medium"
                    style={{
                      background: isLive ? "#10B981" : "#6B7280",
                      fontFamily: "'Work Sans', sans-serif",
                    }}
                  >
                    {isLive ? "Available Now" : "In Development"}
                  </span>
                </div>

                <h3
                  className="text-3xl md:text-4xl text-fyn-ink mb-4 leading-tight"
                  style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
                >
                  {suite.name}
                </h3>
                <p
                  className="text-fyn-ink/70 text-base md:text-lg leading-relaxed mb-7 max-w-md"
                  style={{ fontFamily: "'Roboto', sans-serif" }}
                >
                  {suite.desc}
                </p>

                <Link
                  to={suite.href}
                  className="inline-flex items-center gap-2 self-start px-5 py-3 rounded-md bg-fyn-red text-white text-sm font-medium hover:bg-fyn-red/90 transition-colors"
                  style={{ fontFamily: "'Raleway', sans-serif" }}
                >
                  Explore {suite.short} →
                </Link>
              </div>

              {/* Right: widget mock */}
              <div className="order-1 lg:order-2 flex items-center justify-center">
                <div
                  className={`w-full max-w-md rounded-xl bg-white/85 backdrop-blur-sm border border-fyn-ink/10 p-5 md:p-6 ${
                    !isLive ? "saturate-[0.8]" : ""
                  }`}
                  style={{
                    boxShadow: "0 12px 40px -12px rgba(26,16,8,0.18)",
                  }}
                >
                  {/* Faux window chrome */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-fyn-ink/8">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-fyn-red/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-fyn-warning/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-fyn-success/70" />
                    </div>
                    <span
                      className="text-[10px] uppercase tracking-wider text-fyn-ink/40"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {suite.short.toLowerCase().replace(/\s+/g, "-")}.fynhelp
                    </span>
                  </div>
                  <Widget />
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="absolute left-0 right-0 bottom-0 h-1 bg-fyn-ink/8">
              <div
                className="h-full bg-fyn-red transition-all"
                style={{
                  width: paused ? "0%" : "100%",
                  transitionDuration: paused ? "0ms" : `${AUTO_MS}ms`,
                  transitionTimingFunction: "linear",
                }}
                key={`${index}-${paused}`}
              />
            </div>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {SUITES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIndex(i)}
                aria-label={`Go to ${s.name}`}
                className="group h-2 rounded-full transition-all"
                style={{
                  width: i === index ? 28 : 8,
                  background: i === index ? "#C41E1E" : "rgba(26,16,8,0.2)",
                }}
              />
            ))}
          </div>
          <div
            className="text-center mt-3 text-xs text-fyn-ink/50"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {String(index + 1).padStart(2, "0")} / {String(SUITES.length).padStart(2, "0")}
          </div>
        </div>
      </div>
    </section>
  );
}
