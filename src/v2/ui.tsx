import { createPortal } from "react-dom";
/**
 * FynHelp v2 dashboard — design system primitives.
 * Self-contained: does not touch any existing app styling.
 */
import { ReactNode, CSSProperties, useEffect, useRef } from "react";
import { motion, AnimatePresence, useIsPresent } from "framer-motion";
import { X } from "lucide-react";

/**
 * Colours come from the FynHelp logo only: its red gradient (#E4302A → #8A1E18),
 * its cream (#FCEEE4) and the near-black red of the app icon. Green and amber
 * are kept, muted, for status meaning alone (matched / needs attention).
 */
export const V = {
  bg: "#FFF8F3",
  card: "#FFFFFF",
  ink: "#2A0F0C",
  body: "rgba(42,15,12,0.72)",
  muted: "rgba(42,15,12,0.50)",
  line: "rgba(138,30,24,0.12)",
  /** Cream-red tint: active navigation, info chips, icon wells. */
  blue: "#FBE6DC",
  /** Warm cream: counts and highlights. */
  beige: "#F8DCCB",
  gray: "#FBF1EB",
  maroon: "#B42424",
  coral: "#D8302A",
  green: "#2F6B4F",
  brand: "#D8302A",
  brandBright: "#E4302A",
  brandDeep: "#8A1E18",
  cream: "#FCEEE4",
  warnBg: "#FCEBD9",
  warnFg: "#7A3E0C",
  radius: 18,
  font: "var(--font-geist-sans)",
  mono: "var(--font-geist-mono)",
};

