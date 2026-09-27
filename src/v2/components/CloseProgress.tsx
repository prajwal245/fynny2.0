/**
 * Monthly close progress for one client, plus the single next best action.
 * Both are derived in the store from real counts, never hardcoded.
 */
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { CloseState, useV2 } from "../store";
import { V } from "../ui";

export function CloseProgress({ state, compact = false }: { state: CloseState; compact?: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: compact ? 10.5 : 11, letterSpacing: ".09em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>
          Close progress
        </span>
        <span className="num" style={{ fontSize: compact ? 11.5 : 12.5, fontWeight: 600 }}>{state.percent} percent</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "rgba(20,20,20,.07)", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${state.percent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 999, background: state.percent === 100 ? V.green : V.ink }}
        />
      </div>
      <div style={{ display: "flex", gap: compact ? 6 : 10, marginTop: 10, flexWrap: "wrap" }}>
        {state.steps.map((s) => (
          <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 15, height: 15, borderRadius: 999, display: "grid", placeItems: "center",
                background: s.done ? "rgba(31,90,70,.14)" : s.stage === state.stage ? V.beige : "rgba(20,20,20,.06)",
                color: s.done ? V.green : V.muted,
              }}
            >
              {s.done ? <Check size={10} /> : <span style={{ width: 4, height: 4, borderRadius: 999, background: "currentColor" }} />}
            </span>
            <span style={{ fontSize: compact ? 10.5 : 11.5, color: s.done ? V.body : s.stage === state.stage ? V.ink : V.muted, fontWeight: s.stage === state.stage ? 600 : 400 }}>
              {s.stage}
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <div style={{ display: "grid", gap: 4, marginTop: 12 }}>
          {state.steps.map((s) => (
            <div key={s.stage} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: V.muted }}>
              <span>{s.stage}</span>
              <span>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NextAction({ state, onGo }: { state: CloseState; onGo: () => void }) {
  const { period } = useV2();
  const done = state.percent === 100;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        borderRadius: 20, padding: "18px 20px",
        background: done ? "rgba(31,90,70,.08)" : V.blue,
        display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 700, color: done ? V.green : "#1B4763" }}>
          Next best action for {period}
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 600, marginTop: 6 }}>{state.next.label}</div>
        <div style={{ fontSize: 12.5, color: V.body, marginTop: 4, lineHeight: 1.55 }}>{state.next.why}</div>
      </div>
      <button className="v2-btn v2-btn-primary" onClick={onGo}>
        {done ? "Open MIS" : "Do it now"} <ArrowRight size={15} />
      </button>
    </motion.div>
  );
}
