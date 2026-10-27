/**
 * Segmented tabs with a sliding highlight. Keyboard: arrow keys move, Home and End jump. The highlight slides to
 * the chosen tab; with reduced motion it simply appears. Scrolls sideways on a phone instead of wrapping.
 */
import { useId, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { V } from "../ui";

export interface TabDef {
  key: string;
  label: string;
  /** A small mark after the label: a count, or a dot when something needs attention. */
  badge?: { text?: string; tone: "good" | "warn" | "bad" | "info" } | null;
}

const BADGE: Record<string, { bg: string; fg: string }> = {
  good: { bg: "rgba(47,107,79,.14)", fg: V.green },
  warn: { bg: V.warnBg, fg: V.warnFg },
  bad: { bg: "rgba(180,36,36,.12)", fg: V.maroon },
  info: { bg: V.blue, fg: V.ink },
};

export function AgentTabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (key: string) => void; label: string }) {
  const id = useId();
  const reduce = useReducedMotion();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (to: number) => {
    const t = tabs[(to + tabs.length) % tabs.length];
    onChange(t.key);
    refs.current[t.key]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} style={{ display: "flex", gap: 4, padding: 4, background: V.gray, borderRadius: 14, overflowX: "auto", scrollbarWidth: "none" }}>
      {tabs.map((t, i) => {
        const on = t.key === value;
        const b = t.badge ? BADGE[t.badge.tone] : null;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            role="tab"
            id={`${id}-${t.key}`}
            aria-selected={on}
            aria-controls={`${id}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); move(i + 1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); move(i - 1); }
              else if (e.key === "Home") { e.preventDefault(); move(0); }
              else if (e.key === "End") { e.preventDefault(); move(tabs.length - 1); }
            }}
            style={{ position: "relative", flex: "1 0 auto", border: 0, background: "transparent", padding: "9px 16px", borderRadius: 11, cursor: "pointer", font: "inherit", fontSize: 13.5, fontWeight: on ? 650 : 500, color: on ? V.ink : V.body, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap" }}
          >
            {on && (
              <motion.span
                layoutId={`${id}-pill`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0, borderRadius: 11, background: "linear-gradient(180deg, rgba(249,16,58,.28), rgba(249,16,58,.14))", boxShadow: "0 1px 0 rgba(255,255,255,.14) inset, 0 8px 18px -10px rgba(249,16,58,.7)" }}
              />
            )}
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7 }}>
              {t.label}
              {b && <span style={{ background: b.bg, color: b.fg, borderRadius: 999, minWidth: 8, height: t.badge?.text ? 18 : 8, padding: t.badge?.text ? "0 7px" : 0, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{t.badge?.text}</span>}
            </span>
          </button>
        );
      })}
      <span id={`${id}-panel`} hidden />
    </div>
  );
}