export const V2_STYLES = `
.v2 { background:${V.bg}; color:${V.ink}; font-family:${V.font}; -webkit-font-smoothing:antialiased; font-size:15px; }
.v2 *, .v2 *::before, .v2 *::after { box-sizing:border-box; }
.v2 h1,.v2 h2,.v2 h3,.v2 h4 { font-family:${V.font}; margin:0; letter-spacing:-0.02em; font-weight:600; color:${V.ink}; }
.v2 p,.v2 span,.v2 a,.v2 li,.v2 td,.v2 th,.v2 button,.v2 input,.v2 select,.v2 textarea,.v2 label { font-family:${V.font}; }
.v2 .num, .v2 .tabular-nums, .v2-table td, .v2-table th { font-variant-numeric:tabular-nums; }
/* Identifiers and raw data (references, GSTIN/PAN, section codes, transaction ids). */
.v2 .v2-mono, .v2 .font-mono { font-family:${V.mono}; font-variant-numeric:tabular-nums; letter-spacing:0; }
.v2-card { background:${V.card}; border:1px solid ${V.line}; border-radius:${V.radius}px; box-shadow:0 1px 2px rgba(138,30,24,.05), 0 14px 32px -26px rgba(138,30,24,.35); }
.v2-btn { display:inline-flex; align-items:center; gap:8px; border-radius:999px; border:1px solid transparent; font-size:14px; font-weight:600; padding:10px 18px; cursor:pointer; text-decoration:none; transition:transform .18s ease, background .2s ease, box-shadow .2s ease; }
.v2-btn:hover { transform:translateY(-1px); }
.v2-btn:active { transform:translateY(1px) scale(.985); }
.v2-btn-primary { background:linear-gradient(180deg, ${V.brandBright} 0%, ${V.maroon} 100%); color:#FFFFFF; box-shadow:0 1px 0 rgba(255,255,255,.18) inset, 0 6px 16px -10px rgba(138,30,24,.8); }
.v2-btn-primary:hover { background:linear-gradient(180deg, ${V.brand} 0%, ${V.brandDeep} 100%); }
.v2-btn-ghost { background:${V.card}; color:${V.ink}; border-color:${V.line}; }
.v2-btn-ghost:hover { background:${V.gray}; }
.v2-btn-quiet { background:transparent; color:${V.body}; padding:7px 12px; font-size:13px; border-color:${V.line}; }
.v2-btn-quiet:hover { background:${V.gray}; color:${V.ink}; }
/* Icon-only buttons: always carry an aria-label and a title. */
.v2-icon-btn { display:inline-grid; place-items:center; width:34px; height:34px; border-radius:999px; border:1px solid transparent; background:transparent; color:${V.body}; cursor:pointer; transition:background .15s ease, color .15s ease; }
.v2-icon-btn:hover { background:${V.gray}; color:${V.ink}; }
.v2-icon-btn:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-btn:disabled, .v2-btn[aria-disabled="true"] { opacity:.5; cursor:not-allowed; transform:none !important; }
.v2-btn:focus-visible, .v2-link:focus-visible, .v2-nav a:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-btn-sm { padding:6px 12px; font-size:13px; }
.v2-btn-lg { padding:13px 22px; font-size:15px; }
.v2-btn-block { width:100%; justify-content:center; }
.v2-btn-danger { background:transparent; color:${V.maroon}; border-color:rgba(180,36,36,.35); }
.v2-btn-danger:hover { background:rgba(180,36,36,.06); }
/* Busy: keeps its width, shows a spinner, ignores clicks. */
.v2-btn[data-busy="true"] { pointer-events:none; position:relative; }
.v2-btn[data-busy="true"]::before { content:""; width:12px; height:12px; border-radius:999px; border:2px solid currentColor; border-right-color:transparent; animation:v2spin .7s linear infinite; }
@keyframes v2spin { to { transform:rotate(360deg); } }
.v2-kbd { display:inline-flex; align-items:center; gap:2px; font-size:11px; font-weight:600; color:${V.muted}; border:1px solid ${V.line}; border-bottom-width:2px; border-radius:6px; padding:1px 6px; background:${V.card}; font-family:inherit; }
.v2-input:focus { outline:none; border-color:${V.brand}; box-shadow:0 0 0 3px rgba(216,48,42,.14); }
.v2-input, .v2 select.v2-input, .v2 textarea.v2-input { width:100%; background:${V.card}; border:1px solid ${V.line}; border-radius:12px; padding:10px 13px; font-size:14.5px; color:${V.ink}; outline:none; transition:border-color .18s ease; }
.v2-label { display:block; font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:${V.muted}; margin-bottom:6px; font-weight:600; }
.v2-table { width:100%; border-collapse:collapse; }
.v2-table th { text-align:left; font-size:11.5px; letter-spacing:.09em; text-transform:uppercase; color:${V.muted}; font-weight:600; padding:12px 16px; border-bottom:1px solid ${V.line}; }
.v2-table td { padding:14px 16px; font-size:14px; color:${V.ink}; border-bottom:1px solid ${V.line}; vertical-align:middle; }
.v2-table tbody tr:last-child td { border-bottom:none; }
.v2-table tbody tr.clickable:hover { background:${V.gray}; cursor:pointer; }
.v2-nav a { display:flex; align-items:center; gap:11px; padding:10px 13px; border-radius:12px; font-size:14.5px; color:${V.body}; text-decoration:none; margin-bottom:2px; transition:background .18s ease, color .18s ease; }
.v2-nav a:hover { background:${V.gray}; color:${V.ink}; }
.v2-nav a[data-status="active"] { background:${V.blue}; color:${V.brandDeep}; font-weight:600; box-shadow:inset 3px 0 0 ${V.brand}; }
.v2-nav a[data-status="active"] svg { color:${V.brand}; }
.v2-scroll { overflow-x:auto; }
.v2-skel { background:linear-gradient(90deg, ${V.gray} 25%, ${V.cream} 50%, ${V.gray} 75%); background-size:200% 100%; animation:v2shimmer 1.3s infinite linear; border-radius:10px; }
@keyframes v2shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
.v2-grid-cards { display:grid; gap:16px; grid-template-columns:repeat(auto-fill, minmax(min(280px, 100%), 1fr)); }
/* The action column stays in view when a wide table scrolls. */
.v2-table .v2-sticky-end { position:sticky; right:0; background:${V.card}; box-shadow:-10px 0 12px -12px rgba(42,15,12,.35); }
.v2-table tbody tr.clickable:hover .v2-sticky-end { background:${V.gray}; }
@media (max-width:760px){
  /* Phones: each row becomes a compact card instead of a table that scrolls sideways. */
  .v2-table-stack thead { display:none; }
  .v2-table-stack, .v2-table-stack tbody { display:block; }
  .v2-table-stack tbody tr { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:12px 14px; border-bottom:1px solid ${V.line}; }
  .v2-table-stack tbody tr:last-child { border-bottom:none; }
  .v2-table-stack td { padding:0 !important; border:none !important; font-size:13px; }
  .v2-table-stack td:first-child { width:100%; font-size:14px; }
  .v2-table-stack td.v2-sticky-end { position:static; box-shadow:none; background:transparent; width:100%; }
  .v2-table-stack td.v2-sticky-end > div { justify-content:flex-start !important; }
  .v2-page-header { grid-template-columns:minmax(0,1fr) !important; }
  .v2-page-header h1 { font-size:21px !important; overflow-wrap:anywhere; }
}
@media (max-width:900px){
  /* The sidebar's inline sticky position must not keep it in the layout on phones. */
  .v2-sidebar { position:fixed !important; left:0; top:0; z-index:60; transform:translateX(-100%); }
  .v2-sidebar.open { transform:translateX(0); }
}
@media (max-width:640px){
  .v2 main { padding:16px !important; }
  .v2 select.v2-input, .v2 input.v2-input { min-width:0 !important; max-width:100%; }
  .v2 header { padding:12px 16px !important; }
}
`;

