/**
 * FynHelp v2 — agentic design language.
 * Four agents, one visual identity each, plus the shared components that make
 * their work visible: status badges, processing cards, animated counters,
 * timelines and progress steps.
 */
import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { V } from "./ui";

export type AgentKey = "extract" | "recon" | "narrate" | "chaser";

export const AGENTS: Record<AgentKey, { name: string; tint: string; ink: string; dot: string; verb: string }> = {
  extract: { name: "Extract", tint: "#E4F0FA", ink: "#1B4763", dot: "#4A8FBF", verb: "Extracting" },
  recon: { name: "Recon", tint: "#E1F1EA", ink: "#1F5A46", dot: "#3E8E72", verb: "Matching transactions" },
  narrate: { name: "Narrate", tint: "#ECE7F6", ink: "#443168", dot: "#7A63B0", verb: "Generating MIS" },
  chaser: { name: "Chaser", tint: "#FAEFD6", ink: "#6B4E0C", dot: "#C9962A", verb: "Sending follow up" },
};

export const AGENT_STYLES = `
@keyframes v2pulse { 0%{ transform:scale(1); opacity:1 } 50%{ transform:scale(1.9); opacity:0 } 100%{ transform:scale(1.9); opacity:0 } }
.v2-dot { position:relative; width:7px; height:7px; border-radius:999px; display:inline-block; flex:0 0 7px; }
.v2-dot::after { content:""; position:absolute; inset:0; border-radius:999px; background:inherit; animation:v2pulse 1.6s ease-out infinite; }
.v2-lift { transition:transform .22s ease, box-shadow .22s ease; }
.v2-lift:hover { transform:translateY(-3px); box-shadow:0 2px 4px rgba(20,20,20,.05), 0 22px 40px -30px rgba(20,20,20,.55); }
.v2-btn:active { transform:translateY(1px) scale(.985); }
.v2-bar { height:3px; border-radius:999px; overflow:hidden; background:rgba(20,20,20,.07); }
.v2-bar > i { display:block; height:100%; border-radius:999px; animation:v2sweep 1.5s ease-in-out infinite; }
@keyframes v2sweep { 0%{ margin-left:-40%; width:40% } 100%{ margin-left:100%; width:40% } }
`;

/** Small pulsing identity badge. Pulses only while the agent is active. */
export function AgentStatusBadge({ agent, label, active = false }: { agent: AgentKey; label?: string; active?: boolean }) {
  const a = AGENTS[agent];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, background: a.tint, color: a.ink,
        borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
      }}
    >
      {active ? (
        <span className="v2-dot" style={{ background: a.dot }} />
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: 999, background: a.dot, opacity: 0.45 }} />
      )}
      {label ?? a.name}
    </span>
  );
}

/** Live "agent is working" card with stepper and sweeping progress bar. */
export function ProcessingCard({
  agent, title, steps, current,
}: { agent: AgentKey; title: string; steps: string[]; current: number }) {
  const a = AGENTS[agent];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="v2-card"
      style={{ padding: 18, borderColor: a.tint, background: "#fff" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <AgentStatusBadge agent={agent} active />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={current}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            style={{ fontSize: 12.5, color: V.body }}
          >
            {steps[Math.min(current, steps.length - 1)]}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="v2-bar" style={{ marginTop: 14 }}>
        <i style={{ background: a.dot }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {steps.map((s, i) => (
          <span
            key={s}
            style={{
              fontSize: 11, padding: "3px 9px", borderRadius: 999,
              background: i < current ? a.tint : V.gray,
              color: i < current ? a.ink : V.muted,
              fontWeight: 600, transition: "all .3s ease",
            }}
          >
            {i < current ? "Done" : `0${i + 1}`} {s}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/** Number that animates from its previous value to the new one. */
export function AnimatedCounter({ value, prefix = "", format }: { value: number; prefix?: string; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="num">{prefix}{format ? format(shown) : shown}</span>;
}

/** Vertical activity timeline. Entries appear one after another. */
export function AgentTimeline({ items }: { items: { at: string; text: string; agent?: AgentKey }[] }) {
  return (
    <div style={{ display: "grid", gap: 0 }}>
      <AnimatePresence initial={false}>
        {items.map((t, i) => {
          const a = t.agent ? AGENTS[t.agent] : null;
          return (
            <motion.div
              key={`${t.at}-${t.text}-${i}`}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.05 }}
              style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 12, paddingBottom: i === items.length - 1 ? 0 : 16 }}
            >
              <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: a?.dot ?? V.ink, marginTop: 4 }} />
                {i !== items.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 22, background: V.line }} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{t.text}</div>
                <div className="num" style={{ fontSize: 11.5, color: V.muted, marginTop: 2 }}>{t.at}</div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Skeleton shaped like the real content that replaces it. */
export function RowSkeleton({ rows = 3, height = 54 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="v2-skel" style={{ height, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
