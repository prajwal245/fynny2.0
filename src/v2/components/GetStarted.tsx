/**
 * Shown on the dashboard until the first client exists (for example after skipping that step at sign-up).
 * Three clear ways in, worded for every kind of practice. Nothing here changes data except "Add".
 */
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Mail, UserPlus } from "lucide-react";
import { V } from "../ui";

export function GetStarted({ onAdd }: { onAdd: () => void }) {
  const reduce = useReducedMotion();
  const rows: { icon: typeof UserPlus; title: string; text: string; cta: string; onClick?: () => void; to?: string; primary?: boolean }[] = [
    { icon: UserPlus, title: "Add your first client", text: "A name is enough. The agents work one client at a time.", cta: "Add client", onClick: onAdd, primary: true },
    { icon: Mail, title: "Let documents arrive by email", text: "Connect Gmail and statements sent to you file themselves under the right client.", cta: "Open settings", to: "/app/settings" },
  ];
  return (
    <motion.section
      aria-label="Get started"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="v2-card"
      style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}
      data-testid="get-started"
    >
      <div style={{ padding: "22px 24px 8px" }}>
        <h2 style={{ fontSize: 19, letterSpacing: "-0.01em", margin: 0 }}>Let's get started</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: V.body, lineHeight: 1.6 }}>
          Add a client when you are ready. Everything else can wait.
        </p>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: "8px 12px 14px", display: "grid", gap: 4 }}>
        {rows.map((r, i) => {
          const inner = (
            <>
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: r.primary ? V.ink : V.gray, color: r.primary ? "#fff" : V.body, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <r.icon size={19} />
              </span>
              <span style={{ display: "grid", gap: 2, minWidth: 0, flex: "1 1 200px" }}>
                <b style={{ fontSize: 14.5, fontWeight: 600, color: V.ink }}>{r.title}</b>
                <span style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.45 }}>{r.text}</span>
              </span>
              <span className={r.primary ? "v2-btn v2-btn-primary" : "v2-btn v2-btn-ghost"} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
                {r.cta} <ArrowRight size={14} />
              </span>
            </>
          );
          const common = { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 14, padding: "12px", borderRadius: 14, textDecoration: "none", color: "inherit", width: "100%", textAlign: "left" as const, font: "inherit", background: "transparent", border: 0, cursor: "pointer" };
          return (
            <motion.li key={r.title} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, duration: 0.3 }}>
              {r.onClick ? (
                <button type="button" onClick={r.onClick} className="gs-row" style={common}>{inner}</button>
              ) : (
                <Link to={r.to ?? "/app/settings"} className="gs-row" style={common}>{inner}</Link>
              )}
            </motion.li>
          );
        })}
      </ul>
      <style>{`.gs-row { transition: background .2s ease; } .gs-row:hover { background: var(--v2-gray) !important; } .gs-row:focus-visible { outline: 2px solid var(--v2-ink); outline-offset: 2px; }`}</style>
    </motion.section>
  );
}
