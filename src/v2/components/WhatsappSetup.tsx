/**
 * Settings → WhatsApp Business. One short flow:
 *   1. Choose the number: FynHelp's, or your own.
 *   2. Only what that choice needs (nothing for FynHelp's; the Phone number ID for your own).
 *   3. How reminders behave.
 *   4. A test that names anything still broken.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getChaserPrefs, setChaserPrefs, type ChaserPrefs } from "@/lib/caGmail.functions";
import {
  checkPracticeWhatsapp,
  connectPracticeWhatsapp,
  getPracticeWhatsappStatus,
} from "@/lib/practice/practice.functions";
import { COUNTRY_CODES } from "@/lib/practice/chaser/rules";
import { useBilling } from "../lib/billing";
import { V } from "../ui";

type Status = Awaited<ReturnType<typeof getPracticeWhatsappStatus>>;
type Health = Awaited<ReturnType<typeof checkPracticeWhatsapp>>;
type Mode = "fynhelp" | "own";

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

const copy = (text: string) => {
  void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
};

function Choice({ selected, disabled, title, line, tag, onPick }: { selected: boolean; disabled?: boolean; title: string; line: string; tag?: string; onPick: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onPick}
      style={{
        textAlign: "left", padding: "14px 16px", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer",
        background: selected ? "rgba(169,56,56,.06)" : V.card, color: V.ink, opacity: disabled ? 0.55 : 1,
        border: `${selected ? 2 : 1}px solid ${selected ? V.maroon : V.line}`, display: "grid", gap: 4, font: "inherit",
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <b style={{ fontSize: 14.5 }}>{title}</b>
        {selected ? <Check size={16} color={V.maroon} aria-hidden="true" /> : tag ? <span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>{tag}</span> : null}
      </span>
      <span style={{ fontSize: 12.5, color: V.body, lineHeight: 1.5 }}>{line}</span>
    </button>
  );
}

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section style={{ display: "grid", gap: 10 }}>
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 999, background: V.ink, color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <h4 style={{ margin: 0, fontSize: 14.5 }}>{title}</h4>
    </div>
    <div style={{ paddingLeft: 32, display: "grid", gap: 10 }}>{children}</div>
  </section>
);

export function WhatsappSetup({ firmId, webhook, onChanged }: { firmId: string; webhook: string; onChanged?: () => void }) {
  const loadStatus = useServerFn(getPracticeWhatsappStatus);
  const link = useServerFn(connectPracticeWhatsapp);
  const check = useServerFn(checkPracticeWhatsapp);
  const loadPrefs = useServerFn(getChaserPrefs);
  const savePrefs = useServerFn(setChaserPrefs);
  const planAllows = useBilling()?.access.whatsappChaser ?? false;

  const [status, setStatus] = useState<Status | null>(null);
  const [prefs, setPrefs] = useState<ChaserPrefs | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [f, setF] = useState({ id: "", display: "", token: "", secret: "", waba: "" });

  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([loadStatus(), loadPrefs({ data: { firmId } })]);
    setStatus(s);
    setPrefs(p);
    setMode((m) => m ?? s.sender ?? (s.shared.configured ? "fynhelp" : "own"));
  }, [loadStatus, loadPrefs, firmId]);
  useEffect(() => {
    void refresh().catch((e) => toast.error(errMsg(e)));
  }, [refresh]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      await refresh();
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  if (!status || !prefs || !mode) return <div style={{ fontSize: 13, color: V.muted }}>Loading…</div>;

  const own = status.channels.find((c) => c.is_active) ?? null;
  const sharedOk = status.shared.configured;
  const usable = mode === "fynhelp" ? sharedOk : Boolean(own);
  const using = status.sender;

  const pick = (m: Mode) => {
    setMode(m);
    setHealth(null);
    if (m === "fynhelp" && sharedOk) void run("pick", () => savePrefs({ data: { firmId, whatsappSender: "fynhelp" } }), "Using FynHelp's WhatsApp number");
    if (m === "own" && own) void run("pick", () => savePrefs({ data: { firmId, whatsappSender: "own" } }), "Using your own WhatsApp number");
  };

  const doLink = () =>
    run(
      "link",
      async () => {
        await link({
          data: {
            phone_number_id: f.id.trim(),
            display_phone: f.display.trim() || undefined,
            access_token: f.token.trim() || undefined,
            app_secret: f.secret.trim() || undefined,
            waba_id: f.waba.trim() || undefined,
          },
        });
        await savePrefs({ data: { firmId, whatsappSender: "own" } });
        setF({ id: "", display: "", token: "", secret: "", waba: "" });
        setEditing(false);
      },
      "Your WhatsApp number is linked",
    );

  return (
    <div style={{ display: "grid", gap: 20 }} data-testid="whatsapp-setup">
      <Step n={1} title="Which WhatsApp number should FynHelp use?">
        <div role="radiogroup" aria-label="WhatsApp number" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
          <Choice
            selected={mode === "fynhelp"} title="FynHelp's number" tag="Easiest"
            line={sharedOk ? `${status.shared.display ?? "Shared number"}. Nothing to set up. Your firm's name is in every message.` : "Nothing to set up for you. Not switched on for this server yet."}
            disabled={busy === "pick"} onPick={() => pick("fynhelp")}
          />
          <Choice
            selected={mode === "own"} title="My own number"
            line="Clients see your own WhatsApp Business number. Needs a number on Meta's WhatsApp Business Platform."
            disabled={busy === "pick"} onPick={() => pick("own")}
          />
        </div>
      </Step>

      {mode === "fynhelp" ? (
        <Step n={2} title="Your number">
          {sharedOk ? (
            <>
              <div style={{ fontSize: 13, color: V.green, fontWeight: 600 }}>
                ✓ Ready{status.shared.display ? `: ${status.shared.display}` : ""}{using === "fynhelp" ? " · in use" : ""}
              </div>
              <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
                Reminders go out from this number, and replies and documents come back to your firm. A client who writes first is matched to you automatically by the phone number saved in your client list. If that cannot be done (for example, the number is not saved, or the same number is a client of two firms), they can send this code to the number once:
              </div>
              {status.shared.join_code && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>JOIN {status.shared.join_code}</code>
                  <button className="v2-btn v2-btn-ghost" onClick={() => copy(`JOIN ${status.shared.join_code}`)}><Copy size={14} /> Copy</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: V.maroon, lineHeight: 1.6 }}>
              FynHelp's number is not switched on for this server yet. Missing: <b>{status.shared.missing.length ? status.shared.missing.join(", ") : "its settings"}</b>.
              Add {status.shared.missing.length === 1 ? "it" : "them"} in the server settings and redeploy, or choose "My own number".
            </div>
          )}
        </Step>
      ) : (
        <Step n={2} title="Your number">
          {own && !editing ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ color: V.green, fontWeight: 600 }}>✓ Linked: {own.display_phone ?? own.phone_number_id}{using === "own" ? " · in use" : ""}</span>
              <button className="v2-btn v2-btn-quiet" onClick={() => setEditing(true)}>Change</button>
            </div>
          ) : (
            <>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: V.body, lineHeight: 1.7 }}>
                <li>In Meta's WhatsApp Manager open your number and copy its <b>Phone number ID</b> (a long number, not the phone number).</li>
                <li>Paste it below, with the number your clients see.</li>
                <li>In Meta, set the webhook to <span className="num">{webhook}</span> and subscribe to <b>messages</b>. <button className="v2-btn v2-btn-quiet" onClick={() => copy(webhook)}>Copy</button></li>
              </ol>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input className="v2-input" style={{ flex: "1 1 220px" }} inputMode="numeric" placeholder="Phone number ID" aria-label="Phone number ID" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} />
                <input className="v2-input" style={{ flex: "1 1 200px" }} placeholder="Number clients see, e.g. +91 98450 12345" aria-label="Display number" value={f.display} onChange={(e) => setF({ ...f, display: e.target.value })} />
              </div>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: V.body }}>Advanced: the number is on my own Meta business account</summary>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <input className="v2-input" type="password" autoComplete="off" placeholder="Permanent access token for this number" aria-label="Access token" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} />
                  <input className="v2-input" type="password" autoComplete="off" placeholder="App secret of your Meta app" aria-label="App secret" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} />
                  <input className="v2-input" placeholder="WhatsApp Business Account ID (lets us check your template)" aria-label="WhatsApp Business Account ID" value={f.waba} onChange={(e) => setF({ ...f, waba: e.target.value })} />
                  <div style={{ fontSize: 12, color: V.muted }}>Stored encrypted and never shown again. Skip these if the number is on FynHelp's Meta app.</div>
                </div>
              </details>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="v2-btn v2-btn-primary" disabled={!f.id.trim() || busy === "link"} onClick={() => void doLink()}>
                  {busy === "link" ? "Linking…" : "Link number"}
                </button>
                {own && <button className="v2-btn v2-btn-quiet" onClick={() => setEditing(false)}>Cancel</button>}
              </div>
            </>
          )}
        </Step>
      )}

      {usable && (
        <Step n={3} title="How reminders work">
          <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
            You can send a WhatsApp reminder from any chase. Messages go out between 9:30 am and 6:30 pm IST, Monday to Saturday. A client who replies STOP is not messaged again.
          </div>
          {planAllows ? (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input type="checkbox" checked={prefs.whatsappAuto} disabled={busy === "auto"} style={{ marginTop: 3 }}
                onChange={(e) => void run("auto", () => savePrefs({ data: { firmId, whatsappAuto: e.target.checked } }), e.target.checked ? "Automatic WhatsApp reminders on" : "Automatic WhatsApp reminders off")} />
              <span>Also send a WhatsApp reminder automatically from the second reminder on, together with the email.</span>
            </label>
          ) : (
            <div style={{ fontSize: 13, color: V.muted }}>WhatsApp reminders are on the Firm and Scale plans. Your trial includes email.</div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <label htmlFor="wa-country">Phone numbers saved without a country code are in</label>
            <select id="wa-country" className="v2-input" style={{ width: 220 }} disabled={busy === "country"}
              value={COUNTRY_CODES.some((c) => c.code === prefs.countryCode) ? prefs.countryCode : ""}
              onChange={(e) => void run("country", () => savePrefs({ data: { firmId, countryCode: e.target.value } }), "Default country saved")}>
              {!COUNTRY_CODES.some((c) => c.code === prefs.countryCode) && <option value="">+{prefs.countryCode}</option>}
              {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
        </Step>
      )}

      <Step n={usable ? 4 : 3} title="Test the connection">
        <div>
          <button className="v2-btn v2-btn-ghost" disabled={busy === "check"}
            onClick={() => void run("check", async () => setHealth(await check()))}>
            {busy === "check" ? "Checking…" : "Check WhatsApp connection"}
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
      </Step>
    </div>
  );
}
