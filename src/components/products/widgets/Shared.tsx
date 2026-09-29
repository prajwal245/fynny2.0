import { ReactNode } from "react";

export const FYN = {
  red: "#C41E1E",
  redBright: "#FF4444",
  ink: "#1A1A1A",
  white: "#FFFFFF",
  beige: "#FAFAF8",
  gray: "#6B7280",
  green: "#1F5A46",
  grayDev: "#9CA3AF",
};

export function MetricCard({
  label,
  value,
  delta,
  deltaPositive = true,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #FAFAF8 0%, #FFFFFF 100%)",
        borderLeft: `4px solid ${FYN.red}`,
        padding: "16px 20px",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          fontFamily: "'Raleway', sans-serif",
          fontWeight: 600,
          fontSize: 11,
          color: FYN.gray,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 28,
          color: FYN.red,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {delta && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            fontSize: 12,
            color: deltaPositive ? FYN.green : FYN.red,
          }}
        >
          {deltaPositive ? "▲" : "▼"} {delta}
        </div>
      )}
    </div>
  );
}

export function ImpactStat({ stat, source }: { stat: string; source?: string }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${FYN.red} 0%, ${FYN.redBright} 100%)`,
        color: FYN.white,
        padding: "20px 24px",
        borderRadius: 16,
        boxShadow: "0 12px 32px rgba(196,30,30,0.3)",
      }}
    >
      <div
        style={{
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 700,
          fontSize: 22,
          lineHeight: 1.3,
        }}
      >
        ✓ {stat}
      </div>
      {source && (
        <div
          style={{
            fontFamily: "'Roboto', sans-serif",
            fontSize: 12,
            color: "rgba(255,255,255,0.85)",
            marginTop: 6,
          }}
        >
          {source}
        </div>
      )}
    </div>
  );
}

export function WidgetShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="fyn-widget-shell"
      style={{
        background: FYN.white,
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)",
        border: "1px solid rgba(107,114,128,0.1)",
        position: "relative",
        overflow: "hidden",
        transformStyle: "preserve-3d",
        perspective: 1000,
        transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {children}
      {/* Shimmer */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
          animation: "fyn-shimmer 3.5s infinite",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
