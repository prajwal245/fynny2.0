import { Check, Globe, Mail, MessageCircle, Send } from "lucide-react";
import { Segmented, V } from "../../ui";
import { HOLDER_LABEL, type InputDef, type Plan } from "@/lib/practice/readiness/model";
import { Field, FormSection, Kit, PanelFooter, StatusPill } from "../kit/Kit";

export type Channel = "whatsapp" | "email" | "both";

/**
 * The request as a form, in the layout every form in the product uses: sections with an accent bar, labelled fields, a sticky footer.
 * Section 1 is who and how, section 2 the message, section 3 what the team downloads themselves.
 */
export default function RequestPanel(p: {
  client: string; plan: Plan; message: string; onMessage: (m: string) => void; channel: Channel; onChannel: (c: Channel) => void;
  onSend: () => void; onCancel?: () => void; sending?: boolean; sent?: boolean; reachable: string;
}) {
  const task = (i: InputDef) => (
    <div key={i.key} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, alignItems: "start" }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: V.cream, color: V.maroon, display: "grid", placeItems: "center" }}><Globe size={14} /></span>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink }}>{i.label} <StatusPill tone="neutral">{HOLDER_LABEL[i.holder]}</StatusPill></div>
        <div style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.5, marginTop: 2 }}>{i.how.replace(/^[^:]*: /, "")}</div>
      </div>
    </div>
  );
  return (
    <div data-testid="request-panel" style={{ display: "grid", gap: 14 }}>
      <Kit />
      <FormSection title="Recipient">
        <Field label="Client" required><input className="kt-in" value={p.client} readOnly aria-label="Client" /></Field>
        <Field label="Sent to" hint={p.channel === "email" ? "The email saved for this client." : "The WhatsApp number saved for this client."}>
          <input className="kt-in" value={p.reachable} readOnly aria-label="Sent to" />
        </Field>
        <Field label="Channel" required>
          <Segmented label="Channel" value={p.channel} onChange={p.onChannel} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "both", label: "Both" }]} />
        </Field>
      </FormSection>

      <FormSection title="Message">
        <Field label="What the client will read" required hint="The secure upload link is added when it is sent. Files uploaded through it are read and tick off the list by themselves.">
          <textarea className="kt-in" style={{ minHeight: 300 }} aria-label="Message to the client" value={p.message} onChange={(e) => p.onMessage(e.target.value)} />
        </Field>
      </FormSection>

      {(p.plan.firmTasks.length > 0 || p.plan.partyRequests.length > 0) && (
        <FormSection title={`For your team (${p.plan.firmTasks.length + p.plan.partyRequests.length})`}>
          {p.plan.firmTasks.length > 0 && <div style={{ display: "grid", gap: 14 }}>{p.plan.firmTasks.map(task)}</div>}
          {p.plan.partyRequests.length > 0 && <div style={{ display: "grid", gap: 14 }}><div style={{ fontSize: 11.5, letterSpacing: ".1em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Ask the parties</div>{p.plan.partyRequests.map(task)}</div>}
        </FormSection>
      )}

      <PanelFooter
        onCancel={p.onCancel ?? (() => undefined)} onPrimary={p.onSend} busy={p.sending} disabled={p.sent}
        primary={p.sent ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Check size={16} /> Sent</span> : <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Send size={16} /> {p.sending ? "Sending…" : "Send to client"}</span>}
      />
      <div style={{ fontSize: 12, color: V.muted, display: "flex", gap: 6, alignItems: "center", marginTop: -6 }}>{p.channel !== "email" ? <MessageCircle size={13} /> : <Mail size={13} />} Follow-ups continue until it arrives.</div>
    </div>
  );
}
