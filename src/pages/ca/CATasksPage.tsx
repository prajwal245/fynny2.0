/**
 * Tasks OS — every piece of work the firm owes, with an SLA clock.
 * All reads/writes hit ca_tasks; realtime keeps the board live.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { useCAFirmMembers } from "@/hooks/useCAFirmMembers";
import { CA, CACard, CAButton, CABadge, CAEmpty, caInputStyle, caTd, caTh, dateIN, type Tone } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, StatStrip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";

export type TaskTab = "all" | "mine" | "overdue" | "today";

interface TaskRow {
  id: string;
  business_id: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  due_date: string | null;
  sla_hours: number | null;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
}

const CATEGORIES = ["GST", "TDS", "ITR", "Recon", "Document", "Other"];
const PRIORITIES = ["critical", "high", "normal", "low"];
const PRIORITY_TONE: Record<string, Tone> = { critical: "red", urgent: "red", high: "amber", normal: "teal", low: "grey" };
const STATUS_TONE: Record<string, Tone> = { todo: "grey", in_progress: "teal", review: "amber", done: "green" };
/** todo → in_progress → review → done */
const NEXT_STATUS: Record<string, string | null> = { todo: "in_progress", in_progress: "review", review: "done", done: null };
const NEXT_LABEL: Record<string, string> = { todo: "Start", in_progress: "Send to review", review: "Mark done" };

const todayISO = () => new Date().toISOString().slice(0, 10);

export const isSlaBreached = (t: { sla_hours: number | null; created_at: string; status: string }) =>
  !!t.sla_hours && t.status !== "done" && Date.now() - new Date(t.created_at).getTime() > t.sla_hours * 3_600_000;

