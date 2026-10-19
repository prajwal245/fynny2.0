/**
 * WhatsApp follow-ups from FynHelp's own number. A partner switches it on once,
 * confirms the firm's clients agreed to be messaged, and the Chaser then sends
 * (or prepares for approval) approved reminders that carry the firm's name.
 * Replies and documents come back to FynHelp and are filed under the client.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, MessageCircle, X } from "lucide-react";
import { whatsappApprove, whatsappDiscard, whatsappFollowUpSettings, whatsappFollowUpStatus } from "@/lib/practice/practice.functions";
import { WA_TEMPLATES, renderBody } from "@/lib/practice/whatsapp/templates";
import { V } from "../ui";
import { useV2 } from "../store";
import { WhatsAppIcon } from "./BrandIcons";
import { IntegrationCard } from "./IntegrationCard";

type Status = Awaited<ReturnType<typeof whatsappFollowUpStatus>>;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

export function useWaStatus() {
  const [st, setSt] = useState<Status | null>(null);
  const reload = useCallback(async () => {
    try { setSt(await whatsappFollowUpStatus()); } catch { /* the screen still works without it */ }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { st, reload };
}

/** True when a follow-up will go from FynHelp's number rather than as a link from the person's own phone. */
export const viaFynHelp = (st: Status | null) => !!st && st.available && st.settings.enabled;

