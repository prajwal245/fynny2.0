import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { toast } from "sonner";
import { CAField, caInputStyle } from "./portalUi";

interface ICAIGateProps {
  onUnlocked: () => void;
  onCancel: () => void;
  actionLabel: string;
}

export function ICAIGate({ onUnlocked, onCancel, actionLabel }: ICAIGateProps) {
  const { firmId } = useCAPortal();
  const [icai, setIcai] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!/^\d{4,7}$/.test(icai.trim())) {
      toast.error("Enter a valid ICAI membership number (4 to 7 digits)");
      return;
    }
    if (!firmId) { toast.error("No practice found for this account"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("ca_firms")
      .update({ icai_membership_number: icai.trim(), membership_number: icai.trim() })
      .eq("id", firmId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("ICAI number saved. You can now proceed.");
    onUnlocked();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(23,18,8,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div style={{
        background: "#FFFDF9", borderRadius: 16, padding: 32,
        maxWidth: 420, width: "100%",
        border: "1px solid rgba(23,18,8,0.10)",
        boxShadow: "0 24px 48px rgba(23,18,8,0.18)"
      }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#A93838", marginBottom: 8 }}>
          CA action required
        </div>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 600, color: "#171208", marginBottom: 8 }}>
          {actionLabel} requires a qualified CA
        </div>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: "rgba(23,18,8,0.65)", lineHeight: 1.6, marginBottom: 20 }}>
          This action has legal implications under Indian tax law and must be performed by a practising Chartered Accountant. Please enter your ICAI membership number to proceed. This is saved once and not asked again.
        </p>
        <CAField label="ICAI membership number">
          <input
            style={{ ...caInputStyle, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em" }}
            value={icai}
            onChange={(e) => setIcai(e.target.value.replace(/\D/g, "").slice(0, 7))}
            placeholder="e.g. 123456"
            autoFocus
          />
        </CAField>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, height: 42, background: "#A93838", color: "#F7F1E6",
              border: "none", borderRadius: 10, fontFamily: "'Inter',sans-serif",
              fontWeight: 600, fontSize: 14, cursor: saving ? "wait" : "pointer"
            }}
          >
            {saving ? "Saving..." : "Save and proceed"}
          </button>
          <button
            onClick={onCancel}
            style={{
              height: 42, padding: "0 18px", background: "transparent",
              border: "1px solid rgba(23,18,8,0.15)", borderRadius: 10,
              fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 14,
              cursor: "pointer", color: "#171208"
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
