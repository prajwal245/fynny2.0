/**
 * Settings → WhatsApp. The Chaser agent's home for WhatsApp, kept to one screen:
 *   a header that says at a glance whether it is ready (number, messages, credits),
 *   and four tabs: Number · Messages · Rules · Check.
 * It opens on the first tab that needs attention. Everything is the same set of settings as before; only the shape
 * changed, so nothing needs scrolling past.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getChaserPrefs, setChaserPrefs, type ChaserPrefs } from "@/lib/caGmail.functions";
import { checkPracticeWhatsapp, connectPracticeWhatsapp, getPracticeWhatsappStatus } from "@/lib/practice/practice.functions";
import { COUNTRY_CODES } from "@/lib/practice/chaser/rules";
import { remindersLeft } from "@/lib/practice/billing/credits";
import { useBilling } from "../lib/billing";
import { useCredits } from "../lib/credits";
import { AnimatedCounter, AgentGlyph, AgentStatusBadge } from "../agents";
import { V } from "../ui";
import { WhatsAppIcon } from "./BrandIcons";
import { AgentTabs, type TabDef } from "./AgentTabs";
import { AgentRunSteps } from "./AgentRunSteps";
import { WhatsappPreview } from "./WhatsappPreview";
import { useV2 } from "../store";

type Status = Awaited<ReturnType<typeof getPracticeWhatsappStatus>>;
type Health = Awaited<ReturnType<typeof checkPracticeWhatsapp>>;
type Mode = "fynhelp" | "own";
type Tab = "number" | "messages" | "rules" | "check";

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

const Block = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <section style={{ display: "grid", gap: 10 }}>
    {title && <h4 style={{ margin: 0, fontSize: 14.5 }}>{title}</h4>}
    <div style={{ display: "grid", gap: 10 }}>{children}</div>
  </section>
);

/** What the client sees. The wording is managed by FynHelp, so this shows the messages and nothing about their set-up. */
function MessagesTab() {
  const { firm } = useV2();
  return (
    <Block title="What your clients receive">
      <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
        Each reminder is a short WhatsApp message with four buttons: upload documents without logging in, sending today, need more time, or stop reminders. FynHelp looks after the wording and keeps it working.
      </div>
      <WhatsappPreview clientName="Acme Traders" contact="Asha" item="Bank statement" firmName={firm?.name ?? "Your firm"} />
    </Block>
  );
}

/** A figure in the header that also takes you to the tab it belongs to. */
function Stat({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".07em", textTransform: "uppercase", color: V.muted }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, lineHeight: 1.3 }}>{children}</span>
    </>
  );
  const style: React.CSSProperties = { display: "grid", gap: 2, textAlign: "left", padding: "8px 12px", borderRadius: 12, background: V.card, border: `1px solid ${V.line}`, font: "inherit", minWidth: 0 };
  return onClick ? (
    <button type="button" className="v2-lift" onClick={onClick} style={{ ...style, cursor: "pointer" }}>{inner}</button>
  ) : (
    <div style={style}>{inner}</div>
  );
}

