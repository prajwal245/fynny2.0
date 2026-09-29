/**
 * Shared intelligence-tab primitives. Beige theme, white cards, alive micro-animations.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { ArrowUpRight, Upload, RefreshCw } from "lucide-react";
import CountUpImport from "react-countup";
// react-countup ships CJS; some bundler paths hand back { default: Component }.
const CountUp = ((CountUpImport as unknown as { default?: typeof CountUpImport })?.default ??
  CountUpImport) as typeof CountUpImport;
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/indian-format";
import { useMode } from "./DataSource";

export const ACCENT = {
  red: "#A93838",
  redLight: "#C94848",
  gold: "#8B6914",
  goldLight: "#C9A84C",
  green: "#1F5A46",
  amber: "#8B6914",
  gray: "rgba(23,18,8,0.62)",
  ink: "#171208",
} as const;

export const EMPTY = "—";

export type HealthTone = "healthy" | "warning" | "critical" | "neutral";

const toneBorder: Record<HealthTone, string> = {
  healthy: ACCENT.green,
  warning: ACCENT.goldLight,
  critical: ACCENT.red,
  neutral: "transparent",
};
const tonePulseClass: Record<HealthTone, string> = {
  healthy: "fyn-pulse-green",
  warning: "fyn-pulse-gold",
  critical: "fyn-pulse-red",
  neutral: "",
};
const toneBreathClass: Record<HealthTone, string> = {
  healthy: "fyn-breath-green",
  warning: "fyn-breath-gold",
  critical: "fyn-breath-red",
  neutral: "",
};

/* ── Page shell ─────────────────────────────────────────── */
export function IntelPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-[1440px] mx-auto p-6 space-y-6 fyn-stagger", className)}>{children}</div>;
}

