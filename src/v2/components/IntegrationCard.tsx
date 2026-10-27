/**
 * One integration on Settings: brand tile, name, one line on what it does, a
 * live status pill, actions, and an optional panel that opens smoothly.
 * Motion is short and calm, and switches off under prefers-reduced-motion.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { V } from "../ui";

export type IntegrationTone = "good" | "warn" | "bad" | "neutral";

export const INTEGRATION_STYLES = `
.ic-list { display:grid; gap:12px; }
.ic-card { position:relative; background:${V.card}; border:1px solid ${V.line}; border-radius:18px; padding:16px 18px; transition: box-shadow .25s ease, border-color .25s ease, transform .25s cubic-bezier(.16,1,.3,1); animation: ic-in .45s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i, 0) * 60ms); }
.ic-card:hover { border-color: rgba(23,18,8,.18); box-shadow: 0 10px 28px -18px rgba(23,18,8,.35); transform: translateY(-1px); }
.ic-card[data-open="true"] { border-color: rgba(138,30,24,.28); box-shadow: 0 14px 34px -22px rgba(138,30,24,.45); }
@keyframes ic-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
.ic-head { display:grid; grid-template-columns: auto minmax(0,1fr) auto; gap:14px; align-items:center; }
.ic-tile { width:44px; height:44px; border-radius:13px; display:grid; place-items:center; transition: transform .3s cubic-bezier(.16,1,.3,1); }
.ic-card:hover .ic-tile { transform: scale(1.06) rotate(-2deg); }
.ic-name { font-size:15px; font-weight:650; color:${V.ink}; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ic-sub { font-size:12.5px; color:${V.body}; margin-top:2px; line-height:1.45; }
.ic-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.ic-pill { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:3px 10px; font-size:11.5px; font-weight:650; letter-spacing:.01em; }
.ic-pill .dot { width:7px; height:7px; border-radius:50%; background: currentColor; position:relative; }
.ic-pill[data-live="true"] .dot::after { content:""; position:absolute; inset:-4px; border-radius:50%; background: currentColor; opacity:.35; animation: ic-pulse 1.8s ease-out infinite; }
@keyframes ic-pulse { from { transform: scale(.4); opacity:.45; } to { transform: scale(1.6); opacity:0; } }
.ic-toggle { border:0; background:transparent; color:${V.body}; width:32px; height:32px; border-radius:10px; display:grid; place-items:center; cursor:pointer; transition: background .2s ease, color .2s ease; }
.ic-toggle:hover { background:${V.gray}; color:${V.ink}; }
.ic-toggle svg { transition: transform .3s cubic-bezier(.16,1,.3,1); }
.ic-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
.ic-body { display:grid; grid-template-rows: 0fr; transition: grid-template-rows .38s cubic-bezier(.16,1,.3,1), opacity .3s ease; opacity:0; }
.ic-body[data-open="true"] { grid-template-rows: 1fr; opacity:1; }
.ic-body > div { overflow:hidden; min-height:0; }
.ic-body-inner { padding-top:14px; margin-top:14px; border-top:1px dashed ${V.line}; }
.ic-row { animation: ic-in .35s cubic-bezier(.16,1,.3,1) both; }
.ic-steps { display:flex; gap:6px; margin-bottom:12px; }
.ic-steps span { flex:1; height:4px; border-radius:4px; background:${V.gray}; overflow:hidden; position:relative; }
.ic-steps span::after { content:""; position:absolute; inset:0; background:${V.maroon}; transform: scaleX(0); transform-origin:left; transition: transform .45s cubic-bezier(.16,1,.3,1); }
.ic-steps span[data-done="true"]::after { transform: scaleX(1); }
.ic-step-label { font-size:11px; font-weight:650; text-transform:uppercase; letter-spacing:.08em; color:${V.muted}; margin-bottom:4px; }
.ic-spin { width:14px; height:14px; border-radius:50%; border:2px solid currentColor; border-right-color:transparent; animation: v2spin .7s linear infinite; display:inline-block; }
.ic-check { display:inline-grid; place-items:center; width:18px; height:18px; border-radius:50%; background:#1F6B45; color:#fff; animation: ic-pop .45s cubic-bezier(.34,1.56,.64,1) both; }
@keyframes ic-pop { from { transform: scale(.3); opacity:0; } to { transform:none; opacity:1; } }
.ic-skel { height:40px; border-radius:12px; background: linear-gradient(90deg, ${V.gray} 0%, var(--v2-shine) 50%, ${V.gray} 100%); background-size:200% 100%; animation: v2shimmer 1.4s linear infinite; }
@media (max-width: 640px) { .ic-head { grid-template-columns: auto minmax(0,1fr); } .ic-actions { grid-column: 1 / -1; justify-content:flex-start; } }
@media (prefers-reduced-motion: reduce) { .ic-card, .ic-row, .ic-check, .ic-body, .ic-steps span::after, .ic-tile, .ic-pill .dot::after { animation:none !important; transition:none !important; } }
`;

const TONES: Record<IntegrationTone, [string, string]> = {
  good: ["rgba(31,107,69,.1)", "#1F6B45"],
  warn: ["rgba(180,83,9,.12)", "#92400E"],
  bad: ["rgba(138,30,24,.1)", V.maroon],
  neutral: ["rgba(23,18,8,.06)", V.body],
};

export function StatusPill({ tone, label, live }: { tone: IntegrationTone; label: string; live?: boolean }) {
  const [bg, fg] = TONES[tone];
  return (
    <span className="ic-pill" style={{ background: bg, color: fg }} data-live={live ? "true" : "false"}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function IntegrationCard({
  index = 0,
  icon,
  tint,
  name,
  tag,
  description,
  status,
  actions,
  children,
  defaultOpen = false,
  testId,
}: {
  index?: number;
  icon: ReactNode;
  tint: string;
  name: string;
  tag?: ReactNode;
  description: ReactNode;
  status: { tone: IntegrationTone; label: string; live?: boolean };
  actions?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className="ic-card" data-open={open && !!children} style={{ ["--i" as string]: index }} data-testid={testId}>
      <div className="ic-head">
        <div className="ic-tile" style={{ background: tint }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div className="ic-name">
            {name} <StatusPill {...status} /> {tag}
          </div>
          <div className="ic-sub">{description}</div>
        </div>
        <div className="ic-actions">
          {actions}
          {children && (
            <button
              type="button"
              className="ic-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={open ? `Hide ${name} details` : `Show ${name} details`}
              onClick={() => setOpen((o) => !o)}
            >
              <ChevronDown size={18} />
            </button>
          )}
        </div>
      </div>
      {children && (
        <div className="ic-body" data-open={open} id={bodyId} inert={!open}>
          <div>
            <div className="ic-body-inner">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
