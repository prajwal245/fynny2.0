/**
 * What the client will see on WhatsApp, drawn like WhatsApp: the message, then the four buttons.
 * Used in the Chaser (so nobody sends blind) and in Settings (next to the status of each template).
 */
import { useState } from "react";
import { CheckCheck, ExternalLink, Reply } from "lucide-react";
import { V } from "../ui";
import { WhatsAppIcon } from "./BrandIcons";
import { CHASE_BUTTON_LABEL, UPLOAD_BUTTON_LABEL, chaseText, chaseTemplateParams } from "@/lib/practice/whatsappFlow";

const STAGES = [
  { step: 1, label: "First request", when: "Day 0" },
  { step: 2, label: "Gentle reminder", when: "Day 3" },
  { step: 3, label: "Final reminder", when: "Day 7" },
];

export function WhatsappPreview({
  clientName,
  contact,
  item,
  firmName,
  compact = false,
}: {
  clientName: string;
  contact: string;
  item: string;
  firmName: string;
  compact?: boolean;
}) {
  const [step, setStep] = useState(1);
  const text = chaseText(chaseTemplateParams({ contactName: contact.trim() || "Asha", clientName, items: [item], firmName }), step);
  const btn = (label: string, icon: React.ReactNode) => (
    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "9px 12px", textAlign: "center", color: "#00A5F4", fontSize: 13.5, fontWeight: 600, display: "flex", gap: 6, alignItems: "center", justifyContent: "center", boxShadow: "0 1px 0.5px rgba(11,20,26,.13)" }}>
      {icon} {label}
    </div>
  );
  return (
    <div data-testid="whatsapp-preview" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: V.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <WhatsAppIcon size={14} /> What your client sees
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }} role="tablist" aria-label="Reminder stage">
          {STAGES.map((s) => (
            <button
              key={s.step}
              type="button"
              role="tab"
              aria-selected={step === s.step}
              onClick={() => setStep(s.step)}
              style={{ border: `1px solid ${step === s.step ? V.coral : V.line}`, background: step === s.step ? V.blue : V.card, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, cursor: "pointer", color: V.ink, font: "inherit" }}
            >
              {s.when}
            </button>
          ))}
        </span>
      </div>
      <div style={{ background: "#EFEAE2", borderRadius: 16, padding: compact ? 10 : 14, display: "grid", gap: 4 }}>
        <div style={{ background: "#fff", borderRadius: "4px 12px 12px 12px", padding: "9px 11px 6px", fontSize: 13.5, lineHeight: 1.5, color: "#111B21", maxWidth: 320, boxShadow: "0 1px 0.5px rgba(11,20,26,.13)", whiteSpace: "pre-wrap" }}>
          {text}
          <div style={{ fontSize: 10.5, color: "#667781", textAlign: "right", marginTop: 2, display: "flex", gap: 3, justifyContent: "flex-end", alignItems: "center" }}>
            now <CheckCheck size={12} color="#53BDEB" aria-hidden />
          </div>
        </div>
        <div style={{ display: "grid", gap: 4, maxWidth: 320 }}>
          {btn(UPLOAD_BUTTON_LABEL, <ExternalLink size={14} aria-hidden />)}
          {(["sending", "later", "stop"] as const).map((a) => btn(CHASE_BUTTON_LABEL[a], <Reply size={14} aria-hidden />))}
        </div>
      </div>
      {!compact && (
        <div style={{ fontSize: 11.5, color: V.muted, lineHeight: 1.5 }}>
          The client taps a button or just sends the file. Taps are saved on the chase and answered at once, and any reply opens a free 24-hour window.
        </div>
      )}
    </div>
  );
}
