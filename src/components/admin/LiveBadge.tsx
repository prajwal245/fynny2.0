type Status = "connecting" | "live" | "offline";

export function LiveBadge({ status }: { status: Status }) {
  const cfg =
    status === "live"
      ? { dot: "#1F5A46", bg: "rgba(16,185,129,0.12)", fg: "#0F7B4F", label: "Live" }
      : status === "connecting"
      ? { dot: "#B45309", bg: "rgba(245,158,11,0.15)", fg: "#B45309", label: "Connecting…" }
      : { dot: "hsl(var(--fyn-ink) / 0.4)", bg: "rgba(23,18,8,0.06)", fg: "hsl(var(--fyn-ink) / 0.7)", label: "Offline" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: cfg.bg,
        color: cfg.fg,
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 600,
        fontSize: 11,
      }}
      title={`Realtime: ${cfg.label}`}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: cfg.dot,
          boxShadow: status === "live" ? `0 0 0 0 ${cfg.dot}` : "none",
          animation: status === "live" ? "fyn-live-pulse 1.6s ease-out infinite" : undefined,
        }}
      />
      {cfg.label}
      <style>{`@keyframes fyn-live-pulse { 0%{box-shadow:0 0 0 0 rgba(16,185,129,0.55)} 70%{box-shadow:0 0 0 6px rgba(16,185,129,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} }`}</style>
    </span>
  );
}
