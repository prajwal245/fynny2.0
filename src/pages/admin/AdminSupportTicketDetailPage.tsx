import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@/lib/router-compat";
import { ArrowLeft, Send } from "lucide-react";
import { Card } from "./AdminDashboardPage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/adminAudit";
import { LiveBadge } from "@/components/admin/LiveBadge";
import { useRealtime } from "@/hooks/useRealtime";

type Ticket = {
  id: string; ticket_number: string; subject: string; description: string | null;
  user_id: string | null; business_id: string | null;
  category: string | null; priority: string; status: string;
  assigned_to: string | null; created_at: string; updated_at: string;
};
type Reply = {
  id: string; ticket_id: string; author_id: string;
  message: string; is_internal_note: boolean; created_at: string;
};

export default function AdminSupportTicketDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const tRes = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, description, user_id, business_id, category, priority, status, assigned_to, created_at, updated_at")
      .eq("id", id).maybeSingle();
    if (tRes.error || !tRes.data) {
      toast.error("Ticket not found");
      setLoading(false); return;
    }
    const t = tRes.data as Ticket;
    setTicket(t);
    const [rRes, bRes] = await Promise.all([
      supabase.from("ticket_replies")
        .select("id, ticket_id, author_id, message, is_internal_note, created_at")
        .eq("ticket_id", id).order("created_at", { ascending: true }),
      t.business_id
        ? supabase.from("businesses").select("business_name").eq("id", t.business_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
    ]);
    setReplies((rRes.data as Reply[]) ?? []);
    setBusinessName((bRes.data as { business_name?: string } | null)?.business_name ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const liveStatus = useRealtime(
    `ticket_${id ?? "none"}_replies`,
    id ? [{ table: "ticket_replies", event: "INSERT", filter: `ticket_id=eq.${id}` }] : [],
    () => { load(); },
  );

  const updateField = async (field: "status" | "priority" | "category" | "assigned_to", value: string | null) => {
    if (!ticket) return;
    const before = (ticket as Record<string, unknown>)[field];
    const now = new Date().toISOString();
    const q = supabase.from("support_tickets");
    let error;
    if (field === "status") {
      ({ error } = await q.update({ status: value as string, updated_at: now }).eq("id", ticket.id));
    } else if (field === "priority") {
      ({ error } = await q.update({ priority: value as string, updated_at: now }).eq("id", ticket.id));
    } else if (field === "category") {
      ({ error } = await q.update({ category: value, updated_at: now }).eq("id", ticket.id));
    } else {
      ({ error } = await q.update({ assigned_to: value, updated_at: now }).eq("id", ticket.id));
    }
    if (error) { toast.error(error.message); return; }
    setTicket({ ...ticket, [field]: value, updated_at: now } as Ticket);
    await logAdminAction({
      action: `ticket_${field}_changed`,
      target_type: "support_ticket", target_id: ticket.id,
      details: { from: before, to: value },
    });
    toast.success(`Ticket ${field.replace("_", " ")} updated`);
  };

  const sendReply = async () => {
    if (!ticket || !reply.trim()) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not signed in"); setSending(false); return; }

    const { data, error } = await supabase
      .from("ticket_replies")
      .insert({
        ticket_id: ticket.id, author_id: user.id,
        message: reply.trim(), is_internal_note: internal,
      })
      .select("id, ticket_id, author_id, message, is_internal_note, created_at")
      .maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Failed to send reply"); setSending(false); return; }
    setReplies((arr) => [...arr, data as Reply]);

    // If the ticket was open and this is a public reply, move it to in_progress.
    if (!internal && ticket.status === "open") {
      await supabase
        .from("support_tickets")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", ticket.id);
      setTicket({ ...ticket, status: "in_progress" });
    }

    await logAdminAction({
      action: internal ? "ticket_internal_note_added" : "ticket_reply_sent",
      target_type: "support_ticket", target_id: ticket.id,
      details: { length: reply.length },
    });
    toast.success(internal ? "Internal note saved" : "Reply sent");
    setReply("");
    setSending(false);
  };

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "Roboto, sans-serif", color: "hsl(var(--fyn-ink) / 0.6)" }}>Loading ticket…</div>;
  }
  if (!ticket) {
    return <div style={{ padding: 24, fontFamily: "Roboto, sans-serif" }}>Ticket not found.</div>;
  }

  const userInitials = (businessName || ticket.user_id || "?").slice(0, 2).toUpperCase();
  const publicReplies = replies.filter((r) => !r.is_internal_note);
  const internalNotes = replies.filter((r) => r.is_internal_note);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <button onClick={() => nav(-1)} className="flex items-center gap-2 text-sm hover:opacity-80"
          style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, color: "hsl(var(--fyn-ink) / 0.7)" }}>
          <ArrowLeft size={16} /> Back to tickets
        </button>
        <LiveBadge status={liveStatus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <Card>
            <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "hsl(var(--fyn-ink))" }}>{ticket.ticket_number}</div>
            <div className="mt-1" style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)" }}>
              Created {new Date(ticket.created_at).toLocaleString("en-IN")}<br />Updated {new Date(ticket.updated_at).toLocaleString("en-IN")}
            </div>
            <Divider />
            <div className="flex items-center gap-3">
              <span className="grid place-items-center rounded-full text-white"
                style={{ width: 44, height: 44, background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)", fontFamily: "Raleway, sans-serif", fontWeight: 700 }}>
                {userInitials}
              </span>
              <div>
                <div style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>{businessName || "Direct user"}</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.6)" }}>{ticket.user_id?.slice(0, 8) ?? "-"}…</div>
              </div>
            </div>

            <Divider />
            <Field label="Category">
              <Select value={ticket.category ?? "other"} onChange={(v) => updateField("category", v)}
                options={[["billing","Billing"],["technical","Technical"],["feature_request","Feature"],["bug","Bug"],["other","Other"]]} />
            </Field>
            <Field label="Priority">
              <Select value={ticket.priority} onChange={(v) => updateField("priority", v)}
                options={[["low","Low"],["medium","Medium"],["high","High"],["urgent","Urgent"]]} />
            </Field>
            <Field label="Status">
              <Select value={ticket.status} onChange={(v) => updateField("status", v)}
                options={[["open","Open"],["in_progress","In Progress"],["waiting_customer","Waiting Customer"],["resolved","Resolved"],["closed","Closed"]]} />
            </Field>

            <Divider />
            <button onClick={() => updateField("status", "resolved")} className="w-full py-2 rounded-lg text-white"
              style={{ background: "#0F7B4F", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
              Mark Resolved
            </button>
            <button onClick={() => updateField("status", "closed")} className="w-full py-2 rounded-lg mt-2 text-white"
              style={{ background: "#C41E1E", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
              Close Ticket
            </button>
          </Card>
        </div>

        <div className="lg:col-span-6">
          <Card>
            <h2 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 700, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>{ticket.subject}</h2>
            {ticket.description && (
              <div className="mt-2" style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.85)", lineHeight: 1.6 }}>
                {ticket.description}
              </div>
            )}
            <Divider />
            <div className="space-y-3">
              {publicReplies.length === 0 && (
                <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.55)" }}>
                  No replies yet.
                </div>
              )}
              {publicReplies.map((m) => (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl p-3"
                    style={{ background: "rgba(244,237,218,0.7)", border: "1px solid rgba(139,105,20,0.15)" }}>
                    <div className="flex items-center justify-between gap-3 mb-1" style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.6)" }}>
                      <span style={{ fontWeight: 600, color: "hsl(var(--fyn-ink))" }}>{m.author_id.slice(0, 8)}…</span>
                      <span>{new Date(m.created_at).toLocaleString("en-IN")}</span>
                    </div>
                    <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.message}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl p-3" style={{ background: "rgba(244,237,218,0.4)", border: "1px solid rgba(139,105,20,0.15)" }}>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3}
                placeholder={`Write a reply to ${businessName || "the user"}…`}
                className="w-full bg-transparent outline-hidden resize-y"
                style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))" }} />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2" style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.7)" }}>
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  Internal note (not visible to user)
                </label>
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white"
                  style={{
                    background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
                    fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13,
                    border: "none", cursor: sending || !reply.trim() ? "not-allowed" : "pointer",
                    opacity: sending || !reply.trim() ? 0.6 : 1,
                  }}>
                  <Send size={13} /> {sending ? "Sending…" : (internal ? "Save Note" : "Send Reply")}
                </button>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card>
            <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 700, fontSize: 16, color: "hsl(var(--fyn-ink))" }}>Internal Notes</h3>
            <Divider />
            <div className="space-y-3">
              {internalNotes.length === 0 && (
                <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.55)" }}>
                  No internal notes yet. Tick "Internal note" on the reply box to add one.
                </div>
              )}
              {internalNotes.slice().reverse().map((n) => (
                <div key={n.id}>
                  <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink))", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.message}</div>
                  <div className="mt-1" style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.5)" }}>
                    {n.author_id.slice(0, 8)}…, {new Date(n.created_at).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Divider() { return <div className="my-4" style={{ height: 1, background: "rgba(23,18,8,0.08)" }} />; }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block mb-1" style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 11, color: "hsl(var(--fyn-ink) / 0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-2.5 py-2"
      style={{ border: "1px solid rgba(23,18,8,0.15)", fontFamily: "Roboto, sans-serif", fontSize: 13 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
