import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getChaserPrefs, setChaserPrefs, type ChaserPrefs } from "@/lib/caGmail.functions";
import { V } from "../ui";

const TONES: { value: ChaserPrefs["tone"]; label: string; hint: string }[] = [
  { value: "gentle", label: "Gentle", hint: "Always polite; the third reminder is a soft check-in." },
  { value: "standard", label: "Standard", hint: "Polite first two; a clear final reminder with the deadline." },
  { value: "firm", label: "Firm", hint: "Direct from the second reminder, naming the delay and its cost." },
];

/** How the Chaser's emails leave: the firm's own Gmail when allowed, else the FynHelp address. */
export function ChaserSending({ firmId, onAllow, busy }: { firmId: string; onAllow: () => void; busy: boolean }) {
  const load = useServerFn(getChaserPrefs);
  const save = useServerFn(setChaserPrefs);
  const [prefs, setPrefs] = useState<ChaserPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    void load({ data: { firmId } }).then(setPrefs).catch(() => setPrefs(null));
  }, [load, firmId]);
  useEffect(refresh, [refresh]);

  const update = async (patch: { viaGmail?: boolean; tone?: ChaserPrefs["tone"] }) => {
    setSaving(true);
    try {
      setPrefs(await save({ data: { firmId, ...patch } }));
      toast.success("Chaser settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return null;
  return (
    <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 12, display: "grid", gap: 10 }} data-testid="chaser-sending">
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Chaser emails</div>
      {prefs.sendGranted ? (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
          <input
            type="checkbox" checked={prefs.viaGmail} disabled={saving}
            onChange={(e) => void update({ viaGmail: e.target.checked })}
            style={{ marginTop: 3 }}
          />
          <span>
            Send chasers from my Gmail. They arrive as you, replies come to your inbox, and a returning document closes the chase.
            {!prefs.viaGmail && <span style={{ color: V.muted }}> Off: they go from the FynHelp address.</span>}
          </span>
        </label>
      ) : (
        <div style={{ fontSize: 13, color: V.body }}>
          Chasers go from the FynHelp address, with your firm's name and your reply-to. For a higher reply rate, let FynHelp send them from your own Gmail.
          <div style={{ marginTop: 8 }}>
            <button className="v2-btn v2-btn-ghost" disabled={busy} onClick={onAllow}>
              Allow sending from my Gmail
            </button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="v2-label" htmlFor="chaser-tone" style={{ margin: 0 }}>Tone</label>
        <select
          id="chaser-tone" className="v2-input" style={{ width: 160 }} value={prefs.tone} disabled={saving}
          onChange={(e) => void update({ tone: e.target.value as ChaserPrefs["tone"] })}
        >
          {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: V.muted }}>{TONES.find((t) => t.value === prefs.tone)?.hint}</span>
      </div>
      <div style={{ fontSize: 12, color: V.muted }}>
        Schedule: day 0 request, day 3 nudge, day 7 final reminder, day 10 it comes to you. One email per client for everything missing. Sent 9:30 am to 6:30 pm IST, Monday to Saturday.
      </div>
    </div>
  );
}