export function WhatsappSetup({ firmId, webhook, onChanged }: { firmId: string; webhook: string; onChanged?: () => void }) {
  const loadStatus = useServerFn(getPracticeWhatsappStatus);
  const link = useServerFn(connectPracticeWhatsapp);
  const check = useServerFn(checkPracticeWhatsapp);
  const loadPrefs = useServerFn(getChaserPrefs);
  const savePrefs = useServerFn(setChaserPrefs);
  const planAllows = useBilling()?.access.whatsappChaser ?? false;
  const credits = useCredits();
  const reduce = useReducedMotion();

  const [status, setStatus] = useState<Status | null>(null);
  const [prefs, setPrefs] = useState<ChaserPrefs | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
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

  const own = status?.channels.find((c) => c.is_active) ?? null;
  const sharedOk = Boolean(status?.shared.configured);
  const usable = mode === "fynhelp" ? sharedOk : Boolean(own);
  const using = status?.sender ?? null;
  // Opens on the number; the message wording is managed by FynHelp.
  const active: Tab = tab ?? "number";

  const tabs: TabDef[] = useMemo(
    () => [
      { key: "number", label: "Number", badge: status && !usable ? { tone: "warn" } : null },
      { key: "messages", label: "Messages" },
      { key: "rules", label: "Rules" },
      { key: "check", label: "Check", badge: health ? { tone: health.ok ? "good" : "bad" } : null },
    ],
    [status, usable, health],
  );

  if (!status || !prefs || !mode) return <div style={{ fontSize: 13, color: V.muted }}>Loading…</div>;

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

  const numberLabel = mode === "fynhelp" ? (status.shared.display ?? "FynHelp's number") : (own?.display_phone ?? own?.phone_number_id ?? "Not linked");
  const working = busy === "pick" || busy === "link" || busy === "check" || busy === "auto" || busy === "country";
  const sendReady = usable && planAllows;

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="whatsapp-setup">
      {/* The agent at a glance */}
      <div style={{ display: "grid", gap: 12, padding: 14, borderRadius: 16, background: `linear-gradient(135deg, ${V.gray}, ${V.card})`, border: `1px solid ${V.line}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <AgentGlyph agent="chaser" state={working ? "running" : "idle"} size={40} />
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>Chaser on WhatsApp</b>
              {sendReady ? <AgentStatusBadge agent="chaser" label="Active" active /> : <AgentStatusBadge agent="chaser" label={usable ? "Paused" : "Needs a number"} />}
            </div>
            <div style={{ fontSize: 12.5, color: V.body, marginTop: 2 }}>
              {usable ? `Reminders go out from ${numberLabel}${using ? "" : ""}.` : "Choose a number to start sending reminders."}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <Stat label="Number" onClick={() => setTab("number")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <WhatsAppIcon size={14} /> {numberLabel}
            </span>
          </Stat>
          <Stat label="Messages" onClick={() => setTab("messages")}>
            3 reminders, managed by FynHelp
          </Stat>
          {status.shared.configured && mode === "fynhelp" && credits && !credits.unmetered && (
            <Stat label="Credits">
              <AnimatedCounter value={credits.balance} format={(n) => `${Math.round(n).toLocaleString("en-IN")} · ${remindersLeft(Math.round(n)).replace(" left", "")}`} />
            </Stat>
          )}
        </div>
        {usable && !planAllows && (
          <div role="status" style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 10, background: V.warnBg, color: V.warnFg }}>
            WhatsApp reminders are paused until you choose a plan in Settings, Billing.
          </div>
        )}
      </div>

      <AgentTabs label="WhatsApp settings" tabs={tabs} value={active} onChange={(k) => setTab(k as Tab)} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          role="tabpanel"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          style={{ display: "grid", gap: 18 }}
        >
          {active === "number" && (
            <>
              <Block title="Which WhatsApp number should FynHelp use?">
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
              </Block>

              {mode === "fynhelp" ? (
                <Block title="Your number">
                  {sharedOk ? (
                    <>
                      <div style={{ fontSize: 13, color: V.green, fontWeight: 600 }}>
                        ✓ Ready{status.shared.display ? `: ${status.shared.display}` : ""}{using === "fynhelp" ? " · in use" : ""}
                      </div>
                      <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
                        Your reminders are sent from this number, and clients' replies and documents come back to you. Clients saved with a phone number are linked to you automatically. If a client isn't, ask them to send this code to the number once:
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
                </Block>
              ) : (
                <Block title="Your number">
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
                </Block>
              )}
            </>
          )}

          {active === "messages" && (usable ? <MessagesTab /> : <div style={{ fontSize: 13, color: V.muted }}>Choose or link a number first, then your reminder messages appear here.</div>)}

          {active === "rules" && (
            <Block title="How reminders work">
              <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
                You can send a WhatsApp reminder from any chase. Messages go out between 9:30 am and 6:30 pm IST, Monday to Saturday. A client who replies STOP is not messaged again.
              </div>
              {planAllows && (
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input type="checkbox" checked={prefs.whatsappAuto} disabled={busy === "auto"} style={{ marginTop: 3 }}
                    onChange={(e) => void run("auto", () => savePrefs({ data: { firmId, whatsappAuto: e.target.checked } }), e.target.checked ? "Automatic WhatsApp reminders on" : "Automatic WhatsApp reminders off")} />
                  <span>Also send a WhatsApp reminder automatically from the second reminder on, together with the email.</span>
                </label>
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
            </Block>
          )}

          {active === "check" && (
            <Block title="Test the connection">
              <div style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>
                The Chaser checks your token, number, webhook and each reminder template, and says exactly which one needs fixing.
              </div>
              <div>
                <button className="v2-btn v2-btn-primary" disabled={busy === "check"} data-working={busy === "check"}
                  onClick={() => void run("check", async () => { setHealth(null); setHealth(await check()); })}>
                  {busy === "check" ? "Checking…" : health ? "Check again" : "Check WhatsApp connection"}
                </button>
              </div>
              {(busy === "check" || health) && (
                <AgentRunSteps
                  agent="chaser"
                  working={busy === "check"}
                  workingText="Chaser is checking your WhatsApp connection…"
                  steps={health ? health.steps : null}
                  verdict={health ? { ok: health.ok, text: health.ok ? "WhatsApp is ready to send and receive." : "Fix the items marked and check again." } : null}
                />
              )}
            </Block>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
