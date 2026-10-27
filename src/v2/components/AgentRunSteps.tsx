/**
 * An agent working through a checklist, shown the way it happens: the agent's glyph runs and a line of shimmering
 * text says what it is doing, then each result appears one after another (a spring-in tick, or a shake for a
 * problem), and a verdict closes it. The results are the real ones: they are fetched first and only revealed one
 * by one, so nothing here is invented. With reduced motion everything appears at once.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Minus } from "lucide-react";
import { AGENTS, AgentGlyph, ShimmerText, type AgentKey } from "../agents";
import { V } from "../ui";

export interface RunStep {
  label: string;
  /** true: fine. false: a problem. null: not a problem, worth knowing. */
  ok: boolean | null;
  detail: string;
}

export function AgentRunSteps({
  agent,
  working,
  workingText,
  steps,
  verdict,
  stepMs = 320,
}: {
  agent: AgentKey;
  /** The request is still in flight. */
  working: boolean;
  workingText: string;
  /** Null until the results are in. */
  steps: RunStep[] | null;
  verdict?: { ok: boolean; text: string } | null;
  stepMs?: number;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const a = AGENTS[agent];

  // A new set of results starts the reveal again.
  useEffect(() => {
    if (!steps) {
      setShown(0);
      return;
    }
    if (reduce) {
      setShown(steps.length + 1);
      return;
    }
    setShown(0);
    let n = 0;
    const t = setInterval(() => {
      n++;
      setShown(n);
      if (n > steps.length) clearInterval(t);
    }, stepMs);
    return () => clearInterval(t);
  }, [steps, reduce, stepMs]);

  const revealing = Boolean(steps) && shown <= (steps?.length ?? 0);
  const state = working || revealing ? "running" : verdict ? (verdict.ok ? "succeeded" : "failed") : "idle";

  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="agent-run" data-state={state}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <AgentGlyph agent={agent} state={state} size={36} />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: a.ink, minHeight: 20 }} aria-live="polite">
          {working ? <ShimmerText text={workingText} agent={agent} /> : revealing ? <ShimmerText text="Reading the results…" agent={agent} /> : verdict ? verdict.text : ""}
        </div>
      </div>
      <ol role="status" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <AnimatePresence initial={false}>
          {steps?.slice(0, Math.min(shown, steps.length)).map((s) => (
            <motion.li
              key={s.label}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22 }}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: s.ok === false ? V.maroon : V.body, lineHeight: 1.5 }}
            >
              <motion.span
                aria-hidden="true"
                initial={reduce ? false : { scale: 0.2, opacity: 0 }}
                animate={s.ok === false && !reduce ? { scale: 1, opacity: 1, x: [0, -3, 3, -2, 0] } : { scale: 1, opacity: 1 }}
                transition={s.ok === false ? { duration: 0.4 } : { type: "spring", stiffness: 460, damping: 17 }}
                style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 999, display: "grid", placeItems: "center", marginTop: 1, background: s.ok === true ? "rgba(47,107,79,.14)" : s.ok === false ? "rgba(180,36,36,.12)" : V.gray, color: s.ok === true ? V.green : s.ok === false ? V.maroon : V.muted }}
              >
                {s.ok === true ? <Check size={12} strokeWidth={3} /> : s.ok === false ? <AlertTriangle size={11} strokeWidth={2.6} /> : <Minus size={12} strokeWidth={3} />}
              </motion.span>
              <span>
                <b style={{ color: V.ink }}>{s.label}.</b> {s.detail}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {steps && shown > steps.length && verdict && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ padding: "10px 14px", borderRadius: 12, fontWeight: 600, fontSize: 13.5, background: verdict.ok ? "rgba(47,107,79,.1)" : "rgba(180,36,36,.08)", color: verdict.ok ? V.green : V.maroon }}
        >
          {verdict.text}
        </motion.div>
      )}
    </div>
  );
}
