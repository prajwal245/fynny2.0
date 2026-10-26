import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Plus, MessageCircle, Mail, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBilling } from "../lib/billing";
import { getPracticeWhatsappStatus } from "@/lib/practice/practice.functions";
import { Badge, Card, Drawer, EmptyState, Modal, PageHeader, Tone, V, formatDate } from "../ui";
import { AgentGlyph, AgentStatusBadge, AgentTimeline, ShimmerText } from "../agents";
import { Chase, useV2 } from "../store";
import { CreditsAlert, CreditsChip, TopUpModal } from "../components/CreditsPanel";
import { WhatsAppIcon } from "../components/BrandIcons";
import { WhatsappPreview } from "../components/WhatsappPreview";

type Channel = NonNullable<Chase["channel"]>;
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "email", label: "Email", hint: "Free. Day 0, 3, 7 and 10." },
  { key: "whatsapp", label: "WhatsApp", hint: "1 credit per reminder from FynHelp's number." },
  { key: "both", label: "Email + WhatsApp", hint: "Both on every reminder. WhatsApp uses 1 credit." },
];
const channelLabel = (c: Chase["channel"]) => (c === "whatsapp" ? "WhatsApp" : c === "both" ? "Email + WhatsApp" : "Email");

const TONE: Record<Chase["status"], Tone> = { Open: "info", "Following Up": "warn", Escalated: "bad", Resolved: "good" };
const TYPES = ["Missing bank statement", "Missing invoice", "Overdue receivable", "GST confirmation", "Custom"];
const FILTERS = ["All", "Open", "Following Up", "Escalated", "Resolved"] as const;

