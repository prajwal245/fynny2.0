import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getChaserPrefs, setChaserPrefs, type ChaserPrefs } from "@/lib/caGmail.functions";
import { checkPracticeWhatsapp } from "@/lib/practice/practice.functions";
import { useBilling } from "../lib/billing";
import { V } from "../ui";

type Health = Awaited<ReturnType<typeof checkPracticeWhatsapp>>;

/** WhatsApp for the Chaser: a connection check that names the broken link, and the auto-reminder switch. */
export function WhatsappChaser({ firmId }: { firmId: string }) {
  const check = useServerFn(checkPracticeWhatsapp);
  const load = useServerFn(getChaserPrefs);
  const save = useServerFn(setChaserPrefs);
  const allowed = useBilling()?.access.whatsappChaser ?? false;
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [prefs, setPrefs] = useState<ChaserPrefs | null>(null);

  useEffect(() => {
    void load({ data: { firmId } }).then(setPrefs).catch(() => setPrefs(null));
  }, [load, firmId]);

  const runCheck = async () => {
    setChecking(true);
    try {
      setHealth(await check());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check WhatsApp");
    } finally {
      setChecking(false);
    }
  };

  const toggle = async (on: boolean) => {
    try {
      setPrefs(await save({ data: { firmId, whatsappAuto: on } }));
      toast.success(on ? "WhatsApp reminders on" : "WhatsApp reminders off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 12, display: "grid", gap: 10 }} data-testid="whatsapp-chaser">
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Chaser on WhatsApp</div>
      {allowed ? (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
          <input type="checkbox" checked={prefs?.whatsappAuto ?? false} disabled={!prefs} onChange={(e) => void toggle(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Also send a WhatsApp reminder from the second reminder on, alongside the email. Sent with your approved message template, in the same 9:30 am to 6:30 pm window. A client who replies STOP is not messaged again.
          </span>
        </label>
      ) : (
        <div style={{ fontSize: 13, color: V.muted }}>Automatic WhatsApp reminders are on the Firm and Scale plans. You can still send one by hand from a chase on those plans.</div>
      )}
      <div>
        <button className="v2-btn v2-btn-ghost" disabled={checking} onClick={() => void runCheck()}>
          {checking ? "Checking…" : "Check WhatsApp connection"}
        </button>
      </div>
      {health && (
        <div style={{ display: "grid", gap: 6, fontSize: 12.5 }} role="status">
          {health.steps.map((s) => (
            <div key={s.label} style={{ display: "flex", gap: 8, color: s.ok === false ? V.maroon : V.body }}>
              <span aria-hidden="true">{s.ok === true ? "✓" : s.ok === false ? "✗" : "–"}</span>
              <span><b>{s.label}.</b> {s.detail}</span>
            </div>
          ))}
          <div style={{ fontWeight: 600, color: health.ok ? V.green : V.maroon }}>
            {health.ok ? "WhatsApp is ready to send and receive." : "Fix the items marked ✗ and check again."}
          </div>
        </div>
      )}
    </div>
  );
}