export default function CATasksPage({ initialTab = "all" }: { initialTab?: TaskTab }) {
  const { firmId, userId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();
  const { members } = useCAFirmMembers();

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [tab, setTab] = useState<TaskTab>(initialTab);
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    business_id: "",
    title: "",
    category: "GST",
    priority: "normal",
    assigned_to: "",
    due_date: "",
    sla_hours: "48",
    description: "",
  });

  const load = useCallback(async () => {
    if (!firmId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_tasks")
      .select("id, business_id, title, description, category, priority, status, due_date, sla_hours, assigned_to, created_at, completed_at")
      .eq("ca_firm_id", firmId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) toast.error(error.message);
    const taskRows = (data ?? []) as TaskRow[];
    setRows(taskRows);
    console.log(`[fyn:tasks] tasks page loaded — ${taskRows.length} tasks`);
    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!firmId) return;
    const channel = supabase
      .channel(`ca-tasks-${firmId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ca_tasks", filter: `ca_firm_id=eq.${firmId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [firmId, load]);

  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.business_id === id)?.client_name ?? "Unknown client" : "Firm-wide";
  const assigneeName = (id: string | null) =>
    id ? members.find((m) => m.userId === id)?.label ?? (id === userId ? "You" : "Team member") : "Unassigned";

  const buckets = useMemo(() => {
    const today = todayISO();
    const openRows = rows.filter((t) => t.status !== "done");
    return {
      all: rows,
      mine: rows.filter((t) => t.assigned_to && t.assigned_to === userId),
      overdue: openRows.filter((t) => t.due_date && t.due_date < today),
      today: openRows.filter((t) => t.due_date === today),
      open: openRows,
      breached: openRows.filter(isSlaBreached),
    };
  }, [rows, userId]);

  const create = async () => {
    if (!firmId) return;
    if (!form.title.trim()) return toast.error("Give the task a title");
    setBusy(true);
    const { data, error } = await supabase
      .from("ca_tasks")
      .insert({
        ca_firm_id: firmId,
        business_id: form.business_id || null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        priority: form.priority,
        status: "todo",
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
        sla_hours: form.sla_hours ? Number(form.sla_hours) : null,
        created_by: userId,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could not create task");
    await logCAAudit({
      firmId,
      businessId: form.business_id || null,
      entityType: "task",
      entityId: data.id,
      action: "task_created",
      actorRole: role,
      detail: { title: form.title, category: form.category, priority: form.priority },
    });
    toast.success("Task created");
    setOpen(false);
    setForm({ business_id: "", title: "", category: "GST", priority: "normal", assigned_to: "", due_date: "", sla_hours: "48", description: "" });
    void load();
  };

  const advance = async (t: TaskRow) => {
    const next = NEXT_STATUS[t.status] ?? "in_progress";
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("ca_tasks")
      .update({
        status: next,
        updated_at: nowIso,
        completed_at: next === "done" ? nowIso : null,
      })
      .eq("id", t.id)
      .eq("ca_firm_id", firmId ?? "");
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId: firmId!,
      businessId: t.business_id,
      entityType: "task",
      entityId: t.id,
      action: next === "done" ? "task_complete" : `task_${next}`,
      actorRole: role,
      detail: { from: t.status, to: next, title: t.title },
    });
    toast.success(next === "done" ? "Task completed" : `Moved to ${next.replace("_", " ")}`);
    void load();
  };

  const assignToMe = async (t: TaskRow) => {
    const { error } = await supabase
      .from("ca_tasks")
      .update({ assigned_to: userId, updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("ca_firm_id", firmId ?? "");
    if (error) return toast.error(error.message);
    void load();
  };

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Tasks" subtitle="Work allocated across the team." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  const tabs: { key: TaskTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: buckets.all.length },
    { key: "mine", label: "Mine", count: buckets.mine.length },
    { key: "overdue", label: "Overdue", count: buckets.overdue.length },
    { key: "today", label: "Due today", count: buckets.today.length },
  ];

  const visible = buckets[tab].filter((t) => {
    if (clientFilter !== "all" && (t.business_id ?? "") !== clientFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <ModuleHeader
        title="Tasks"
        subtitle="Everything the firm owes a client or itself, with a due date and an SLA clock running against it."
        right={<CAButton onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "New task"}</CAButton>}
      />

      <StatStrip
        items={[
          { label: "Open", value: String(buckets.open.length) },
          { label: "Overdue", value: String(buckets.overdue.length), tone: buckets.overdue.length ? "red" : "green" },
          { label: "SLA breached", value: String(buckets.breached.length), tone: buckets.breached.length ? "amber" : "green" },
          { label: "Due today", value: String(buckets.today.length) },
        ]}
      />

      {open && (
        <CACard style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <select style={caInputStyle} value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })}>
              <option value="">Firm-wide (no client)</option>
              {clients.map((c) => (
                <option key={c.business_id} value={c.business_id}>{c.client_name}</option>
              ))}
            </select>
            <input style={caInputStyle} placeholder="What needs doing?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select style={caInputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={caInputStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={caInputStyle} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Unassigned</option>
              {members.filter((m) => m.userId).map((m) => (
                <option key={m.id} value={m.userId as string}>{m.label} · {m.role}</option>
              ))}
            </select>
            <input style={caInputStyle} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <input style={caInputStyle} type="number" min={1} placeholder="SLA hours (optional)" value={form.sla_hours} onChange={(e) => setForm({ ...form, sla_hours: e.target.value })} />
            <input style={caInputStyle} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ marginTop: 14 }}>
            <CAButton onClick={() => void create()} disabled={busy}>{busy ? "Creating…" : "Create task"}</CAButton>
          </div>
        </CACard>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: CA.sans, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999, cursor: "pointer",
              border: `0.5px solid ${tab === t.key ? CA.teal : CA.line}`,
              background: tab === t.key ? CA.tealSoft : "#fff",
              color: tab === t.key ? CA.teal : CA.muted,
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
        <select
          style={{ ...caInputStyle, maxWidth: 220, marginLeft: 6 }}
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="all">All clients</option>
          <option value="">Firm-wide (no client)</option>
          {clients.map((c) => (
            <option key={c.business_id} value={c.business_id}>{c.client_name}</option>
          ))}
        </select>
        <select
          style={{ ...caInputStyle, maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="todo">Open</option>
          <option value="in_progress">In progress</option>
          <option value="review">In review</option>
          <option value="done">Done</option>
        </select>
      </div>

      <CACard style={{ padding: visible.length ? 0 : 24, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24, fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading tasks…</div>
        ) : !visible.length ? (
          <CAEmpty
            title={tab === "all" ? "No tasks yet" : "Nothing in this view"}
            hint={tab === "all" ? "Create the first task to start tracking work and SLAs." : "Switch tabs or create a new task."}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Priority", "Client", "Task", "Category", "Assignee", "Due", "SLA", "Status", ""].map((h) => (
                    <th key={h} style={caTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const breached = isSlaBreached(t);
                  const overdue = !!t.due_date && t.status !== "done" && t.due_date < todayISO();
                  return (
                    <tr key={t.id}>
                      <td style={caTd}><CABadge tone={PRIORITY_TONE[t.priority] ?? "grey"}>{t.priority}</CABadge></td>
                      <td style={caTd}>{clientName(t.business_id)}</td>
                      <td style={{ ...caTd, fontWeight: 600 }}>
                        {t.title}
                        {t.description ? <div style={{ fontSize: 12, color: CA.muted, fontWeight: 400 }}>{t.description}</div> : null}
                      </td>
                      <td style={caTd}>{t.category}</td>
                      <td style={caTd}>{assigneeName(t.assigned_to)}</td>
                      <td style={{ ...caTd, color: overdue ? CA.red : CA.ink, fontWeight: overdue ? 700 : 400 }}>{dateIN(t.due_date)}</td>
                      <td style={caTd}>
                        {!t.sla_hours ? (
                          <span style={{ color: CA.faint }}>—</span>
                        ) : breached ? (
                          <span style={{ color: CA.red, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.04em" }}>SLA BREACHED</span>
                        ) : (
                          <span style={{ color: CA.green, fontWeight: 600, fontSize: 12 }}>On time · {t.sla_hours}h</span>
                        )}
                      </td>
                      <td style={caTd}><CABadge tone={STATUS_TONE[t.status] ?? "grey"}>{t.status.replace("_", " ")}</CABadge></td>
                      <td style={{ ...caTd, textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", gap: 8 }}>
                          {!t.assigned_to && (
                            <CAButton variant="ghost" onClick={() => void assignToMe(t)}>Assign to me</CAButton>
                          )}
                          {t.status !== "done" && (
                            <CAButton onClick={() => void advance(t)}>{NEXT_LABEL[t.status] ?? "Start"}</CAButton>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CACard>
    </div>
  );
}