/** Chaser. All follow-ups as a page; the client's Chaser tab when given a clientId. */
export default function ChaserPage({ clientId: scopedClient }: { clientId?: string } = {}) {
  const { firm, chases: allChases, clients, clientName, addChase, sendFollowUp, setChaseStatus, snoozeChase, runs } = useV2();
  // WhatsApp chasing is on every plan and the trial; each reminder from FynHelp's number uses a credit.
  const whatsappAllowed = useBilling()?.access.whatsappChaser ?? false;
  const [topUp, setTopUp] = useState(false);
  // With a token and a linked number the message goes out itself; otherwise WhatsApp opens with it ready.
  const [waSendReady, setWaSendReady] = useState(false);
  useEffect(() => {
    void getPracticeWhatsappStatus().then((s) => setWaSendReady(Boolean(s.send_ready))).catch(() => setWaSendReady(false));
  }, []);
  const chases = scopedClient ? allChases.filter((c) => c.clientId === scopedClient) : allChases;
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [promise, setPromise] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [form, setForm] = useState({ clientId: scopedClient ?? clients[0]?.id ?? "", type: TYPES[0], contact: "", email: "", phone: "", due: "", note: "", channel: "email" as Channel });
  // Chases go by email: start from the client's saved contact, editable.
  const forClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    return { clientId: id, contact: c?.contactName || c?.name || "", email: c?.email ?? "", phone: c?.phone ?? "", due };
  };
  const openCreate = () => {
    setForm((f) => ({ ...f, type: TYPES[0], note: "", channel: "email" as Channel, ...forClient(f.clientId || scopedClient || clients[0]?.id || "") }));
    setCreating(true);
  };

  const active = chases.find((c) => c.id === openId) ?? null;
  const rank: Record<Chase["status"], number> = { Escalated: 0, "Following Up": 1, Open: 2, Resolved: 3 };
  // Escalated items first: they need a person today.
  const list = chases.filter((c) => filter === "All" || c.status === filter).sort((a, b) => rank[a.status] - rank[b.status]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.contact.trim()) return;
    if (form.channel !== "whatsapp" && !form.email.trim()) {
      toast.error(form.channel === "both" ? "Add the client's email, or choose WhatsApp only." : "Add the client's email, or choose WhatsApp.");
      return;
    }
    if (form.channel !== "email" && !form.phone.trim()) {
      toast.error("Add the client's WhatsApp number, with country code, or choose Email.");
      return;
    }
    addChase(form);
    setCreating(false);
    toast.success("Chase item created. Status is Open.");
  };

  const message = (c: Chase) =>
    `Hello ${c.contact}, a gentle reminder from your accounts team regarding ${c.type.toLowerCase()} for ${clientName(c.clientId)}. Whenever convenient, could you please share it. Thank you.`;

  const waLink = (c: Chase) => `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message(c))}`;

  return (
    <>
      {scopedClient ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button className="v2-btn v2-btn-primary" onClick={openCreate}><Plus size={15} /> Create chase item</button>
        </div>
      ) : (
        <PageHeader
        title="Chaser"
        subtitle="Polite follow ups on day 0, 3 and 7, tracked to closure. On day 10 it comes to you."
        action={<button className="v2-btn v2-btn-primary" onClick={openCreate}><Plus size={15} /> Create chase item</button>}
      />
      )}

      <CreditsAlert onAdd={() => setTopUp(true)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className="v2-btn"
            onClick={() => setFilter(f)}
            style={{ background: filter === f ? V.ink : V.card, color: filter === f ? "#fff" : V.body, borderColor: filter === f ? V.ink : V.line, padding: "8px 15px", fontSize: 12.5 }}
          >
            {f}
            <span style={{ opacity: 0.6 }}>{f === "All" ? chases.length : chases.filter((c) => c.status === f).length}</span>
          </button>
        ))}
        <span style={{ marginLeft: "auto" }}><CreditsChip onAdd={() => setTopUp(true)} /></span>
      </div>
      <TopUpModal open={topUp} onClose={() => setTopUp(false)} />

      {list.length === 0 ? (
        <EmptyState
          icon={<Send size={22} />}
          title="Nothing to chase"
          description="Create a chase item when a client still owes you a statement, a bill or a confirmation."
          action={<button className="v2-btn v2-btn-primary" onClick={openCreate}><Plus size={15} /> Create chase item</button>}
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <AnimatePresence initial={false}>
            {list.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.3 }}
              >
                <Card
                  hover
                  onClick={() => setOpenId(c.id)}
                  style={{
                    cursor: "pointer",
                    borderColor: c.status === "Escalated" ? "rgba(169,56,56,.4)" : V.line,
                    background: c.status === "Escalated" ? "rgba(169,56,56,.03)" : V.card,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.type}</div>
                      <div style={{ fontSize: 12.5, color: V.body, marginTop: 4 }}>
                        {clientName(c.clientId)} · {c.contact} · due {formatDate(c.due)} · {c.followUps} follow {c.followUps === 1 ? "up" : "ups"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {c.status !== "Resolved" && c.channel && <Badge tone={c.channel === "email" ? "neutral" : "good"}>{channelLabel(c.channel)}</Badge>}
                      {c.status !== "Resolved" && <AgentStatusBadge agent="chaser" active={c.status === "Following Up"} label="Chaser" />}
                      <Badge tone={TONE[c.status]}>{c.status}</Badge>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create chase item">
        <form onSubmit={create} style={{ display: "grid", gap: 14 }}>
          <div>
            <label className="v2-label">Client</label>
            <select className="v2-input" value={form.clientId} onChange={(e) => setForm({ ...form, ...forClient(e.target.value) })}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="v2-label">Type</label>
            <select className="v2-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="v2-label">How should the Chaser reach them?</label>
            <div role="radiogroup" aria-label="Channel" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(min(150px, 100%), 1fr))" }} data-testid="chase-channel">
              {CHANNELS.map((ch) => {
                const on = form.channel === ch.key;
                const locked = ch.key !== "email" && !whatsappAllowed;
                return (
                  <button
                    key={ch.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={locked}
                    onClick={() => setForm({ ...form, channel: ch.key })}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${on ? V.coral : V.line}`, background: on ? V.blue : V.card, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.5 : 1, font: "inherit", display: "grid", gap: 2 }}
                  >
                    <span style={{ fontWeight: 650, fontSize: 13.5, display: "flex", gap: 6, alignItems: "center" }}>
                      {ch.key === "email" ? <Mail size={15} /> : <WhatsAppIcon size={16} />}
                      {ch.key === "both" && <Mail size={15} />} {ch.label}
                    </span>
                    <span style={{ fontSize: 11.5, color: V.muted, lineHeight: 1.4 }}>{ch.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {form.channel !== "email" && (
            <WhatsappPreview clientName={clients.find((c) => c.id === form.clientId)?.name ?? "your client"} contact={form.contact} item={form.type} firmName={firm?.name ?? "Your firm"} />
          )}
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
            <div>
              <label className="v2-label" htmlFor="chase-contact">Contact name</label>
              <input id="chase-contact" className="v2-input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} required />
            </div>
            <div>
              <label className="v2-label" htmlFor="chase-email">Email{form.channel === "whatsapp" ? " · not used" : " · follow-ups go here"}</label>
              <input id="chase-email" className="v2-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="The client's email" />
            </div>
          </div>
          <div>
            <label className="v2-label" htmlFor="chase-phone">WhatsApp number{form.channel === "email" ? " · optional" : " · required"}</label>
            <input id="chase-phone" className="v2-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="With country code" inputMode="tel" />
          </div>
          <div>
            <label className="v2-label">Due date</label>
            <input className="v2-input" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} required />
          </div>
          <div>
            <label className="v2-label">Note</label>
            <textarea className="v2-input" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="v2-btn v2-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="v2-btn v2-btn-primary">Create</button>
          </div>
        </form>
      </Modal>

      <Drawer open={!!active} onClose={() => setOpenId(null)} title={active?.type ?? ""}>
        {active && (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone={TONE[active.status]}>{active.status}</Badge>
              <Badge>{clientName(active.clientId)}</Badge>
              <Badge>Due {formatDate(active.due)}</Badge>
              {active.channel && <Badge tone={active.channel === "email" ? "neutral" : "good"}>Reaches them by {channelLabel(active.channel)}</Badge>}
            </div>
            {active.note && <p style={{ fontSize: 13.5, color: V.body, lineHeight: 1.6, margin: 0 }}>{active.note}</p>}

            {active.status === "Escalated" && (
              <div style={{ background: "rgba(169,56,56,.07)", border: "1px solid rgba(169,56,56,.25)", borderRadius: 14, padding: 14, fontSize: 13, color: V.maroon }}>
                The follow ups went unanswered. This item is with the partner now.
              </div>
            )}

            <div>
              <label className="v2-label">Message the client receives</label>
              <div style={{ background: V.gray, borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.6 }}>{message(active)}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                {active.phone && active.status !== "Resolved" && !whatsappAllowed && (
                  <Link to="/app/settings" hash="billing" className="v2-btn v2-btn-ghost" title="WhatsApp reminders are paused until you choose a plan" data-testid="whatsapp-locked">
                    <Lock size={14} /> Choose a plan for WhatsApp
                  </Link>
                )}
                {active.phone && active.status !== "Resolved" && whatsappAllowed && waSendReady && (
                  <button className="v2-btn v2-btn-primary" onClick={() => { sendFollowUp(active.id, "WhatsApp"); }}>
                    <MessageCircle size={15} /> Send WhatsApp
                  </button>
                )}
                {active.phone && active.status !== "Resolved" && whatsappAllowed && !waSendReady && (
                  <a
                    className="v2-btn v2-btn-primary"
                    href={waLink(active)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => { sendFollowUp(active.id, "WhatsApp"); }}
                  >
                    <MessageCircle size={15} /> Open WhatsApp
                  </a>
                )}
                {active.status !== "Resolved" && (() => {
                  const sending = runs.some((r) => r.agent === "chaser" && r.target === active.id && r.status === "running");
                  return (
                    <button className="v2-btn v2-btn-ghost" disabled={sending} data-working={sending} onClick={() => { sendFollowUp(active.id, "Email"); }}>
                      {sending ? <AgentGlyph agent="chaser" state="running" size={20} /> : <Mail size={15} />}
                      {sending ? <ShimmerText text="Chaser is sending follow-up…" agent="chaser" /> : " Send email follow up"}
                    </button>
                  );
                })()}
              </div>
            </div>

            <div>
              <label className="v2-label">Activity</label>
              <AgentTimeline items={active.timeline.map((t) => ({ ...t, at: formatDate(t.at) }))} />
            </div>

            {active.status === "Resolved" ? (
              <div style={{ fontSize: 13, color: V.green }}>Resolved. The Chaser agent has stopped for this item.</div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="v2-btn v2-btn-primary" onClick={() => { setChaseStatus(active.id, "Resolved", "Document received. Chase closed."); toast.success("Chase resolved. Follow-ups have stopped."); }}>Mark resolved</button>
                {active.status !== "Escalated" && (
                  <button className="v2-btn v2-btn-ghost" onClick={() => { setChaseStatus(active.id, "Escalated", "Escalated to the partner by the team."); toast.success("Escalated to the partner. Automatic follow-ups have stopped."); }}>Escalate to partner</button>
                )}
              </div>
              {active.status !== "Escalated" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="v2-label" htmlFor="chase-promise" style={{ margin: 0 }}>Client promised it by</label>
                  <input
                    id="chase-promise" className="v2-input" type="date" style={{ width: 170 }}
                    min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)}
                    value={promise} onChange={(e) => setPromise(e.target.value)}
                  />
                  <button
                    className="v2-btn v2-btn-ghost" disabled={!promise}
                    onClick={() => { snoozeChase(active.id, promise); setPromise(""); }}
                  >
                    Pause until then
                  </button>
                </div>
              )}
              <div style={{ fontSize: 12.5, color: V.muted }}>
                The chase stops automatically when the document arrives, on any channel. Emails go out between 9:30 am and 6:30 pm IST, Monday to Saturday.
              </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
