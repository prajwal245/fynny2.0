import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getChaserPrefs, setChaserPrefs, type ChaserPrefs } from "@/lib/caGmail.functions";
import { checkPracticeWhatsapp, getPracticeWhatsappStatus } from "@/lib/practice/practice.functions";
import { useBilling } from "../lib/billing";
import { COUNTRY_CODES } from "@/lib/practice/chaser/rules";
import { V } from "../ui";

type Health = Awaited<ReturnType<typeof checkPracticeWhatsapp>>;
type Status = Awaited<ReturnType<typeof getPracticeWhatsappStatus>>;

/** WhatsApp for the Chaser: a connection check that names the broken link, and the auto-reminder switch. */
export function WhatsappChaser({ firmId }: { firmId: string }) {
  const check = useServerFn(checkPracticeWhatsapp);
  const load = useServerFn(getChaserPrefs);
  const save = useServerFn(setChaserPrefs);
  const allowed = useBilling()?.access.whatsappChaser ?? false;
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [prefs, setPrefs] = useState<ChaserPrefs | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void load({ data: { firmId } }).then(setPrefs).catch(() => setPrefs(null));
    void getPracticeWhatsappStatus().then(setStatus).catch(() => setStatus(null));
  }, [load, firmId]);

  const pickNumber = async (whatsappSender: "fynhelp" | "own") => {
    try {
      setPrefs(await save({ data: { firmId, whatsappSender } }));
      setStatus(await getPracticeWhatsappStatus());
      setHealth(null);
      toast.success(whatsappSender === "own" ? "Using your own WhatsApp number" : "Using FynHelp's WhatsApp number");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };
  const ownLinked = Boolean(status?.channels.some((c) => c.is_active));
  const using = status?.sender ?? null;

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

  const setCountry = async (countryCode: string) => {
    try {
      setPrefs(await save({ data: { firmId, countryCode } }));
      toast.success("Default country saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${V.line}`, paddingTop: 12, display: "grid", gap: 10 }} data-testid="whatsapp-chaser">
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Which WhatsApp number to use</div>
      <div role="radiogroup" aria-label="WhatsApp number" style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, opacity: status?.shared.configured ? 1 : 0.6 }}>
          <input type="radio" name="wa-sender" checked={using === "fynhelp"} disabled={!status?.shared.configured} onChange={() => void pickNumber("fynhelp")} style={{ marginTop: 3 }} />
          <span>
            <b>FynHelp's number</b>{status?.shared.display ? ` (${status.shared.display})` : ""}. Nothing to set up. Reminders show your firm's name in the message, and replies and documents reach you.
            {!status?.shared.configured && <span style={{ color: V.muted }}> Not switched on yet.</span>}
            {using === "fynhelp" && status?.shared.join_code && (
              <span style={{ display: "block", color: V.muted, marginTop: 4 }}>
                To receive documents from a client who has not been chased yet, ask them to send <span className="num">JOIN {status.shared.join_code}</span> to this number once.
              </span>
            )}
          </span>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, opacity: ownLinked ? 1 : 0.6 }}>
          <input type="radio" name="wa-sender" checked={using === "own"} disabled={!ownLinked} onChange={() => void pickNumber("own")} style={{ marginTop: 3 }} />
          <span>
            <b>My own number</b>. Clients see your own WhatsApp Business number.
            {!ownLinked && <span style={{ color: V.muted }}> Link it with the Phone number ID above first.</span>}
          </span>
        </label>
      </div>
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
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="v2-label" htmlFor="wa-country" style={{ margin: 0 }}>Numbers saved without a country code are in</label>
        <select
          id="wa-country" className="v2-input" style={{ width: 220 }} disabled={!prefs}
          value={COUNTRY_CODES.some((c) => c.code === prefs?.countryCode) ? prefs?.countryCode : ""}
          onChange={(e) => void setCountry(e.target.value)}
        >
          {!COUNTRY_CODES.some((c) => c.code === prefs?.countryCode) && <option value="">+{prefs?.countryCode ?? "91"}</option>}
          {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: V.muted }}>Numbers that start with + or 00 are always used as written.</span>
      </div>
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