export function IntelHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="font-serif text-3xl text-fyn-ink font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-[rgba(23,18,8,0.62)] mt-1 max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── Card ───────────────────────────────────────────────── */
export function IntelCard({
  children,
  className,
  title,
  sub,
  action,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  tone?: HealthTone;
}) {
  const borderLeft = tone === "neutral" ? "1px solid rgba(23,18,8,0.08)" : `3px solid ${toneBorder[tone]}`;
  return (
    <div
      className={cn("bg-white rounded-lg p-5 fyn-card-hover", tone !== "neutral" && tonePulseClass[tone], className)}
      style={{
        border: "1px solid rgba(23,18,8,0.08)",
        borderLeft,
        boxShadow: "0 2px 8px rgba(23,18,8,0.06)",
      }}
    >
      {(title || action) && (
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            {title && <h3 className="font-serif text-base text-fyn-ink font-semibold">{title}</h3>}
            {sub && <p className="text-xs text-[rgba(23,18,8,0.62)] mt-0.5">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── KPI ────────────────────────────────────────────────── */
export function KPI({
  label,
  value,
  delta,
  deltaTone = "neutral",
  sub,
  href,
  tone = "neutral",
  count,
  format,
  prefix,
  suffix,
  isEmpty,
  emptySub = "Upload data to calculate",
}: {
  label: string;
  value?: ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  sub?: string;
  href?: string;
  tone?: HealthTone;
  /** Numeric value to count up to. If provided, used over `value`. */
  count?: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  /** Force empty state ("—" + emptySub). */
  isEmpty?: boolean;
  emptySub?: string;
}) {
  const deltaColor = deltaTone === "up" ? ACCENT.green : deltaTone === "down" ? ACCENT.red : ACCENT.gray;
  const Wrap: any = href ? Link : "div";

  const showEmpty = !!isEmpty;
  const borderLeft = tone === "neutral" || showEmpty ? "1px solid rgba(23,18,8,0.08)" : `3px solid ${toneBorder[tone]}`;
  const pulseClass = !showEmpty && tone !== "neutral" ? tonePulseClass[tone] : "";

  const renderedValue: ReactNode = showEmpty
    ? EMPTY
    : count !== undefined && Number.isFinite(count)
    ? <CountUp end={count} duration={1.2} preserveValue separator="," decimals={Number.isInteger(count) ? 0 : 2} formattingFn={format} prefix={prefix} suffix={suffix} />
    : value ?? EMPTY;

  return (
    <Wrap
      to={href}
      className={cn(
        "block bg-white rounded-lg p-4 group fyn-card-hover fyn-card-enter",
        pulseClass,
        href && "cursor-pointer",
      )}
      style={{
        border: "1px solid rgba(23,18,8,0.08)",
        borderLeft,
        boxShadow: "0 2px 8px rgba(23,18,8,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-[rgba(23,18,8,0.62)] font-medium">{label}</p>
        {href && <ArrowUpRight className="w-3.5 h-3.5 text-[rgba(23,18,8,0.62)] opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      <p className={cn("font-mono text-2xl text-fyn-ink font-semibold tabular-nums", showEmpty && "text-[#9B9B9B]")}>
        {renderedValue}
      </p>
      <div className="flex items-center gap-2 mt-1.5">
        {!showEmpty && delta && (
          <span className={cn("text-xs font-medium inline-flex items-center gap-0.5", deltaTone === "up" && "fyn-trend-up", deltaTone === "down" && "fyn-trend-down", toneBreathClass[tone])} style={{ color: deltaColor }}>
            {deltaTone === "up" && <span className="fyn-arrow">↑</span>}
            {deltaTone === "down" && <span className="fyn-arrow">↓</span>}
            {delta}
          </span>
        )}
        {!showEmpty && sub && <span className="text-xs text-[rgba(23,18,8,0.62)]">{sub}</span>}
        {showEmpty && <span className="text-xs text-[#9B9B9B]">{emptySub}</span>}
      </div>
    </Wrap>
  );
}

/* ── Badge ──────────────────────────────────────────────── */
export type BadgeTone = "green" | "red" | "amber" | "gold" | "gray" | "orange";
export function Badge({ children, tone = "gray", breathe }: { children: ReactNode; tone?: BadgeTone; breathe?: boolean }) {
  const styles: Record<BadgeTone, string> = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
    gold: "bg-yellow-50 text-yellow-700",
    gray: "bg-slate-100 text-slate-700",
  };
  const breathClass = breathe
    ? tone === "green" ? "fyn-breath-green" : tone === "red" ? "fyn-breath-red" : tone === "amber" || tone === "gold" ? "fyn-breath-gold" : ""
    : "";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium", styles[tone], breathClass)}>
      {children}
    </span>
  );
}

/* ── Empty state ────────────────────────────────────────── */
export function EmptyState({
  title = "No data yet",
  description = "Upload CSV or connect integrations to see insights here.",
  icon = <Upload className="w-5 h-5" />,
  cta,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  cta?: { label: string; href: string } | null;
}) {
  const mode = useMode();
  const resolvedCta =
    cta === undefined
      ? { label: "Upload CSV", href: "/dashboard/data-import" }
      : cta;
  return (
    <div className="text-center py-10 px-4">
      <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 text-[rgba(23,18,8,0.62)]" style={{ background: "rgba(23,18,8,0.04)" }}>
        {icon}
      </div>
      <p className="font-serif text-sm text-fyn-ink font-semibold">{title}</p>
      <p className="text-xs text-[rgba(23,18,8,0.62)] mt-1 max-w-xs mx-auto">{description}</p>
      {resolvedCta && (
        <Link
          to={resolvedCta.href}
          className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-3 py-1.5 rounded-md text-white transition-colors"
          style={{ background: ACCENT.red }}
        >
          {resolvedCta.label}
        </Link>
      )}
    </div>
  );
}

export function WithData<T>({
  data,
  isLoading,
  emptyTitle,
  emptyDescription,
  cta,
  children,
}: {
  data: T[] | undefined;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  cta?: { label: string; href: string } | null;
  children: (data: T[]) => ReactNode;
}) {
  if (isLoading) return <div className="h-40 bg-slate-50 animate-pulse rounded-md" />;
  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} cta={cta} />;
  }
  return <>{children(data)}</>;
}

/* ── Animated horizontal bar (grows from 0 → pct on scroll into view) ── */
export function AnimatedBar({ pct, color, height = 6, delay = 0 }: { pct: number; color: string; height?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setTimeout(() => setW(Math.max(0, Math.min(100, pct))), delay);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pct, delay]);
  return (
    <div ref={ref} className="bg-slate-100 rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${w}%`, background: color, transition: "width 0.8s cubic-bezier(0.25,0.46,0.45,0.94)" }}
      />
    </div>
  );
}

/* ── Money formatters ────────────────────────────────────── */
export const fmtINR = (n: number) => formatINR(n);
export const fmtCompact = (n: number) => {
  if (!Number.isFinite(n)) return EMPTY;
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};
export const fmtPct = (n: number, digits = 1) => (Number.isFinite(n) ? `${n.toFixed(digits)}%` : EMPTY);

/* ── Live timestamp pill ─────────────────────────────────── */
export function LiveTimestamp() {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMins((m) => m + 1), 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[rgba(23,18,8,0.62)]">
      <RefreshCw className="w-3 h-3 fyn-slow-spin" />
      Live · Updated {mins === 0 ? "just now" : `${mins} min ago`}
    </span>
  );
}

/* ── Mode banner ────────────────────────────────────────── */
export function ModeBanner() {
  const mode = useMode();
  if (mode !== "demo") return null;
  return (
    <div className="rounded-md px-4 py-2 text-xs flex items-center justify-between gap-3" style={{ background: "rgba(169,56,56,0.08)", border: "1px solid rgba(169,56,56,0.2)" }}>
      <span className="text-fyn-ink"><strong>Demo data.</strong> Showing a fully-loaded FYNHelp account. Sign up to import your own data.</span>
      <Link to="/waitlist" className="font-medium text-white px-3 py-1 rounded" style={{ background: ACCENT.red }}>Get Started</Link>
    </div>
  );
}

/* ── Chart palette ───────────────────────────────────────── */
export const CHART = {
  redGrad: { id: "redGrad", from: ACCENT.redLight, to: ACCENT.red },
  goldGrad: { id: "goldGrad", from: ACCENT.goldLight, to: ACCENT.gold },
  axis: "#9B9B9B",
  grid: "rgba(23,18,8,0.06)",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "rgba(23,18,8,0.1)",
} as const;

// Render as a standalone hidden SVG so the gradient <defs> are guaranteed
// to be in the document (recharts v3 strips unknown children from charts,
// so an inline <defs> inside <BarChart> would not reach the DOM). SVG
// url(#id) references resolve document-wide, so a hidden SVG works for
// any chart on the page.
export function ChartGradients() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={CHART.redGrad.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART.redGrad.from} />
          <stop offset="100%" stopColor={CHART.redGrad.to} />
        </linearGradient>
        <linearGradient id={CHART.goldGrad.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART.goldGrad.from} />
          <stop offset="100%" stopColor={CHART.goldGrad.to} />
        </linearGradient>
      </defs>
    </svg>
  );
}
