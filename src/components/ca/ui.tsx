// Shared visual primitives for CA portal. Inter only.
import { ReactNode } from "react";

export const COLORS = {
  ink: "#171208",
  red: "#A93838",
  beige: "#F2EEE7",
  gold: "#8B6914",
  caSurface: "#FFFDF9",
  caBorder: "rgba(23,18,8,0.09)",
  pageBg: "#F2EEE7",
  divider: "rgba(23,18,8,0.09)",
  green: "#1F5A46",
  greenSoft: "#4ADE80",
  amber: "#F59E0B",
  amberSoft: "#FCD34D",
  blue: "#1A4A8B",
  blueSoft: "#3B82F6",
  redSoft: "#F87171",
};

export function PageWrap({ children }: { children: ReactNode }) {
  return <div className="px-8 py-8 font-sans" style={{ color: COLORS.ink }}>{children}</div>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[28px] font-bold leading-tight" style={{ color: COLORS.ink }}>{title}</h1>
        {sub && <p className="text-[15px] mt-1.5 max-w-2xl" style={{ color: "rgba(23,18,8,0.60)" }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "", dark = false, style }: { children: ReactNode; className?: string; dark?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-md p-6 ${className}`}
      style={{
        background: dark ? COLORS.ink : "#FFFDF9",
        border: dark ? "none" : `1px solid ${COLORS.caBorder}`,
        color: dark ? "#FFFFFF" : COLORS.ink,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function MetricCard({ label, value, sub, subColor, valueColor = "#FFFFFF", onClick }: {
  label: string; value: string; sub?: string; subColor?: string; valueColor?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-md p-6 ${onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5" : ""}`}
      style={{ background: COLORS.ink }}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] mb-3" style={{ color: COLORS.gold }}>{label}</div>
      <div className="text-[40px] font-bold leading-none mb-2" style={{ color: valueColor }}>{value}</div>
      {sub && <div className="text-[13px]" style={{ color: subColor || "rgba(255,255,255,0.60)" }}>{sub}</div>}
    </div>
  );
}

export function Chip({ children, tone = "gray" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "gray" | "gold" }) {
  const map: Record<string, { bg: string; text: string }> = {
    green: { bg: "#DCFCE7", text: "#166534" },
    amber: { bg: "#FEF3C7", text: "#92400E" },
    red: { bg: "#FEE2E2", text: "#991B1B" },
    blue: { bg: "#DBEAFE", text: "#1E40AF" },
    gray: { bg: "#F3F0E6", text: "rgba(23,18,8,0.60)" },
    gold: { bg: "#FEF3C7", text: COLORS.gold },
  };
  const c = map[tone];
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
}

export function PrimaryBtn({ children, onClick, full, size = "md", disabled, type = "button" }: {
  children: ReactNode; onClick?: () => void; full?: boolean; size?: "sm" | "md" | "lg"; disabled?: boolean; type?: "button" | "submit";
}) {
  const h = size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${h} rounded-md font-medium font-sans transition-opacity disabled:opacity-50 ${full ? "w-full" : ""}`}
      style={{ background: COLORS.red, color: "#FFFFFF" }}
    >
      {children}
    </button>
  );
}

export function SecondaryBtn({ children, onClick, full, size = "md", type = "button", disabled }: {
  children: ReactNode; onClick?: () => void; full?: boolean; size?: "sm" | "md" | "lg"; type?: "button" | "submit"; disabled?: boolean;
}) {
  const h = size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${h} rounded-md font-medium font-sans bg-white transition-colors hover:bg-[#F8F6F1] disabled:opacity-50 ${full ? "w-full" : ""}`}
      style={{ border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}
    >
      {children}
    </button>
  );
}

export function GhostLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-sm font-medium font-sans hover:underline" style={{ color: COLORS.red }}>
      {children}
    </button>
  );
}

export function HealthScoreBadge({ score, size = 32 }: { score: number; size?: number }) {
  const color = score >= 71 ? COLORS.green : score >= 41 ? COLORS.amber : COLORS.red;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E0CD" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color }}>{score}</span>
    </div>
  );
}