export function WhatsAppFollowUpsCard({ index = 0 }: { index?: number }) {
  const { firm, canSignOff } = useV2();
  const { st, reload } = useWaStatus();
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);

  const save = async (patch: Parameters<typeof whatsappFollowUpSettings>[0]["data"], ok?: string) => {
    setBusy(true);
    try { await whatsappFollowUpSettings({ data: patch }); if (ok) toast.success(ok); await reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (!st) return <div className="ic-skel" aria-label="Loading WhatsApp follow-ups" />;
  const { settings, usage } = st;
  const consented = !!settings.consent_confirmed_at;
  const status = !st.available
    ? { tone: "warn" as const, label: "Not switched on yet" }
    : settings.enabled
      ? { tone: "good" as const, label: settings.mode === "auto" ? "On · automatic" : "On · you approve", live: true }
      : { tone: "neutral" as const, label: "Off" };
  const sample = renderBody(WA_TEMPLATES.first, ["Ravi", firm?.name ?? "Your firm", "bank statement for September 2026", "Kaveri Fashions"]);
  const pct = usage.allowance ? Math.min(100, Math.round((usage.month / usage.allowance) * 100)) : 0;

  return (
    <IntegrationCard
      index={index}
      testId="wa-followups"
      icon={<WhatsAppIcon size={26} />}
      tint="rgba(37,211,102,.1)"
      name="WhatsApp follow-ups"
      tag={<span style={{ fontSize: 11, color: V.muted, fontWeight: 600 }}>FROM FYNHELP'S NUMBER</span>}
      description={st.available
        ? "Chase clients on WhatsApp without setting anything up. Messages go from FynHelp's verified number and name your firm; replies and documents come straight back here."
        : "FynHelp's WhatsApp number isn't switched on yet. Write to support@fynhelp.com and we will tell you when it is."}
      status={status}
      defaultOpen={settings.enabled || usage.drafts > 0}
      actions={canSignOff && st.available ? (
        settings.enabled ? (
          <button className="v2-btn v2-btn-quiet" disabled={busy} onClick={() => void save({ enabled: false }, "WhatsApp follow-ups switched off")}>Switch off</button>
        ) : (
          <button className="v2-btn v2-btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} disabled={busy || (!consented && !agree)} data-testid="wa-enable" onClick={() => void save({ enabled: true, confirmConsent: agree || undefined }, "WhatsApp follow-ups are on")}>
            Switch on
          </button>
        )
      ) : undefined}
    >
      {st.available && (
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div className="ic-step-label">What your client sees</div>
            <div style={{ background: "#E7F6DD", borderRadius: "14px 14px 14px 4px", padding: "10px 14px", fontSize: 13.5, lineHeight: 1.5, maxWidth: 420, color: "#1d2b14" }}>{sample}</div>
            <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>Sent from FynHelp's number. Clients can reply with a photo or PDF, which is filed under them, or reply STOP to opt out.</div>
          </div>

          {!consented && !settings.enabled && canSignOff && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, background: V.cream, borderRadius: 12, padding: "10px 12px", cursor: "pointer" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} data-testid="wa-consent" />
              <span>I confirm my clients have agreed to receive messages from my firm on WhatsApp. WhatsApp requires this, and anyone who replies STOP is never messaged again.</span>
            </label>
          )}

          {canSignOff && (
            <div style={{ display: "grid", gap: 8 }}>
              <div className="ic-step-label">Who sends each round</div>
              {(["approve", "auto"] as const).map((m) => (
                <label key={m} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, cursor: busy ? "default" : "pointer" }}>
                  <input type="radio" name="wa-mode" checked={settings.mode === m} disabled={busy} onChange={() => void save({ mode: m })} style={{ marginTop: 3 }} />
                  <span>
                    <b>{m === "approve" ? "I approve each round first" : "Send automatically"}</b>
                    <span style={{ display: "block", fontSize: 12.5, color: V.body }}>
                      {m === "approve" ? "Recommended to start. The Chaser prepares messages on schedule and a partner approves them in one click." : "The Chaser sends on its day 0, 3 and 7 schedule, and stops when the document arrives."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div>
            <div className="ic-step-label">This month</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>{usage.month} of {usage.allowance} included messages</span>
              <span style={{ color: V.muted }}>{usage.today} today · limit {settings.daily_limit} a day</span>
            </div>
            <div style={{ height: 6, borderRadius: 6, background: V.gray }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: pct > 90 ? V.maroon : V.coral, transition: "width .4s" }} /></div>
            {usage.allowance > 0 && usage.month >= usage.allowance && <div style={{ fontSize: 12.5, color: V.maroon, marginTop: 6 }}>The included messages are used up. New messages are held until next month; email follow-ups keep working. Write to support@fynhelp.com to add more.</div>}
          </div>

          {st.recentFailures.length > 0 && (
            <div style={{ fontSize: 12.5, color: V.maroon }}>
              {st.recentFailures.map((f) => <div key={f.id}>Not delivered to {f.to_phone}: {f.error}</div>)}
            </div>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

/** Messages the Chaser has prepared, waiting for a partner. Renders nothing when there are none. */
export function WhatsAppApprovals({ onDone, clientId }: { onDone?: () => void; clientId?: string }) {
  const { canSignOff, clientName } = useV2();
  const { st, reload } = useWaStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const drafts = (st?.drafts ?? []).filter((d) => !clientId || d.business_id === clientId);
  if (!st || drafts.length === 0) return null;

  const run = async (key: string, ids: string[], approve: boolean) => {
    setBusy(key);
    try {
      if (approve) {
        const r = await whatsappApprove({ data: { ids } });
        if (r.sent) toast.success(`${r.sent} WhatsApp message${r.sent === 1 ? "" : "s"} sent`);
        if (r.failed || r.cancelled) toast.error(r.errors[0] ?? `${r.failed + r.cancelled} could not be sent`);
      } else {
        await whatsappDiscard({ data: { ids } });
        toast.success("Discarded");
      }
      await reload();
      onDone?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const all = drafts.map((d) => d.id);

  return (
    <div data-testid="wa-approvals" style={{ background: "#fff", border: `1px solid ${V.line}`, borderRadius: 18, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <MessageCircle size={20} color="#1F8F4E" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>{drafts.length} WhatsApp message{drafts.length === 1 ? "" : "s"} ready to send</div>
            <div style={{ fontSize: 12.5, color: V.body }}>The Chaser prepared these on schedule. Nothing goes until a partner approves.</div>
          </div>
        </div>
        {canSignOff && (
          <button className="v2-btn v2-btn-primary" disabled={!!busy} data-testid="wa-approve-all" onClick={() => void run("all", all, true)}>
            {busy === "all" ? <><span className="ic-spin" /> Sending…</> : <><Check size={15} /> Approve all</>}
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {drafts.map((d) => (
          <div key={d.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center", background: V.gray, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: V.muted }}>{d.business_id ? clientName(d.business_id) : "Client"} · to {d.to_phone} · round {d.follow_up_number}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{d.body}</div>
            </div>
            {canSignOff && (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="v2-btn v2-btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={!!busy} onClick={() => void run(d.id, [d.id], true)}>Send</button>
                <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 8px" }} aria-label="Discard" title="Discard" disabled={!!busy} onClick={() => void run(`x${d.id}`, [d.id], false)}><X size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
