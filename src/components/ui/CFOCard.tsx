import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import CountUpImport from "react-countup";
// react-countup ships CJS; some bundler paths hand back { default: Component }.
const CountUp = ((CountUpImport as unknown as { default?: typeof CountUpImport })?.default ?? CountUpImport) as typeof CountUpImport;
import { colors, shimmer, pulseGlow, typography } from "@/lib/design-system";

interface CFOCardProps {
  title: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  icon: LucideIcon;
  trend?: string;
  status?: "good" | "warning" | "danger" | "neutral";
  subtitle?: string;
  animated?: boolean;
}

export function CFOCard({
  title,
  value,
  prefix = "",
  suffix = "",
  icon: Icon,
  trend,
  status = "neutral",
  subtitle,
  animated = true,
}: CFOCardProps) {
  const statusColors: Record<NonNullable<CFOCardProps["status"]>, string> = {
    good: colors.success.main,
    warning: colors.warning.main,
    danger: colors.danger.main,
    neutral: colors.text.tertiary,
  };

  const numericValue =
    typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;

  return (
    <motion.div
      initial="rest"
      whileHover="hover"
      animate="rest"
      variants={{
        rest: { y: 0, rotateX: 0, scale: 1 },
        hover: {
          y: -12,
          rotateX: 5,
          scale: 1.03,
          transition: { type: "spring", stiffness: 300, damping: 20 },
        },
      }}
      style={{
        transformStyle: "preserve-3d",
        perspective: 1000,
        boxShadow:
          "0 8px 32px rgba(196,30,30, 0.15), 0 4px 16px rgba(0, 0, 0, 0.4)",
        borderRadius: 16,
      }}
      className="relative group"
    >
      {/* Shimmer sweep on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none z-20"
        style={{
          background: `linear-gradient(110deg, transparent 0%, ${colors.primary[500]}33 50%, transparent 100%)`,
          backgroundSize: "200% 100%",
          backgroundPosition: "200% 0",
          mixBlendMode: "screen",
        }}
        variants={{
          rest: { backgroundPosition: "200% 0", opacity: 0 },
          hover: {
            backgroundPosition: "-200% 0",
            opacity: 1,
            transition: { duration: 1.2, ease: "linear" },
          },
        }}
      />
      {/* Main card */}
      <div
        className="relative rounded-2xl border overflow-hidden"
        style={{
          background: "#1F0E07",
          borderColor: "rgba(244,237,218,0.08)",
        }}
      >
        {/* Inner gradient overlay */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(244,237,218,0.10) 0%, transparent 100%)",
          }}
        />
        {/* Animated accent glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 30% 0%, rgba(196,30,30,0.20), transparent 60%), radial-gradient(circle at 80% 100%, rgba(201,168,76,0.10), transparent 60%)",
          }}
          {...pulseGlow}
        />

        {/* Content */}
        <div className="relative z-10" style={{ padding: 32 }}>
          {/* Header (icon circle intentionally removed per brand spec) */}
          <div className="flex items-center justify-between mb-5">
            <span
              className="text-xs font-semibold uppercase"
              style={{
                color: "#8B6914",
                fontFamily: typography.heading.fontFamily,
                letterSpacing: "0.18em",
                fontSize: 9,
              }}
            >
              {title}
            </span>
          </div>


          {/* Value with count-up */}
          <div className="mb-2">
            <div
              className="font-bold leading-tight"
              style={{
                fontSize: 48,
                color: colors.text.primary,
                fontFamily: typography.numbers.fontFamily,
                fontFeatureSettings: typography.numbers.fontFeatureSettings,
                letterSpacing: "-0.01em",
              }}
            >
              {prefix}
              {animated && !isNaN(numericValue) ? (
                <CountUp
                  end={numericValue}
                  duration={2}
                  separator=","
                  decimals={Number.isInteger(numericValue) ? 0 : 2}
                  preserveValue
                />
              ) : (
                value
              )}
              {suffix}
            </div>
          </div>

          {/* Subtitle */}
          {subtitle && (
            <div
              className="text-sm mb-2"
              style={{
                color: colors.text.tertiary,
                fontFamily: typography.body.fontFamily,
              }}
            >
              {subtitle}
            </div>
          )}

          {/* Trend indicator */}
          {trend && (
            <div
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: statusColors[status] }}
            >
              <span className="text-base leading-none">
                {status === "good" && "↑"}
                {status === "danger" && "↓"}
                {status === "warning" && "→"}
                {status === "neutral" && "→"}
              </span>
              <span>{trend}</span>
            </div>
          )}
        </div>

        {/* Bottom accent line (shimmer) */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
          <motion.div
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, #C9A84C, transparent)",
            }}
            {...shimmer}
          />
        </div>
      </div>
    </motion.div>
  );
}

export default CFOCard;
