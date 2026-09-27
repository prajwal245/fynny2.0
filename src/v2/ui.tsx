/**
 * FynHelp v2 dashboard — design system primitives.
 * Self-contained: does not touch any existing app styling.
 */
import { ReactNode, CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const V = {
  bg: "#F8F7F4",
  card: "#FFFFFF",
  ink: "#141414",
  body: "rgba(20,20,20,0.62)",
  muted: "rgba(20,20,20,0.42)",
  line: "rgba(20,20,20,0.08)",
  blue: "#D0E4F3",
  beige: "#F2E0B5",
  gray: "#F3F3F3",
  maroon: "#A93838",
  coral: "#E2673F",
  green: "#1F5A46",
  radius: 18,
  font: "'Space Grotesk','Instrument Sans','Inter',system-ui,sans-serif",
};

export const V2_STYLES = `
.v2 { background:${V.bg}; color:${V.ink}; font-family:${V.font}; -webkit-font-smoothing:antialiased; }
.v2 *, .v2 *::before, .v2 *::after { box-sizing:border-box; }
.v2 h1,.v2 h2,.v2 h3,.v2 h4 { font-family:${V.font}; margin:0; letter-spacing:-0.02em; font-weight:600; color:${V.ink}; }
.v2 p,.v2 span,.v2 a,.v2 li,.v2 td,.v2 th,.v2 button,.v2 input,.v2 select,.v2 textarea,.v2 label { font-family:${V.font}; }
.v2 .num { font-variant-numeric:tabular-nums; }
.v2-card { background:${V.card}; border:1px solid ${V.line}; border-radius:${V.radius}px; box-shadow:0 1px 2px rgba(20,20,20,.04), 0 12px 30px -26px rgba(20,20,20,.4); }
.v2-btn { display:inline-flex; align-items:center; gap:8px; border-radius:999px; border:1px solid transparent; font-size:13.5px; font-weight:500; padding:10px 18px; cursor:pointer; text-decoration:none; transition:transform .18s ease, background .2s ease, box-shadow .2s ease; }
.v2-btn:hover { transform:translateY(-1px); }
.v2-btn:active { transform:translateY(1px) scale(.985); }
.v2-btn-primary { background:${V.ink}; color:#FFFFFF; }
.v2-btn-primary:hover { background:#000; }
.v2-btn-ghost { background:${V.card}; color:${V.ink}; border-color:${V.line}; }
.v2-btn-ghost:hover { background:${V.gray}; }
.v2-btn-quiet { background:transparent; color:${V.body}; padding:7px 12px; font-size:12.5px; border-color:${V.line}; }
.v2-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.v2-input, .v2 select.v2-input, .v2 textarea.v2-input { width:100%; background:${V.card}; border:1px solid ${V.line}; border-radius:12px; padding:10px 13px; font-size:13.5px; color:${V.ink}; outline:none; transition:border-color .18s ease; }
.v2-input:focus { border-color:rgba(20,20,20,.28); }
.v2-label { display:block; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${V.muted}; margin-bottom:6px; font-weight:600; }
.v2-table { width:100%; border-collapse:collapse; }
.v2-table th { text-align:left; font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:${V.muted}; font-weight:600; padding:12px 16px; border-bottom:1px solid ${V.line}; }
.v2-table td { padding:14px 16px; font-size:13.5px; color:${V.ink}; border-bottom:1px solid ${V.line}; vertical-align:middle; }
.v2-table tbody tr:last-child td { border-bottom:none; }
.v2-table tbody tr.clickable:hover { background:${V.gray}; cursor:pointer; }
.v2-nav a { display:flex; align-items:center; gap:11px; padding:10px 13px; border-radius:12px; font-size:13.5px; color:${V.body}; text-decoration:none; margin-bottom:2px; transition:background .18s ease, color .18s ease; }
.v2-nav a:hover { background:${V.gray}; color:${V.ink}; }
.v2-nav a[data-status="active"] { background:${V.blue}; color:${V.ink}; font-weight:600; }
.v2-scroll { overflow-x:auto; }
.v2-skel { background:linear-gradient(90deg, ${V.gray} 25%, #ECECEC 50%, ${V.gray} 75%); background-size:200% 100%; animation:v2shimmer 1.3s infinite linear; border-radius:10px; }
@keyframes v2shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
.v2-grid-cards { display:grid; gap:16px; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); }
@media (max-width:900px){ .v2-sidebar { position:fixed; z-index:60; transform:translateX(-100%); } .v2-sidebar.open { transform:translateX(0); } }
`;

export function Card({ children, style, className = "", onClick, hover = false }: { children: ReactNode; style?: CSSProperties; className?: string; onClick?: () => void; hover?: boolean }) {
  return (
    <div className={`v2-card ${hover || onClick ? "v2-lift" : ""} ${className}`} style={{ padding: 20, ...style }} onClick={onClick}>
      {children}
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: V.gray, fg: V.body },
  good: { bg: "rgba(31,90,70,0.10)", fg: V.green },
  warn: { bg: V.beige, fg: "#6B4E0C" },
  bad: { bg: "rgba(169,56,56,0.10)", fg: V.maroon },
  info: { bg: V.blue, fg: "#1B4763" },
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
        <div style={{ width: 52, height: 52, borderRadius: 16, background: V.blue, display: "grid", placeItems: "center", margin: "0 auto 16px", color: "#1B4763" }}>
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

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
          <motion.div
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ position: "absolute", inset: 0, background: "rgba(20,20,20,.34)" }}
          />
          <motion.aside
            className="v2"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(560px, 100%)", background: V.card, boxShadow: "-24px 0 60px -40px rgba(0,0,0,.6)", display: "flex", flexDirection: "column" }}
          >
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ fontSize: 16 }}>{title}</h3>
              <button className="v2-btn v2-btn-quiet" onClick={onClose}>Close</button>
            </div>
            <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 18 }}>
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
            <h3 style={{ fontSize: 17, marginBottom: 16 }}>{title}</h3>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
            style={{ background: active ? V.ink : V.card, color: active ? "#fff" : V.body, borderColor: active ? V.ink : V.line, padding: "8px 15px", fontSize: 12.5 }}
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
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
