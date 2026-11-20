import { Check, ClipboardCopy, Globe, Mail, MessageCircle, Send, UserRound } from "lucide-react";
import { Segmented, V } from "../../ui";
import { HOLDER_LABEL, type InputDef, type Plan } from "@/lib/practice/readiness/model";

export type Channel = "whatsapp" | "email" | "both";

const CSS = `
.rq { display:grid; gap:18px; }
.rq h4 { margin:0 0 8px; font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:${V.muted}; font-weight:700; }
.rq-msg { width:100%; min-height:340px; resize:vertical; border:1px solid ${V.line}; border-radius:16px; padding:16px 18px; font:inherit; font-size:13.5px; line-height:1.6; color:${V.ink}; background:${V.card}; box-shadow: inset 0 1px 2px rgba(20,18,16,.04); }
.rq-msg:focus { outline:2px solid rgba(217,43,43,.35); outline-offset:1px; }
.rq-task { display:grid; grid-template-columns: 30px 1fr; gap:12px; padding:12px 14px; border-radius:14px; background:${V.gray}; border:1px solid ${V.line}; }
.rq-task b { font-size:13.5px; font-weight:600; color:${V.ink}; display:block; } .rq-task small { color:${V.muted}; font-size:12px; line-height:1.5; display:block; margin-top:2px; }
.rq-path { margin-top:6px; display:inline-block; padding:3px 9px; border-radius:8px; background:${V.card}; border:1px solid ${V.line}; font-family:${V.mono}; font-size:11.5px; color:${V.body}; }
.rq-ico { width:30px; height:30px; border-radius:10px; background:${V.cream}; color:${V.maroon}; display:grid; place-items:center; }
.rq-foot { margin-top:6px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; position:sticky; bottom:0; padding:14px 0 2px; background:linear-gradient(180deg, transparent, ${V.card} 30%); }
.rq-send { border:0; cursor:pointer; font:inherit; font-size:14px; font-weight:650; color:#fff; padding:12px 20px; border-radius:999px; display:inline-flex; gap:8px; align-items:center; background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); box-shadow:0 12px 24px -14px var(--v2-brand); }
.rq-send:disabled { opacity:.55; cursor:default; }
.rq-ghost { border:1px solid ${V.line}; background:${V.card}; cursor:pointer; font:inherit; font-size:13.5px; font-weight:600; color:${V.ink}; padding:11px 16px; border-radius:999px; display:inline-flex; gap:8px; align-items:center; }
.rq-who { display:flex; gap:8px; align-items:center; padding:10px 14px; border-radius:14px; background:var(--v2-good-bg); color:${V.green}; font-size:13px; font-weight:600; }
`;

export default function RequestPanel(p: {
  client: string; plan: Plan; message: string; onMessage: (m: string) => void; channel: Channel; onChannel: (c: Channel) => void;
  onSend: () => void; onCopy: () => void; sending?: boolean; sent?: boolean; reachable: string;
}) {
  const item = (i: InputDef) => (
    <div className="rq-task" key={i.key}>
      <span className="rq-ico"><Globe size={15} /></span>
      <div><b>{i.label}</b><small><span className="rq-path" style={{ marginTop: 0, marginRight: 6 }}>{HOLDER_LABEL[i.holder]}</span>{i.how.replace(/^[^:]*: /, "")}</small></div>
    </div>
  );
  return (
    <div className="rq" data-testid="request-panel">
      <style>{CSS}</style>
      <div>
        <h4>To {p.client}</h4>
        <div className="rq-who"><UserRound size={15} /> {p.reachable}</div>
      </div>
      <div>
        <h4>Channel</h4>
        <Segmented label="Channel" value={p.channel} onChange={p.onChannel} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "both", label: "Both" }]} />
      </div>
      <div>
        <h4>Message, ready to send</h4>
        <textarea className="rq-msg" aria-label="Message to the client" value={p.message} onChange={(e) => p.onMessage(e.target.value)} />
        <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>Files they upload through the link are read and tick off the list by themselves.</div>
      </div>
      {p.plan.firmTasks.length > 0 && (
        <div>
          <h4>For your team to download ({p.plan.firmTasks.length})</h4>
          <div style={{ display: "grid", gap: 8 }}>{p.plan.firmTasks.map(item)}</div>
        </div>
      )}
      {p.plan.partyRequests.length > 0 && (
        <div>
          <h4>To ask the parties for</h4>
          <div style={{ display: "grid", gap: 8 }}>{p.plan.partyRequests.map(item)}</div>
        </div>
      )}
      <div className="rq-foot">
        <button className="rq-send" onClick={p.onSend} disabled={p.sending || p.sent} data-testid="rq-send">{p.sent ? <><Check size={16} /> Sent</> : <><Send size={16} /> {p.sending ? "Sending…" : "Send to client"}</>}</button>
        <button className="rq-ghost" onClick={p.onCopy}><ClipboardCopy size={15} /> Copy</button>
        <span style={{ fontSize: 12, color: V.muted, display: "inline-flex", gap: 6, alignItems: "center" }}>{p.channel !== "email" ? <MessageCircle size={13} /> : <Mail size={13} />} Follow-ups continue until it arrives.</span>
      </div>
    </div>
  );
}
