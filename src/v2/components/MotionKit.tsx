/**
 * Motion pieces taken from the interaction reference: a button that turns into a spinner and then a tick, a slider
 * with a live value, a card whose plus turns into a cross, and a card with a turning pinwheel.
 * All of it stops moving for people who ask for reduced motion.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { V } from "../ui";

export const MOTION_STYLES = `
.v2-sbtn { position:relative; display:inline-flex; align-items:center; justify-content:center; height:42px; border:0; border-radius:999px; padding:0 22px; font:inherit; font-size:14px; font-weight:600; color:#fff; cursor:pointer; background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); box-shadow:0 1px 0 rgba(255,255,255,.25) inset, 0 10px 24px -12px var(--v2-brand); overflow:hidden; }
.v2-sbtn:disabled:not([data-state]) { opacity:.5; cursor:not-allowed; }
.v2-sbtn[data-state="loading"], .v2-sbtn[data-state="success"] { cursor:default; }
.v2-sbtn[data-state="success"] { background:linear-gradient(180deg, #2FA36E, #1F7A52); box-shadow:0 10px 24px -12px #1F7A52; }
.v2-sbtn:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-spin { width:18px; height:18px; border-radius:50%; border:2.5px solid rgba(255,255,255,.35); border-top-color:#fff; animation:v2spin .7s linear infinite; }
.v2-slider { -webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:99px; outline:none; cursor:pointer; background:linear-gradient(90deg, var(--v2-brand) var(--fill, 0%), var(--v2-switch) var(--fill, 0%)); }
.v2-slider::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; border-radius:50%; background:#fff; border:0; box-shadow:0 2px 6px rgba(0,0,0,.35); transition:transform .3s cubic-bezier(.34,1.56,.64,1); }
.v2-slider::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:#fff; border:0; box-shadow:0 2px 6px rgba(0,0,0,.35); }
.v2-slider:active::-webkit-slider-thumb { transform:scale(1.2); }
.v2-slider:focus-visible { outline:2px solid ${V.brand}; outline-offset:6px; }
.v2-slider:disabled { opacity:.5; cursor:not-allowed; }
.v2-kit-card { position:relative; border-radius:22px; padding:20px; overflow:hidden; }
.v2-kit-plus { position:absolute; right:14px; top:14px; width:34px; height:34px; border-radius:50%; border:0; display:grid; place-items:center; background:rgba(0,0,0,.82); color:#fff; cursor:pointer; transition:transform .5s cubic-bezier(.34,1.56,.64,1); }
.v2-kit-plus[aria-expanded="true"] { transform:rotate(135deg); }
.v2-kit-plus:focus-visible { outline:2px solid #fff; outline-offset:2px; }
.v2-pinwheel { animation:v2-pin 18s linear infinite; transform-origin:50% 50%; }
@keyframes v2-pin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .v2-spin, .v2-pinwheel { animation:none !important; } }
`;

/**
 * A button that shows its own progress: it folds into a circle with a spinner while the action runs, turns into a
 * tick when it works, and unfolds back. Errors thrown by the action put it straight back to idle.
 */
export function StatefulButton({ label, onAction, disabled, successMs = 1400 }: { label: string; onAction: () => Promise<unknown>; disabled?: boolean; successMs?: number }) {
  const [state, setState] = useState<"idle" | "loading" | "success">("idle");
  const reduce = useReducedMotion();
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const click = async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      await onAction();
      if (!alive.current) return;
      setState("success");
      setTimeout(() => alive.current && setState("idle"), successMs);
    } catch {
      if (alive.current) setState("idle");
    }
  };
  const busy = state !== "idle";
  return (
    <motion.button
      type="button"
      className="v2-sbtn"
      data-state={busy ? state : undefined}
      disabled={disabled && !busy}
      aria-busy={state === "loading"}
      aria-label={state === "success" ? `${label}: done` : label}
      onClick={() => void click()}
      animate={{ width: busy ? 42 : "auto", paddingLeft: busy ? 0 : 22, paddingRight: busy ? 0 : 22 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === "idle" && (
          <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} style={{ whiteSpace: "nowrap" }}>{label}</motion.span>
        )}
        {state === "loading" && (
          <motion.span key="s" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="v2-spin" />
        )}
        {state === "success" && (
          <motion.span key="c" initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 18 }} style={{ display: "grid" }}>
            <Check size={20} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** A range slider with a live value on the right. */
export function Slider({ value, min, max, step = 1, onChange, onCommit, label, format = (n) => String(n), disabled }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void; /** Called once the person lets go, so a save does not run on every tick. */ onCommit?: (n: number) => void; label: string; format?: (n: number) => string; disabled?: boolean }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, width: "min(300px, 100%)" }}>
      <input
        type="range"
        className="v2-slider"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ["--fill" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      />
      <span className="num" style={{ minWidth: 72, textAlign: "right", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{format(value)}</span>
    </div>
  );
}

/** A coloured card with a plus that turns into a cross as the detail opens. */
export function ExpandCard({ title, summary, children, tone = "warm" }: { title: string; summary?: ReactNode; children: ReactNode; tone?: "warm" | "brand" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const brand = tone === "brand";
  return (
    <div className="v2-kit-card" style={{ background: brand ? "linear-gradient(150deg, var(--v2-btn-a), var(--v2-btn-b))" : "var(--v2-beige)", color: brand ? "#fff" : V.ink }}>
      <button type="button" className="v2-kit-plus" aria-expanded={open} aria-controls={id} aria-label={open ? `Close ${title}` : `Open ${title}`} onClick={() => setOpen((o) => !o)}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M7 1v12M1 7h12" /></svg>
      </button>
      <h3 style={{ fontSize: 16, margin: 0, paddingRight: 44, color: "inherit" }}>{title}</h3>
      {summary && <div style={{ fontSize: 13, marginTop: 6, opacity: 0.8, paddingRight: 44, lineHeight: 1.5 }}>{summary}</div>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: "hidden" }}>
            <div style={{ paddingTop: 14, fontSize: 13, lineHeight: 1.6 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A soft card with a slowly turning pinwheel behind it. For empty states and invitations. */
export function PinwheelCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="v2-kit-card" style={{ background: "var(--v2-beige)", color: V.ink, padding: "32px 28px", minHeight: 220 }} data-testid="pinwheel-card">
      <svg className="v2-pinwheel" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true" style={{ position: "absolute", right: -44, bottom: -52, opacity: 0.35 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="102" y="16" width="16" height="66" rx="5" fill="var(--v2-brand)" opacity={0.35 + (i % 4) * 0.15} transform={`rotate(${i * 45} 110 110)`} />
        ))}
      </svg>
      <div style={{ position: "relative", maxWidth: 460 }}>
        <h3 style={{ fontSize: 20, margin: 0, color: "inherit" }}>{title}</h3>
        <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8, opacity: 0.85 }}>{children}</div>
        {action && <div style={{ marginTop: 18 }}>{action}</div>}
      </div>
    </div>
  );
}
