import { useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Plus, MessageCircle, Mail } from "lucide-react";
import { Badge, Card, Drawer, EmptyState, Modal, PageHeader, Tone, V, formatDate } from "../ui";
import { AgentStatusBadge, AgentTimeline } from "../agents";
import { Chase, useV2 } from "../store";

const TONE: Record<Chase["status"], Tone> = { Open: "info", "Following Up": "warn", Escalated: "bad", Resolved: "good" };
const TYPES = ["Missing bank statement", "Missing invoice", "Overdue receivable", "GST confirmation", "Custom"];
const FILTERS = ["All", "Open", "Following Up", "Escalated", "Resolved"] as const;

/** Chaser. All follow-ups as a page; the client's Chaser tab when given a clientId. */
export default function ChaserPage({ clientId: scopedClient }: { clientId?: string } = {}) {
  const { chases: allChases, clients, clientName, addChase, sendFollowUp, setChaseStatus } = useV2();
  const chases = scopedClient ? allChases.filter((c) => c.clientId === scopedClient) : allChases;
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [form, setForm] = useState({ clientId: scopedClient ?? clients[0]?.id ?? "", type: TYPES[0], contact: "", phone: "", due: "", note: "" });

  const active = chases.find((c) => c.id === openId) ?? null;
  const rank: Record<Chase["status"], number> = { Escalated: 0, "Following Up": 1, Open: 2, Resolved: 3 };
  // Escalated items first: they need a person today.
  const list = chases.filter((c) => filter === "All" || c.status === filter).sort((a, b) => rank[a.status] - rank[b.status]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.contact.trim()) return;
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
          <button className="v2-btn v2-btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Create chase item</button>
        </div>
      ) : (
        <PageHeader
        title="Chaser"
        subtitle="Polite follow ups, tracked to closure. Two unanswered nudges and it escalates."
        action={<button className="v2-btn v2-btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Create chase item</button>}
      />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
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
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Send size={22} />}
          title="Nothing to chase"
          description="Create a chase item when a client still owes you a statement, a bill or a confirmation."
          action={<button className="v2-btn v2-btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Create chase item</button>}
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
            <select className="v2-input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="v2-label">Type</label>
            <select className="v2-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <div>
              <label className="v2-label">Contact</label>
              <input className="v2-input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} required />
            </div>
            <div>
              <label className="v2-label">Phone</label>
              <input className="v2-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="919820011223" />
            </div>
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
            </div>
            {active.note && <p style={{ fontSize: 13.5, color: V.body, lineHeight: 1.6, margin: 0 }}>{active.note}</p>}

            {active.status === "Escalated" && (
              <div style={{ background: "rgba(169,56,56,.07)", border: "1px solid rgba(169,56,56,.25)", borderRadius: 14, padding: 14, fontSize: 13, color: V.maroon }}>
                Two follow ups went unanswered. This item is with the partner now.
              </div>
            )}

            <div>
              <label className="v2-label">Message the client receives</label>
              <div style={{ background: V.gray, borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.6 }}>{message(active)}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                {active.phone && active.status !== "Resolved" && (
                  <a
                    className="v2-btn v2-btn-primary"
                    href={waLink(active)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => { sendFollowUp(active.id, "WhatsApp"); }}
                  >
                    <MessageCircle size={15} /> Send WhatsApp
                  </a>
                )}
                {active.status !== "Resolved" && (
                  <button className="v2-btn v2-btn-ghost" onClick={() => { sendFollowUp(active.id, "Email"); }}>
                    <Mail size={15} /> Send email follow up
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="v2-label">Activity</label>
              <AgentTimeline items={active.timeline.map((t) => ({ ...t, at: formatDate(t.at) }))} />
            </div>

            {active.status === "Resolved" ? (
              <div style={{ fontSize: 13, color: V.green }}>Resolved. The Chaser agent has stopped for this item.</div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="v2-btn v2-btn-primary" onClick={() => { setChaseStatus(active.id, "Resolved", "Document received. Chase closed."); toast.success("Chase resolved"); }}>Mark resolved</button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
