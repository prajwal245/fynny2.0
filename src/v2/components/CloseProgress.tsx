/**
 * Monthly close progress for one client, plus the single next best action.
 * Both are derived in the store from real counts, never hardcoded.
 *
 * Compact (a Portfolio row): five segments and the stage the client is at.
 * Full (the client's page): the five stages, each opening into the steps inside it, who does each step,
 * and, set apart and never counted, the work that happens in the firm's own books.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { CLOSE_STAGES, CloseState, useV2 } from "../store";
import { V } from "../ui";
import {
  KIND_LABEL,
  OUTSIDE_LABEL,
  OUTSIDE_STEPS,
  currentPhase,
  stepsDone,
  type StepStatus,
  type WorkflowKind,
} from "../lib/closeWorkflow";

const KIND_TINT: Record<WorkflowKind, { bg: string; fg: string }> = {
  agent: { bg: V.gray, fg: V.body },
  you: { bg: "rgba(176,122,24,.12)", fg: V.warnFg },
  partner: { bg: "rgba(74,143,191,.12)", fg: V.brandDeep },
};

function Marker({ status, size = 18 }: { status: StepStatus; size?: number }) {
  const base = {
    width: size,
    height: size,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    flex: "none",
  } as const;
  if (status === "done")
    return (
      <span
        aria-hidden="true"
        style={{ ...base, background: "var(--v2-good-bg)", color: V.green }}
      >
        <Check size={size - 7} strokeWidth={3} />
      </span>
    );
  if (status === "current")
    return (
      <span
        aria-hidden="true"
        style={{ ...base, boxShadow: `inset 0 0 0 2px ${V.maroon}` }}
      >
        <span
          style={{
            width: size - 12,
            height: size - 12,
            borderRadius: 999,
            background: V.maroon,
          }}
        />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      style={{ ...base, boxShadow: `inset 0 0 0 1.5px ${V.line}` }}
    />
  );
}

export function CloseProgress({
  state,
  compact = false,
}: {
  state: CloseState;
  compact?: boolean;
}) {
  const phase = currentPhase(state.workflow);
  const closed = state.steps.length > 0 && state.steps.every((s) => s.done);
  const [open, setOpen] = useState<string[]>([]);
  const { done, total } = stepsDone(state.workflow);

  if (compact) {
    return (
      <div
        role="img"
        aria-label={`Close progress: ${state.percent} percent${closed ? ", closed" : `, at ${state.stage}`}`}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5,minmax(0,1fr))",
            gap: 4,
          }}
        >
          {state.steps.map((s) => (
            <span
              key={s.stage}
              style={{
                height: 6,
                borderRadius: 999,
                background: s.done
                  ? V.green
                  : s.stage === state.stage
                    ? V.maroon
                    : V.gray,
                opacity: s.done || s.stage === state.stage ? 1 : 0.9,
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 7,
            fontSize: 12.5,
          }}
        >
          <span style={{ color: closed ? V.green : V.ink, fontWeight: 600 }}>
            {closed
              ? "Closed"
              : `Step ${CLOSE_STAGES.indexOf(state.stage) + 1} of ${CLOSE_STAGES.length}`}
          </span>
          <span className="num" style={{ color: V.muted }}>
            {state.percent}%
          </span>
        </div>
      </div>
    );
  }

  const expanded = (stage: string) =>
    open.includes(stage) !== (stage === phase && !closed);
  const toggle = (stage: string) =>
    setOpen((o) =>
      o.includes(stage) ? o.filter((x) => x !== stage) : [...o, stage],
    );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>Close progress</span>
        <span className="num" style={{ fontSize: 13.5, fontWeight: 600 }}>
          {state.percent} percent
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: V.gray,
          overflow: "hidden",
          marginTop: 10,
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${state.percent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            height: "100%",
            borderRadius: 999,
            background: closed ? V.green : V.ink,
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: V.muted, marginTop: 8 }}>
        {done} of {total} steps done
      </div>

      <ol
        style={{
          listStyle: "none",
          margin: "14px 0 0",
          padding: 0,
          display: "grid",
          gap: 6,
        }}
      >
        {CLOSE_STAGES.map((stage) => {
          const step = state.steps.find((x) => x.stage === stage)!;
          const inside = state.workflow.filter((w) => w.phase === stage);
          const status: StepStatus = step.done
            ? "done"
            : stage === phase
              ? "current"
              : "todo";
          const isOpen = expanded(stage);
          return (
            <li
              key={stage}
              aria-current={status === "current" ? "step" : undefined}
              style={{
                borderRadius: 12,
                background: status === "current" ? V.beige : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(stage)}
                aria-expanded={isOpen}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  width: "100%",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "auto auto minmax(0,1fr)",
                  gap: 10,
                  alignItems: "center",
                  padding: "9px 10px",
                  borderRadius: 12,
                }}
              >
                <Marker status={status} />
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: status === "todo" ? 400 : 600,
                    color: status === "todo" ? V.muted : V.ink,
                  }}
                >
                  {stage}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: V.muted,
                    textAlign: "right",
                    overflowWrap: "anywhere",
                    minWidth: 0,
                  }}
                >
                  {isOpen ? "" : step.detail}
                </span>
              </button>
              {isOpen && (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: "0 10px 10px 38px",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {inside.map((w) => (
                    <li
                      key={w.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto minmax(0,1fr)",
                        gap: 10,
                        alignItems: "start",
                      }}
                    >
                      <span style={{ paddingTop: 2 }}>
                        <Marker status={w.status} size={16} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 13,
                            fontWeight: w.status === "current" ? 600 : 500,
                            color: w.status === "todo" ? V.muted : V.ink,
                          }}
                        >
                          {w.title}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: KIND_TINT[w.kind].bg,
                              color: KIND_TINT[w.kind].fg,
                            }}
                          >
                            {KIND_LABEL[w.kind]}
                          </span>
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12.5,
                            color: V.body,
                            marginTop: 2,
                            lineHeight: 1.5,
                          }}
                        >
                          {w.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, color: V.muted }}>
          Around FynHelp: done in your books, not counted above
        </summary>
        <ul
          style={{
            listStyle: "none",
            margin: "10px 0 0",
            padding: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {OUTSIDE_STEPS.map((o) => (
            <li key={o.id} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 500 }}>{o.title}</span>{" "}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: V.gray,
                  color: V.body,
                }}
              >
                {OUTSIDE_LABEL[o.kind]}
              </span>
              <span style={{ display: "block", color: V.body }}>
                {o.detail}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function NextAction({
  state,
  onGo,
}: {
  state: CloseState;
  onGo: () => void;
}) {
  const { period } = useV2();
  const done = state.percent === 100;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        borderRadius: 20,
        padding: "18px 20px",
        background: done ? "rgba(31,90,70,.08)" : V.blue,
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: done ? V.green : V.brandDeep,
          }}
        >
          Next step for {period}
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 600, marginTop: 6 }}>
          {state.next.label}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: V.body,
            marginTop: 4,
            lineHeight: 1.55,
          }}
        >
          {state.next.why}
        </div>
      </div>
      <button className="v2-btn v2-btn-primary" onClick={onGo}>
        {done ? "Open MIS" : "Do it now"} <ArrowRight size={15} />
      </button>
    </motion.div>
  );
}
