import { Inbox, LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon = Inbox,
  title = "No data yet",
  hint,
  className = "",
  compact = false,
}: {
  icon?: LucideIcon;
  title?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${className}`}
      style={{ padding: compact ? "20px 12px" : "40px 16px", color: "hsl(var(--fyn-ink) / 0.55)" }}
    >
      <span
        className="grid place-items-center rounded-full mb-3"
        style={{
          width: compact ? 40 : 56,
          height: compact ? 40 : 56,
          background: "rgba(139,105,20,0.08)",
          border: "1px dashed rgba(139,105,20,0.3)",
        }}
      >
        <Icon size={compact ? 18 : 24} color="#8B6914" />
      </span>
      <div style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: compact ? 13 : 15, color: "hsl(var(--fyn-ink))" }}>
        {title}
      </div>
      {hint && (
        <div className="mt-1" style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, maxWidth: 320, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
