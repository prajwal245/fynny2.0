/**
 * Per-client reminders (Communication & Chaser OS).
 * Firm members can set a dated reminder, optionally linked to a compliance
 * event or a task, and mark it done.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CA, CACard, CAButton, CABadge, CAField, caInputStyle, caTh, caTd, CAEmpty,
} from "@/components/ca/portalUi";

interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  is_done: boolean;
  done_at: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
}

interface LinkOption {
  value: string;
  label: string;
  type: "compliance_event" | "task";
}

const dateTimeIN = (d: string) =>
  new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export default function ClientRemindersSection({
  firmId,
  businessId,
  userId,
}: {
  firmId: string;
  businessId: string;
  userId?: string | null;
}) {
  const [rows, setRows] = useState<Reminder[]>([]);
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", remind_at: "", linked: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: events }, { data: tasks }] = await Promise.all([
      supabase
        .from("ca_reminders")
        .select("id, title, notes, remind_at, is_done, done_at, linked_entity_type, linked_entity_id")
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .order("remind_at", { ascending: true }),
      supabase
        .from("ca_compliance_events")
        .select("id, event_type, filing_period, due_date")
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .order("due_date", { ascending: false })
        .limit(30),
      supabase
        .from("ca_tasks")
        .select("id, title")
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (error) toast.error(error.message);
    setRows((data as Reminder[]) ?? []);
    setLinks([
      ...((events ?? []) as { id: string; event_type: string; filing_period: string | null }[]).map((e) => ({
        value: `compliance_event:${e.id}`,
        label: `Compliance — ${e.event_type}${e.filing_period ? ` (${e.filing_period})` : ""}`,
        type: "compliance_event" as const,
      })),
      ...((tasks ?? []) as { id: string; title: string }[]).map((t) => ({
        value: `task:${t.id}`,
        label: `Task — ${t.title}`,
        type: "task" as const,
      })),
    ]);
    setLoading(false);
  }, [firmId, businessId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Give the reminder a title");
    if (!form.remind_at) return toast.error("Pick a reminder date and time");
    setSaving(true);
    const [linkType, linkId] = form.linked ? form.linked.split(":") : [null, null];
    const { error } = await supabase.from("ca_reminders").insert({
      ca_firm_id: firmId,
      business_id: businessId,
      created_by: userId ?? null,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      remind_at: new Date(form.remind_at).toISOString(),
      linked_entity_type: linkType,
      linked_entity_id: linkId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reminder set");
    setForm({ title: "", notes: "", remind_at: "", linked: "" });
    setOpen(false);
    void load();
  };

  const markDone = async (id: string) => {
    const { error } = await supabase
      .from("ca_reminders")
      .update({ is_done: true, done_at: new Date().toISOString() })
      .eq("id", id)
      .eq("ca_firm_id", firmId);
    if (error) return toast.error(error.message);
    void load();
  };

  const labelFor = (r: Reminder) => {
    if (!r.linked_entity_type || !r.linked_entity_id) return "—";
    const hit = links.find((l) => l.value === `${r.linked_entity_type}:${r.linked_entity_id}`);
    return hit?.label ?? r.linked_entity_type.replace("_", " ");
  };

  return (
    <CACard style={{ marginTop: 18, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `0.5px solid ${CA.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>Reminders</div>
        <CAButton onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Set reminder"}</CAButton>
      </div>

      {open && (
        <form onSubmit={save} style={{ padding: 18, display: "grid", gap: 14, borderBottom: `0.5px solid ${CA.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <CAField label="Title">
              <input style={caInputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Call client about GSTR-3B" />
            </CAField>
            <CAField label="Remind at">
              <input type="datetime-local" style={caInputStyle} value={form.remind_at} onChange={(e) => setForm((f) => ({ ...f, remind_at: e.target.value }))} />
            </CAField>
            <CAField label="Notes (optional)">
              <input style={caInputStyle} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </CAField>
            <CAField label="Linked to (optional)">
              <select style={caInputStyle as React.CSSProperties} value={form.linked} onChange={(e) => setForm((f) => ({ ...f, linked: e.target.value }))}>
                <option value="">None</option>
                {links.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </CAField>
          </div>
          <div><CAButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save reminder"}</CAButton></div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 20, fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading reminders…</div>
      ) : !rows.length ? (
        <CAEmpty title="No reminders for this client" hint="Set one to follow up on a call, a filing or a pending document." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Title", "Notes", "Remind at", "Status", "Linked to", ""].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = !r.is_done && new Date(r.remind_at).getTime() < Date.now();
                return (
                  <tr key={r.id}>
                    <td style={{ ...caTd, fontWeight: 600 }}>{r.title}</td>
                    <td style={{ ...caTd, color: CA.muted }}>{r.notes ?? "—"}</td>
                    <td style={caTd}>{dateTimeIN(r.remind_at)}</td>
                    <td style={caTd}>
                      <CABadge tone={r.is_done ? "green" : overdue ? "red" : "amber"}>
                        {r.is_done ? "done" : overdue ? "due" : "pending"}
                      </CABadge>
                    </td>
                    <td style={{ ...caTd, color: CA.muted }}>{labelFor(r)}</td>
                    <td style={{ ...caTd, textAlign: "right" }}>
                      {!r.is_done && <CAButton onClick={() => void markDone(r.id)}>Mark done</CAButton>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CACard>
  );
}
