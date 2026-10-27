import { createPortal } from "react-dom";
/**
 * FynHelp v2 dashboard — design system primitives.
 * Self-contained: does not touch any existing app styling.
 */
import { ReactNode, CSSProperties, useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence, useIsPresent } from "framer-motion";
import { X } from "lucide-react";
import { LIQUID_BUTTON_CSS } from "@/lib/liquidButton";

/** Palette: red #D92B2B and #8E1B1F, cream #EADBC8, ink #141210, mist #FAF7F2. Green and amber are for status only. */
/**
 * Every colour is a CSS variable, so the whole product switches between light (the default) and dark by
 * changing one attribute on <html>. The values live in THEME_VARS below.
 */
export const V = {
  bg: "var(--v2-bg)",
  card: "var(--v2-card)",
  ink: "var(--v2-ink)",
  body: "var(--v2-body)",
  muted: "var(--v2-muted)",
  line: "var(--v2-line)",
  blue: "var(--v2-blue)",
  beige: "var(--v2-beige)",
  gray: "var(--v2-gray)",
  maroon: "var(--v2-maroon)",
  coral: "var(--v2-coral)",
  green: "var(--v2-green)",
  brand: "var(--v2-brand)",
  brandBright: "var(--v2-brandBright)",
  brandDeep: "var(--v2-brandDeep)",
  cream: "var(--v2-cream)",
  warnBg: "var(--v2-warnBg)",
  warnFg: "var(--v2-warnFg)",
  radius: 20,
  font: "var(--font-geist-sans)",
  mono: "var(--font-geist-mono)",
};

