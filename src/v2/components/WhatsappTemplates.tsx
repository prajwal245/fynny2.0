/**
 * "Your reminder messages": what each stage of a chase sends on WhatsApp, whether Meta has approved it, and what the
 * client sees. The stages sit on a short timeline (day 0, 3, 7) next to a live preview, so the whole picture fits on
 * one screen. Plain words; the one thing to do next is always stated.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { getPracticeWhatsappTemplates } from "@/lib/practice/practice.functions";
import { Badge, V, type Tone } from "../ui";
import { AGENTS } from "../agents";
import { useV2 } from "../store";
import { WhatsappPreview } from "./WhatsappPreview";

export type TemplatesView = Awaited<ReturnType<typeof getPracticeWhatsappTemplates>>;

const CHIP: Record<string, { tone: Tone; label: string; icon: React.ReactNode; dot: string }> = {
  approved: { tone: "good", label: "Ready", icon: <CheckCircle2 size={13} />, dot: V.green },
  review: { tone: "info", label: "In review at Meta", icon: <Clock size={13} />, dot: "#3B6EA8" },
  rejected: { tone: "bad", label: "Rejected", icon: <AlertTriangle size={13} />, dot: V.maroon },
  paused: { tone: "warn", label: "Paused by Meta", icon: <AlertTriangle size={13} />, dot: "#B45309" },
  marketing: { tone: "warn", label: "Classed as Marketing", icon: <AlertTriangle size={13} />, dot: "#B45309" },
  unsupported: { tone: "warn", label: "Buttons not supported", icon: <AlertTriangle size={13} />, dot: "#B45309" },
  missing: { tone: "neutral", label: "Not created yet", icon: <CircleDashed size={13} />, dot: "rgba(42,15,12,.35)" },
  unknown: { tone: "neutral", label: "Cannot check", icon: <CircleDashed size={13} />, dot: "rgba(42,15,12,.35)" },
};
const DAY: Record<string, string> = { request: "Day 0", followup: "Day 3", final: "Day 7" };

/** Stages whose own template is approved (the "2 of 3 ready" in the header). */
export const readyCount = (v: TemplatesView | null) => (v ? v.stages.filter((s) => s.status === "approved").length : 0);
/** Stages that can send something now, their own template or an older one standing in. */
export const sendableCount = (v: TemplatesView | null) => (v ? v.stages.filter((s) => s.using).length : 0);

export function useTemplatesView(): TemplatesView | null {
  const [v, setV] = useState<TemplatesView | null>(null);
  useEffect(() => {
    let live = true;
    getPracticeWhatsappTemplates().then((r) => live && setV(r)).catch(() => live && setV(null));
    return () => {
      live = false;
    };
  }, []);
  return v;
}

export function WhatsappTemplates({ view }: { view?: TemplatesView | null }) {
  const { firm } = useV2();
  const own = useTemplatesView();
  const v = view ?? own;
  const reduce = useReducedMotion();
  if (!v) return <div style={{ fontSize: 13, color: V.muted }}>Loading your reminder messages…</div>;
  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="wa-templates">
      <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
        Each reminder goes out as a short message with four buttons. Clients can upload documents without logging in, say they are sending today, ask for more time, or stop reminders.
        {v.test && " Test account: messages are simulated."}
      </div>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", alignItems: "start" }}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative", display: "grid", gap: 14 }} aria-label="Reminder stages">
          {/* The line the stages hang on, drawn once when the tab opens. */}
          <motion.span
            aria-hidden
            initial={reduce ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", left: 11, top: 14, bottom: 14, width: 2, background: `linear-gradient(${AGENTS.chaser.dot}, rgba(42,15,12,.12))`, transformOrigin: "top", borderRadius: 2 }}
          />
          {v.stages.map((s, i) => {
            const c = CHIP[s.status] ?? CHIP.unknown;
            return (
              <motion.li
                key={s.stage}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduce ? 0 : 0.12 * i, duration: 0.25 }}
                style={{ position: "relative", display: "grid", gridTemplateColumns: "24px 1fr", gap: 12 }}
              >
                <span aria-hidden style={{ width: 24, height: 24, borderRadius: 999, background: V.card, border: `2px solid ${c.dot}`, display: "grid", placeItems: "center", zIndex: 1 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot }} />
                </span>
                <div style={{ display: "grid", gap: 4, padding: "10px 12px", borderRadius: 12, background: V.gray }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13.5 }}>{s.label}</b>
                    <span style={{ fontSize: 11.5, color: V.muted }}>{DAY[s.stage]}</span>
                    <Badge tone={c.tone}>
                      {c.icon} {c.label}
                    </Badge>
                  </div>
                  {s.using && (
                    <div style={{ fontSize: 12, color: V.muted }}>
                      sends <code>{s.using}</code>
                      {s.buttons ? " with buttons" : ""}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: V.body, lineHeight: 1.5 }}>{s.note}</div>
                </div>
              </motion.li>
            );
          })}
        </ol>
        <WhatsappPreview clientName="Acme Traders" contact="Asha" item="Bank statement (Sep 2026)" firmName={firm?.name ?? "Your firm"} />
      </div>
      {v.shared && (
        <div style={{ fontSize: 12, color: V.muted }}>
          On FynHelp's number a template message uses 1 credit. If the client has written to you in the last 23 hours, the reminder goes as a free message with the same buttons.
        </div>
      )}
    </div>
  );
}