export function Card({ children, style, className = "", onClick, hover = false, ...rest }: { children: ReactNode; style?: CSSProperties; className?: string; onClick?: () => void; hover?: boolean; "data-testid"?: string }) {
  return (
    <div className={`v2-card ${hover || onClick ? "v2-lift" : ""} ${className}`} style={{ padding: 20, ...style }} onClick={onClick} {...rest}>
      {children}
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: V.gray, fg: V.body },
  good: { bg: "rgba(47,107,79,0.11)", fg: V.green },
  warn: { bg: V.warnBg, fg: V.warnFg },
  bad: { bg: "rgba(180,36,36,0.10)", fg: V.maroon },
  info: { bg: V.blue, fg: V.brandDeep },
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.24 }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.bg, color: t.fg, borderRadius: 999, padding: "4px 11px", fontSize: 11.5, fontWeight: 600, letterSpacing: ".01em", whiteSpace: "nowrap" }}
    >
      {children}
    </motion.span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="v2-page-header"
      style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "center", marginBottom: 22 }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 25 }}>{title}</h1>
        {subtitle && <p style={{ margin: "6px 0 0", fontSize: 13.5, color: V.body }}>{subtitle}</p>}
      </div>
      {action}
    </motion.header>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <motion.div
      className="v2-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      style={{ padding: "56px 28px", textAlign: "center" }}
    >
      {icon && (
        <div style={{ width: 52, height: 52, borderRadius: 16, background: V.blue, display: "grid", placeItems: "center", margin: "0 auto 16px", color: V.brandDeep }}>
          {icon}
        </div>
      )}
      <h3 style={{ fontSize: 17 }}>{title}</h3>
      <p style={{ margin: "8px auto 0", maxWidth: 380, fontSize: 13.5, lineHeight: 1.6, color: V.body }}>{description}</p>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </motion.div>
  );
}

