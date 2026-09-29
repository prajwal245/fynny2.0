/**
 * Engagements — the scope contract per client.
 *
 * Everything downstream (which filings appear on the calendar, what the firm
 * bills, who owns the work) is supposed to come from one place. That place is
 * this table, so the page keeps scope, fee and team on a single row.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { useCAFirmMembers } from "@/hooks/useCAFirmMembers";
import { CA, CACard, CAButton, CABadge, CAField, caInputStyle, inr, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, QueueTable, StateChip, StatStrip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";
import { annualise } from "@/lib/caPractice";

interface EngagementRow {
  id: string;
  business_id: string | null;
  name: string;
  engagement_type: string;
  fee_amount: number | null;
  billing_cycle: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  partner_id: string | null;
  manager_id: string | null;
}

const TYPES = [
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "gst", label: "GST compliance" },
  { value: "tds", label: "TDS compliance" },
  { value: "audit", label: "Statutory audit" },
  { value: "advisory", label: "Advisory / virtual CFO" },
  { value: "itr", label: "Income tax return" },
  { value: "roc", label: "ROC / secretarial" },
];

const CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half yearly" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One time" },
];

const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;
const cycleLabel = (v: string | null) => CYCLES.find((c) => c.value === v)?.label ?? v ?? "—";

/** Current Indian financial year, e.g. 2026-27. */
function currentFY(): string {
  const d = new Date();
  const y = d.getUTCMonth() + 1 >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

const emptyDraft = {
  business_id: "",
  name: "",
  engagement_type: "bookkeeping",
  fee_amount: "",
  billing_cycle: "monthly",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  partner_id: "",
  manager_id: "",
};

export default function CAEngagementsPage() {
  const { firmId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();
  const { members, nameById } = useCAFirmMembers();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  const canManage = can("manage_clients");

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data, error } = await supabase
      .from("ca_engagements")
      .select("id, business_id, name, engagement_type, fee_amount, billing_cycle, start_date, end_date, status, partner_id, manager_id")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setRows((data ?? []) as EngagementRow[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameFor = (id: string | null) =>
    (id && clients.find((c) => c.business_id === id)?.client_name) || "Unknown client";

  const create = async () => {
    if (!firmId) return;
    if (!draft.business_id) return toast.error("Pick the client this engagement covers");
    if (!draft.name.trim()) return toast.error("Give the engagement a name");
    const fee = draft.fee_amount ? Number(draft.fee_amount) : null;
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return toast.error("Fee must be a positive amount");

    setBusy(true);
    const { data, error } = await supabase
      .from("ca_engagements")
      .insert({
        ca_firm_id: firmId,
        business_id: draft.business_id,
        name: draft.name.trim(),
        engagement_type: draft.engagement_type,
        fee_amount: fee,
        billing_cycle: draft.billing_cycle,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        status: "active",
        partner_id: draft.partner_id || null,
        manager_id: draft.manager_id || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);

    await logCAAudit({
      firmId,
      businessId: draft.business_id,
      entityType: "engagement",
      entityId: data.id,
      action: "engagement_created",
      actorRole: role,
      detail: { name: draft.name, type: draft.engagement_type, fee, cycle: draft.billing_cycle },
    });
    toast.success("Engagement recorded");
    setDraft({ ...emptyDraft });
    setShowForm(false);
    void load();
  };

  const setStatus = async (r: EngagementRow, next: string) => {
    const { error } = await supabase.from("ca_engagements").update({ status: next }).eq("id", r.id);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId: firmId!,
      businessId: r.business_id ?? undefined,
      entityType: "engagement",
      entityId: r.id,
      action: next === "active" ? "engagement_reactivated" : "engagement_closed",
      actorRole: role,
      detail: { from: r.status, to: next },
    });
    toast.success(next === "active" ? "Engagement reopened" : "Engagement closed");
    void load();
  };

  /** Turns scope into dated obligations using the firm's compliance calendar. */
  const generateCalendar = async (r: EngagementRow) => {
    if (!firmId || !r.business_id) return;
    const fy = window.prompt("Generate the compliance calendar for which financial year?", currentFY());
    if (!fy) return;
    setGenerating(r.id);
    const { data, error } = await supabase.rpc("generate_compliance_calendar", {
      p_business_id: r.business_id,
      p_ca_firm_id: firmId,
      p_financial_year: fy.trim(),
    });
    setGenerating(null);
    if (error) return toast.error(error.message);
    const created = Number(data ?? 0);
    await logCAAudit({
      firmId,
      businessId: r.business_id,
      entityType: "engagement",
      entityId: r.id,
      action: "compliance_calendar_generated",
      actorRole: role,
      detail: { financial_year: fy, events_created: created },
    });
    toast.success(
      created ? `${created} obligation${created > 1 ? "s" : ""} added to ${nameFor(r.business_id)}'s calendar` : "Calendar already up to date for that year",
    );
  };

  const visible = useMemo(
    () => rows.filter((r) => !statusFilter || r.status === statusFilter),
    [rows, statusFilter],
  );

  const active = rows.filter((r) => r.status === "active");
  const annualValue = active.reduce((s, r) => s + annualise(r.fee_amount, r.billing_cycle), 0);
  const covered = new Set(active.map((r) => r.business_id).filter(Boolean));
  const uncovered = clients.filter((c) => !covered.has(c.business_id)).length;
  const unassigned = active.filter((r) => !r.partner_id && !r.manager_id).length;

  if (roleLoading) return null;

  return (
    <div>
      <ModuleHeader
        title="Engagements"
        subtitle="Scope, fee and team for every client — one row per obligation the firm has actually accepted. The compliance calendar and practice analytics both read from here."
        right={
          canManage ? (
            <CAButton onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "New engagement"}</CAButton>
          ) : undefined
        }
      />

      <StatStrip
        items={[
          { label: "Active engagements", value: String(active.length) },
          { label: "Annualised fee value", value: inr(annualValue) },
          { label: "Clients without scope", value: String(uncovered), tone: uncovered ? "amber" : "green" },
          { label: "No partner or manager", value: String(unassigned), tone: unassigned ? "amber" : "green" },
        ]}
      />

      {showForm && canManage && (
        <CACard style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <CAField label="Client">
              <select
                style={caInputStyle}
                value={draft.business_id}
                onChange={(e) => setDraft({ ...draft, business_id: e.target.value })}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.business_id} value={c.business_id}>
                    {c.client_name}
                  </option>
                ))}
              </select>
            </CAField>
            <CAField label="Engagement name">
              <input
                style={caInputStyle}
                placeholder="Monthly books and GST"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </CAField>
            <CAField label="Scope">
              <select
                style={caInputStyle}
                value={draft.engagement_type}
                onChange={(e) => setDraft({ ...draft, engagement_type: e.target.value })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </CAField>
            <CAField label="Fee (₹)">
              <input
                style={caInputStyle}
                type="number"
                min={0}
                placeholder="25000"
                value={draft.fee_amount}
                onChange={(e) => setDraft({ ...draft, fee_amount: e.target.value })}
              />
            </CAField>
            <CAField label="Billed">
              <select
                style={caInputStyle}
                value={draft.billing_cycle}
                onChange={(e) => setDraft({ ...draft, billing_cycle: e.target.value })}
              >
                {CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </CAField>
            <CAField label="Starts">
              <input
                style={caInputStyle}
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </CAField>
            <CAField label="Ends (optional)">
              <input
                style={caInputStyle}
                type="date"
                value={draft.end_date}
                onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
              />
            </CAField>
            <CAField label="Engagement partner">
              <select
                style={caInputStyle}
                value={draft.partner_id}
                onChange={(e) => setDraft({ ...draft, partner_id: e.target.value })}
              >
                <option value="">Unassigned</option>
                {members
                  .filter((m) => m.userId)
                  .map((m) => (
                    <option key={m.id} value={m.userId as string}>
                      {m.label} · {m.role}
                    </option>
                  ))}
              </select>
            </CAField>
            <CAField label="Manager">
              <select
                style={caInputStyle}
                value={draft.manager_id}
                onChange={(e) => setDraft({ ...draft, manager_id: e.target.value })}
              >
                <option value="">Unassigned</option>
                {members
                  .filter((m) => m.userId)
                  .map((m) => (
                    <option key={m.id} value={m.userId as string}>
                      {m.label} · {m.role}
                    </option>
                  ))}
              </select>
            </CAField>
          </div>
          <div style={{ marginTop: 16 }}>
            <CAButton onClick={create} disabled={busy}>
              {busy ? "Saving…" : "Record engagement"}
            </CAButton>
          </div>
        </CACard>
      )}

      {!canManage && (
        <div style={{ marginBottom: 20 }}>
          <PermissionNotice permission="manage_clients" />
        </div>
      )}

      <CACard style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <select
            style={{ ...caInputStyle, maxWidth: 200 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="">All</option>
          </select>
        </div>

        <QueueTable
          columns={["Client", "Engagement", "Scope", "Fee", "Period", "Team", "Status", ""]}
          empty="No engagements recorded"
          emptyHint="Record what the firm has agreed to do for each client — the calendar and analytics read from it."
          rows={visible.map((r) => [
            nameFor(r.business_id),
            <div key="n">
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: CA.faint }}>{cycleLabel(r.billing_cycle)}</div>
            </div>,
            <CABadge key="t" tone="teal">
              {typeLabel(r.engagement_type)}
            </CABadge>,
            <div key="f" style={{ fontFamily: CA.mono }}>
              <div>{inr(r.fee_amount)}</div>
              <div style={{ fontSize: 11, color: CA.faint }}>{inr(annualise(r.fee_amount, r.billing_cycle))} / yr</div>
            </div>,
            <span key="p" style={{ fontSize: 12.5 }}>
              {dateIN(r.start_date)}
              {r.end_date ? ` → ${dateIN(r.end_date)}` : " → ongoing"}
            </span>,
            <span key="tm" style={{ fontSize: 12.5 }}>
              {r.partner_id ? nameById.get(r.partner_id) ?? "Partner" : "—"}
              {r.manager_id ? ` / ${nameById.get(r.manager_id) ?? "Manager"}` : ""}
            </span>,
            <StateChip key="s" value={r.status} />,
            canManage ? (
              <div key="a" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {r.status === "active" && (
                  <CAButton variant="ghost" onClick={() => generateCalendar(r)} disabled={generating === r.id}>
                    {generating === r.id ? "Generating…" : "Generate calendar"}
                  </CAButton>
                )}
                <CAButton variant="ghost" onClick={() => setStatus(r, r.status === "active" ? "closed" : "active")}>
                  {r.status === "active" ? "Close" : "Reopen"}
                </CAButton>
              </div>
            ) : null,
          ])}
        />
      </CACard>
    </div>
  );
}