const THEME_VARS = `
:root { --v2-bg:#FAF7F2; --v2-card:#FFFFFF; --v2-ink:#141210; --v2-body:rgba(20,18,16,0.72); --v2-muted:rgba(20,18,16,0.50); --v2-line:rgba(138,30,24,0.12); --v2-blue:#FBE6DC; --v2-beige:#EADBC8; --v2-gray:#FBF1EB; --v2-maroon:#8E1B1F; --v2-coral:#D92B2B; --v2-green:#2F6B4F; --v2-brand:#D92B2B; --v2-brandBright:#D92B2B; --v2-brandDeep:#8E1B1F; --v2-cream:#F3EADC; --v2-warnBg:#FCEBD9; --v2-warnFg:#7A3E0C; --v2-side:#FFFFFF; --v2-head:rgba(250,247,242,.86); --v2-overlay:rgba(20,20,20,.34); --v2-pop:#FFFFFF; --v2-sticky:#FFFFFF; --v2-sticky-hover:#FBF1EB; --v2-input:#FFFFFF; --v2-seg:#FFFFFF; --v2-tab:#FFFFFF; --v2-tab-shadow:0 1px 2px rgba(20,20,20,.08), 0 6px 14px -8px rgba(20,20,20,.25); --v2-good-bg:rgba(47,107,79,.11); --v2-dash:rgba(20,20,20,.2); --v2-switch:rgba(20,20,20,.14); --v2-shine:#FFFFFF; --v2-card-shadow:0 1px 2px rgba(138,30,24,.05), 0 14px 32px -26px rgba(138,30,24,.35); --v2-glow:none; --v2-scheme:light; --v2-ag-extract-tint:#FDE8E3; --v2-ag-extract-ink:#9E241D; --v2-ag-extract-dot:#E4302A; --v2-ag-recon-tint:#F8E1DA; --v2-ag-recon-ink:#6E1712; --v2-ag-recon-dot:#B42424; --v2-ag-narrate-tint:#FCEEE4; --v2-ag-narrate-ink:#7A3420; --v2-ag-narrate-dot:#C8553D; --v2-ag-chaser-tint:#F4E4DF; --v2-ag-chaser-ink:#3A0E0A; --v2-ag-chaser-dot:#8A1E18; --v2-btn-a:#D92B2B; --v2-btn-b:#8E1B1F; --v2-btn-ha:#C42626; --v2-btn-hb:#701519; --v2-lq:#EADBC8; --v2-lq-ink:#8E1B1F; }
:root[data-v2-theme="dark"] { --v2-bg:#141210; --v2-card:rgba(255,255,255,0.045); --v2-ink:#FAF7F2; --v2-body:rgba(250,247,242,0.74); --v2-muted:rgba(250,247,242,0.50); --v2-line:rgba(255,255,255,0.09); --v2-blue:rgba(217,43,43,0.16); --v2-beige:rgba(234,219,200,0.12); --v2-gray:rgba(255,255,255,0.06); --v2-maroon:#FF8A80; --v2-coral:#8E1B1F; --v2-green:#5BD39A; --v2-brand:#D92B2B; --v2-brandBright:#D92B2B; --v2-brandDeep:#EADBC8; --v2-cream:rgba(234,219,200,0.07); --v2-warnBg:rgba(234,219,200,0.12); --v2-warnFg:#EADBC8; --v2-side:rgba(20,18,16,.72); --v2-head:rgba(20,18,16,.72); --v2-overlay:rgba(0,0,0,.62); --v2-pop:#1B1816; --v2-sticky:#1C1917; --v2-sticky-hover:#26221F; --v2-input:rgba(255,255,255,.05); --v2-seg:rgba(217,43,43,.22); --v2-tab:linear-gradient(180deg, rgba(217,43,43,.28), rgba(217,43,43,.14)); --v2-tab-shadow:0 1px 0 rgba(255,255,255,.14) inset, 0 8px 18px -10px rgba(217,43,43,.7); --v2-good-bg:rgba(91,211,154,.16); --v2-dash:rgba(255,255,255,.25); --v2-switch:rgba(255,255,255,.18); --v2-shine:rgba(255,255,255,.12); --v2-card-shadow:0 1px 0 rgba(255,255,255,.05) inset, 0 18px 40px -28px rgba(0,0,0,.8); --v2-glow:radial-gradient(120% 70% at 100% 105%, rgba(217,43,43,.30) 0%, rgba(120,12,30,.16) 38%, transparent 70%), radial-gradient(70% 40% at 0% 0%, rgba(142,27,31,.07) 0%, transparent 70%); --v2-scheme:dark; --v2-ag-extract-tint:rgba(217,43,43,.18); --v2-ag-extract-ink:#FF9A8F; --v2-ag-extract-dot:#D92B2B; --v2-ag-recon-tint:rgba(142,27,31,.18); --v2-ag-recon-ink:#F0A27A; --v2-ag-recon-dot:#8E1B1F; --v2-ag-narrate-tint:rgba(234,219,200,.14); --v2-ag-narrate-ink:#EADBC8; --v2-ag-narrate-dot:#EADBC8; --v2-ag-chaser-tint:rgba(250,247,242,.12); --v2-ag-chaser-ink:#FAF7F2; --v2-ag-chaser-dot:#E0605A; --v2-btn-a:#E23A3A; --v2-btn-b:#A81F24; --v2-btn-ha:#EC4A4A; --v2-btn-hb:#C23030; --v2-lq:#EADBC8; --v2-lq-ink:#141210; }
`;

export type ThemeMode = "light" | "dark";
const THEME_KEY = "fynhelp-theme";

/** Light unless the person chose dark. Applies the choice to <html> and remembers it on this device. */
export function useV2Theme(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
    if (saved === "dark") setMode("dark");
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-v2-theme", mode);
    return () => document.documentElement.removeAttribute("data-v2-theme");
  }, [mode]);
  const toggle = () =>
    setMode((m) => {
      const next: ThemeMode = m === "dark" ? "light" : "dark";
      try { window.localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
      return next;
    });
  return [mode, toggle];
}