export function Stat({ label, value, hint, tone = "neutral", onClick }: { label: string; value: ReactNode; hint?: string; tone?: Tone; onClick?: () => void }) {
  return (
    <Card onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ fontSize: 30, fontWeight: 600, marginTop: 10, color: tone === "bad" ? V.maroon : tone === "good" ? V.green : V.ink, letterSpacing: "-0.03em" }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>{hint}</div>}
    </Card>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="v2-skel" style={{ height: 58 }} />
      ))}
    </div>
  );
}

// Overlays render on <body> so a transformed (animated) ancestor can't clip them.
function portal(node: ReactNode) {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

/** Overlay root: stops catching clicks the moment it starts closing, so the next click lands. */
export function Layer({ style, children, className }: { style: CSSProperties; children: ReactNode; className?: string }) {
  const present = useIsPresent();
  return <div className={className} style={{ ...style, pointerEvents: present ? "auto" : "none" }}>{children}</div>;
}

/**
 * Each opening gets its own key, so a panel reopened while the last one is
 * still sliding out mounts fresh instead of staying off-screen. Esc closes it
 * and focus goes back to whatever opened it.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const count = useRef(0);
  const wasOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  if (open && !wasOpen.current) {
    count.current++;
    if (typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null;
  }
  wasOpen.current = open;
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const el = opener.current;
      if (el && typeof el.focus === "function" && document.contains(el)) setTimeout(() => el.focus({ preventScroll: true }), 0);
    };
  }, [open]);
  return `overlay-${count.current}`;
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const key = useOverlay(open, onClose);
  return portal(
    <AnimatePresence>
      {open && (
        <Layer key={key} style={{ position: "fixed", inset: 0, zIndex: 80 }}>
          <motion.div
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ position: "absolute", inset: 0, background: "rgba(20,20,20,.34)" }}
          />
          <motion.aside
            className="v2"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            // No overshoot: a spring pushed the panel past the edge and clipped it for a moment.
            transition={{ type: "tween", duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(560px, 100%)", background: V.card, boxShadow: "-24px 0 60px -40px rgba(0,0,0,.6)", display: "flex", flexDirection: "column", overflowX: "hidden", willChange: "transform" }}
          >
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ fontSize: 16 }}>{title}</h3>
              <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
            </div>
            <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
          </motion.aside>
        </Layer>
      )}
    </AnimatePresence>,
  );
}

/** An icon-only button: the label is spoken by screen readers and shown on hover. */
export function IconButton({ label, onClick, children, disabled, style }: { label: string; onClick?: () => void; children: ReactNode; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button type="button" className="v2-icon-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const key = useOverlay(open, onClose);
  return portal(
    <AnimatePresence>
      {open && (
        <Layer key={key} style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 18 }}>
          <motion.div
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: "absolute", inset: 0, background: "rgba(20,20,20,.34)" }}
          />
          <motion.div
            className="v2 v2-card"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            style={{ position: "relative", width: "min(520px,100%)", padding: 24, maxHeight: "88vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <h3 style={{ fontSize: 17 }}>{title}</h3>
              <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
            </div>
            {children}
          </motion.div>
        </Layer>
      )}
    </AnimatePresence>,
  );
}

export function Tabs({ items, value, onChange }: { items: { value: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {items.map((i) => {
        const active = i.value === value;
        return (
          <button
            key={i.value}
            onClick={() => onChange(i.value)}
            className="v2-btn"
            style={{ background: active ? V.brandDeep : V.card, color: active ? "#fff" : V.body, borderColor: active ? V.brandDeep : V.line, padding: "8px 15px", fontSize: 13.5 }}
          >
            {i.label}
            {typeof i.count === "number" && <span style={{ opacity: 0.6 }}>{i.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function formatINR(n: number) {
  const abs = Math.abs(n);
  const paise = Math.round(abs * 100) % 100 !== 0;
  const body = new Intl.NumberFormat("en-IN", paise ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }).format(abs);
  return (n < 0 ? "−₹" : "₹") + body;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
