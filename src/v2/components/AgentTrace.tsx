/**
 * "An agent is working": a small live trace of what it is doing. Each step slides in, the current one shimmers and pulses, a finished
 * step gets a checkmark that springs in, and a line fills as the work advances. Used wherever the platform reads, matches or checks
 * something, so waiting always shows what is happening instead of a blank screen.
 *
 * `active` says whether the work is still going. While it is, the steps advance by themselves (they describe real stages of the
 * work, and the timing is only the pace of the telling); when it ends, every step completes. With reduced motion there is no
 * movement: the steps are listed with their state.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { AgentGlyph, ShimmerText, type AgentKey } from "../agents";
import { V } from "../ui";

export function useStepper(count: number, active: boolean, everyMs = 950): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return void setI(count);
    setI(0);
    const t = setInterval(() => setI((n) => Math.min(n + 1, Math.max(0, count - 1))), everyMs);
    return () => clearInterval(t);
  }, [active, count, everyMs]);
  return i;
}

export function AgentTrace({
  agent,
  title,
  steps,
  active = true,
  compact = false,
  everyMs = 950,
}: {
  agent: AgentKey;
  title: string;
  steps: string[];
  active?: boolean;
  compact?: boolean;
  everyMs?: number;
}) {
  const reduce = useReducedMotion();
  const at = useStepper(steps.length, active, everyMs);
  const done = !active;
  const pct = done ? 100 : Math.round(((at + 0.5) / Math.max(1, steps.length)) * 100);
  return (
    <div role="status" aria-live="polite" aria-label={`${title}${done ? ", finished" : ""}`} data-testid="agent-trace" style={{ display: "grid", gap: compact ? 8 : 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <AgentGlyph agent={agent} state={done ? "succeeded" : "running"} size={compact ? 26 : 32} />
        <div style={{ fontWeight: 600, color: V.ink, fontSize: compact ? 13.5 : 15 }}>
          {done ? title : <ShimmerText text={title} agent={agent} />}
        </div>
      </div>
      <div aria-hidden style={{ height: 3, borderRadius: 999, background: V.line, overflow: "hidden" }}>
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} style={{ height: "100%", background: V.brand, borderRadius: 999 }} />
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: compact ? 4 : 6 }}>
        <AnimatePresence initial={false}>
          {steps.map((label, n) => {
            const state: "done" | "active" | "pending" = done || n < at ? "done" : n === at ? "active" : "pending";
            if (state === "pending" && !reduce) return null;
            return (
              <motion.li
                key={label}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: state === "pending" ? 0.45 : 1, y: 0 }}
                transition={{ duration: 0.25 }}
                style={{ display: "flex", alignItems: "center", gap: 9, fontSize: compact ? 12.5 : 13.5, color: state === "done" ? V.body : V.ink }}
              >
                <span aria-hidden style={{ width: 18, height: 18, display: "grid", placeItems: "center", flex: "none" }}>
                  {state === "done" ? (
                    <motion.span initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 22 }} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 999, background: "var(--v2-good-bg)", color: V.green }}>
                      <Check size={11} strokeWidth={3} />
                    </motion.span>
                  ) : state === "active" ? (
                    <span className="v2-dot" style={{ background: V.brand }} />
                  ) : (
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: V.line }} />
                  )}
                </span>
                <span>{state === "active" && !reduce ? <ShimmerText text={label} agent={agent} /> : label}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}

/** A line for a saving or sending state: the agent's mark and shimmering words, in place of a disabled button label. */
export function AgentWorking({ agent, text }: { agent: AgentKey; text: string }) {
  return (
    <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <AgentGlyph agent={agent} state="running" size={20} />
      <ShimmerText text={text} agent={agent} />
    </span>
  );
}