export const V2_STYLES = `
${THEME_VARS}
${LIQUID_BUTTON_CSS}
.v2 { background:${V.bg}; background-image:var(--v2-glow); background-attachment:fixed; color:${V.ink}; color-scheme:var(--v2-scheme); font-family:${V.font}; -webkit-font-smoothing:antialiased; font-size:15px; }
.v2 *, .v2 *::before, .v2 *::after { box-sizing:border-box; }
.v2 h1,.v2 h2,.v2 h3,.v2 h4 { font-family:${V.font}; margin:0; letter-spacing:-0.02em; font-weight:600; color:${V.ink}; }
.v2 p,.v2 span,.v2 a,.v2 li,.v2 td,.v2 th,.v2 button,.v2 input,.v2 select,.v2 textarea,.v2 label { font-family:${V.font}; }
.v2 .num, .v2 .tabular-nums, .v2-table td, .v2-table th { font-variant-numeric:tabular-nums; }
/* Identifiers and raw data (references, GSTIN/PAN, section codes, transaction ids). */
.v2 .v2-mono, .v2 .font-mono { font-family:${V.mono}; font-variant-numeric:tabular-nums; letter-spacing:0; }
.v2-card { background:${V.card}; border:1px solid ${V.line}; border-radius:${V.radius}px; backdrop-filter:blur(14px) saturate(120%); -webkit-backdrop-filter:blur(14px) saturate(120%); box-shadow:var(--v2-card-shadow); }
.v2-btn { display:inline-flex; align-items:center; gap:8px; border-radius:999px; border:1px solid transparent; font-size:14px; font-weight:600; padding:10px 18px; cursor:pointer; text-decoration:none; transition:transform .18s ease, background .2s ease, box-shadow .2s ease; }
.v2-btn:hover { transform:translateY(-1px); }
.v2-btn:active { transform:translateY(1px) scale(.985); }
.v2-btn-primary { background:linear-gradient(180deg, var(--v2-btn-a) 0%, var(--v2-btn-b) 100%); color:#FFFFFF; box-shadow:0 1px 0 rgba(255,255,255,.28) inset, 0 10px 24px -10px rgba(217,43,43,.75); }
.v2-btn-primary:hover { background:linear-gradient(180deg, var(--v2-btn-ha) 0%, var(--v2-btn-hb) 100%); box-shadow:0 1px 0 rgba(255,255,255,.3) inset, 0 12px 28px -10px rgba(142,27,31,.8); }
.v2-btn-ghost { background:${V.card}; color:${V.ink}; border-color:${V.line}; }
.v2-btn-ghost:hover { background:${V.gray}; }
.v2-btn-quiet { background:transparent; color:${V.body}; padding:7px 12px; font-size:13px; border-color:${V.line}; }
.v2-btn-quiet:hover { background:${V.gray}; color:${V.ink}; }
/* Icon-only buttons: always carry an aria-label and a title. */
.v2-icon-btn { display:inline-grid; place-items:center; width:34px; height:34px; border-radius:999px; border:1px solid transparent; background:transparent; color:${V.body}; cursor:pointer; transition:background .15s ease, color .15s ease; }
.v2-icon-btn:hover { background:${V.gray}; color:${V.ink}; }
.v2-icon-btn:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
/* Buttons and menus never break out of their row: labels stay on one line, icons keep their size, long text is cut. */
.v2-btn { white-space:nowrap; max-width:100%; }
.v2-btn > svg { flex:none; }
.v2 select.v2-input { appearance:none; -webkit-appearance:none; padding-right:30px; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 11px center; }
.v2 select.v2-input option { color:#141210; background:#fff; }
.v2-btn:disabled, .v2-btn[aria-disabled="true"] { opacity:.5; cursor:not-allowed; transform:none !important; }
.v2-btn:focus-visible, .v2-link:focus-visible, .v2-nav a:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-btn-sm { padding:6px 12px; font-size:13px; }
.v2-btn-lg { padding:13px 22px; font-size:15px; }
.v2-btn-block { width:100%; justify-content:center; }
.v2-btn-danger { background:transparent; color:${V.maroon}; border-color:rgba(255,107,128,.4); }
.v2-btn-danger:hover { background:rgba(217,43,43,.12); }
/* Busy: keeps its width, shows a spinner, ignores clicks. */
.v2-btn[data-busy="true"] { pointer-events:none; position:relative; }
.v2-btn[data-busy="true"]::before { content:""; width:12px; height:12px; border-radius:999px; border:2px solid currentColor; border-right-color:transparent; animation:v2spin .7s linear infinite; }
@keyframes v2spin { to { transform:rotate(360deg); } }
.v2-kbd { display:inline-flex; align-items:center; gap:2px; font-size:11px; font-weight:600; color:${V.muted}; border:1px solid ${V.line}; border-bottom-width:2px; border-radius:6px; padding:1px 6px; background:${V.card}; font-family:inherit; }
.v2-input:focus { outline:none; border-color:${V.brand}; box-shadow:0 0 0 3px color-mix(in srgb, var(--v2-brand) 22%, transparent); }
.v2-input, .v2 select.v2-input, .v2 textarea.v2-input { width:100%; background:var(--v2-input); border:1px solid ${V.line}; border-radius:12px; padding:10px 13px; font-size:14.5px; color:${V.ink}; outline:none; transition:border-color .18s ease; }
.v2-label { display:block; font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; color:${V.muted}; margin-bottom:6px; font-weight:600; }
.v2-table { width:100%; border-collapse:collapse; }
.v2-table th { text-align:left; font-size:11.5px; letter-spacing:.09em; text-transform:uppercase; color:${V.muted}; font-weight:600; padding:12px 16px; border-bottom:1px solid ${V.line}; }
.v2-table td { padding:14px 16px; font-size:14px; color:${V.ink}; border-bottom:1px solid ${V.line}; vertical-align:middle; }
.v2-table tbody tr:last-child td { border-bottom:none; }
.v2-table tbody tr.clickable:hover { background:${V.gray}; cursor:pointer; }
.v2-nav a { display:flex; align-items:center; gap:11px; padding:10px 13px; border-radius:12px; font-size:14.5px; color:${V.body}; text-decoration:none; margin-bottom:2px; transition:background .18s ease, color .18s ease; }
.v2-nav a:hover { background:${V.gray}; color:${V.ink}; }
.v2-nav a[data-status="active"] { background:linear-gradient(90deg, rgba(217,43,43,.26), rgba(217,43,43,.06)); color:${V.ink}; font-weight:600; box-shadow:inset 3px 0 0 ${V.brand}; }
.v2-nav a[data-status="active"] svg { color:${V.brand}; }
.v2-scroll { overflow-x:auto; }
.v2-skel { background:linear-gradient(90deg, ${V.gray} 25%, ${V.cream} 50%, ${V.gray} 75%); background-size:200% 100%; animation:v2shimmer 1.3s infinite linear; border-radius:10px; }
@keyframes v2shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
.v2-grid-cards { display:grid; gap:16px; grid-template-columns:repeat(auto-fill, minmax(min(280px, 100%), 1fr)); }
/* The action column stays in view when a wide table scrolls. */
.v2-table .v2-sticky-end { position:sticky; right:0; background:var(--v2-sticky); box-shadow:-10px 0 12px -12px rgba(20,18,16,.4); }
.v2-table tbody tr.clickable:hover .v2-sticky-end { background:var(--v2-sticky-hover); }
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
  good: { bg: "var(--v2-good-bg)", fg: V.green },
  warn: { bg: V.warnBg, fg: V.warnFg },
  bad: { bg: "rgba(217,43,43,0.16)", fg: V.maroon },
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
            style={{ position: "absolute", inset: 0, background: "var(--v2-overlay)" }}
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
            style={{ position: "absolute", inset: 0, background: "var(--v2-overlay)" }}
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
            style={{ background: active ? V.brand : V.card, color: active ? "#fff" : V.body, borderColor: active ? V.brand : V.line, padding: "8px 15px", fontSize: 13.5 }}
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


/**
 * A row of choices with one sliding thumb: the thumb glides to the choice you tap, like a physical switch.
 * Each option can carry a small count.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} style={{ display: "inline-flex", flexWrap: "wrap", gap: 2, padding: 4, borderRadius: 999, background: V.gray, border: `1px solid ${V.line}` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            style={{ position: "relative", border: 0, background: "transparent", cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 999, color: on ? "#fff" : V.body, transition: "color .25s ease" }}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
                style={{ position: "absolute", inset: 0, borderRadius: 999, background: `linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b))`, boxShadow: "0 8px 18px -10px var(--v2-brand)" }}
              />
            )}
            <span style={{ position: "relative", display: "inline-flex", gap: 6, alignItems: "center" }}>
              {o.label}
              {o.count !== undefined && <span style={{ opacity: 0.65 }}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
