import type { SuiteStatus } from "@/data/suiteStatus";

interface Props {
  status: SuiteStatus;
  className?: string;
}

/**
 * Small pill badge used across the marketing site to mark suites as
 * "Live" (green) or "In Development" (gray). No emoji, minimal design.
 */
export default function SuiteStatusBadge({ status, className = "" }: Props) {
  const isLive = status === "live";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide text-white ${className}`}
      style={{
        backgroundColor: isLive ? "#1F5A46" : "#6B7280",
        lineHeight: 1.4,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {isLive ? "Live" : "Coming Soon"}
    </span>
  );
}
