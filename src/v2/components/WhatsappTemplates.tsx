/**
 * "Your reminder messages": what each stage of a chase sends on WhatsApp, whether Meta has approved it,
 * and what the client sees. Plain words; the one thing to do next is always stated.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, CircleDashed } from "lucide-react";
import { getPracticeWhatsappTemplates } from "@/lib/practice/practice.functions";
import { Badge, V, type Tone } from "../ui";
import { useV2 } from "../store";
import { WhatsappPreview } from "./WhatsappPreview";

type View = Awaited<ReturnType<typeof getPracticeWhatsappTemplates>>;

const CHIP: Record<string, { tone: Tone; label: string; icon: React.ReactNode }> = {
  approved: { tone: "good", label: "Ready", icon: <CheckCircle2 size={13} /> },
  review: { tone: "info", label: "In review at Meta", icon: <Clock size={13} /> },
  rejected: { tone: "bad", label: "Rejected", icon: <AlertTriangle size={13} /> },
  paused: { tone: "warn", label: "Paused by Meta", icon: <AlertTriangle size={13} /> },
  marketing: { tone: "warn", label: "Classed as Marketing", icon: <AlertTriangle size={13} /> },
  unsupported: { tone: "warn", label: "Buttons not supported", icon: <AlertTriangle size={13} /> },
  missing: { tone: "neutral", label: "Not created yet", icon: <CircleDashed size={13} /> },
  unknown: { tone: "neutral", label: "Cannot check", icon: <CircleDashed size={13} /> },
};

export function WhatsappTemplates() {
  const { firm } = useV2();
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    let live = true;
    getPracticeWhatsappTemplates().then((r) => live && setV(r)).catch(() => live && setV(null));
    return () => {
      live = false;
    };
  }, []);
  if (!v) return <div style={{ fontSize: 13, color: V.muted }}>Loading your reminder messages…</div>;
  return (
    <div style={{ display: "grid", gap: 14 }} data-testid="wa-templates">
      <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
        Each reminder goes out as a short message with four buttons. Clients can upload documents without logging in, say they are sending today, ask for more time, or stop reminders.
        {v.test && " Test account: messages are simulated."}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {v.stages.map((s) => {
          const c = CHIP[s.status] ?? CHIP.unknown;
          return (
            <div key={s.stage} style={{ display: "grid", gap: 4, padding: "10px 12px", borderRadius: 12, background: V.gray }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 13.5 }}>{s.label}</b>
                <Badge tone={c.tone}>
                  {c.icon} {c.label}
                </Badge>
                {s.using && <span style={{ fontSize: 12, color: V.muted }}>sends <code>{s.using}</code>{s.buttons ? " with buttons" : ""}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: V.body, lineHeight: 1.5 }}>{s.note}</div>
            </div>
          );
        })}
      </div>
      <WhatsappPreview clientName="Acme Traders" contact="Asha" item="Bank statement (Sep 2026)" firmName={firm?.name ?? "Your firm"} />
      {v.shared && (
        <div style={{ fontSize: 12, color: V.muted }}>
          On FynHelp's number a template message uses 1 credit. If the client has written to you in the last 23 hours, the reminder goes as a free message with the same buttons.
        </div>
      )}
    </div>
  );
}
