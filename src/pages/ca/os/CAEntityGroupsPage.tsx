/**
 * Entity Groups — parent/subsidiary structures, consolidated view and
 * inter-entity transactions with elimination tracking.
 * Everything is read from real rows; consolidation sums the members' own
 * bank transactions and nets off recorded inter-entity amounts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { logCAAudit } from "@/lib/caAudit";
import { periodBounds } from "@/lib/caFinIntel.server";
import { CA, CACard, CAButton, CABadge, CAEmpty, CAField, caInputStyle, caTh, caTd, inr, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, StatStrip } from "@/components/ca/os/primitives";

interface Group { id: string; name: string; parent_business_id: string | null; notes: string | null }
interface Member { business_id: string; client_name: string; group_id: string | null; ownership_pct: number | null }
interface Ietxn {
  id: string; from_business_id: string; to_business_id: string; txn_date: string;
  amount: number; nature: string; description: string | null; elimination_status: string;
}

export default function CAEntityGroupsPage() {
  const { firmId, userId } = useCAPortal();
  const { can } = useCARole();
  const { clients } = useCAClientOptions();
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [groupId, setGroupId] = useState("");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [ietxns, setIetxns] = useState<Ietxn[]>([]);
  const [totals, setTotals] = useState<Record<string, { credit: number; debit: number }>>({});
  const [newGroup, setNewGroup] = useState("");
  const [ieForm, setIeForm] = useState({ from: "", to: "", amount: "", nature: "sale", txn_date: new Date().toISOString().slice(0, 10), description: "" });
  const editable = can("manage_clients");

  const loadGroups = useCallback(async () => {
    if (!firmId) return;
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from("ca_entity_groups").select("id, name, parent_business_id, notes").eq("ca_firm_id", firmId).order("name"),
      supabase.from("ca_clients").select("business_id, client_name, group_id, ownership_pct").eq("ca_firm_id", firmId).order("client_name"),
    ]);
    const gl = (g ?? []) as Group[];
    setGroups(gl);
    setMembers(((c ?? []) as Member[]).filter((m) => !!m.business_id));
    if (!groupId && gl[0]) setGroupId(gl[0].id);
  }, [firmId, groupId]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const groupMembers = useMemo(() => members.filter((m) => m.group_id === groupId), [members, groupId]);

  const loadConsolidation = useCallback(async () => {
    if (!firmId || !groupId || groupMembers.length === 0) { setTotals({}); setIetxns([]); return; }
    const { start, end } = periodBounds(period);
    const ids = groupMembers.map((m) => m.business_id);
    const { data: txns } = await supabase
      .from("bank_transactions")
      .select("business_id, amount, type")
      .in("business_id", ids)
      .gte("date", start).lte("date", end)
      .limit(10000);
    const agg: Record<string, { credit: number; debit: number }> = {};
    for (const t of (txns ?? []) as { business_id: string; amount: number | null; type: string | null }[]) {
      const slot = (agg[t.business_id] ??= { credit: 0, debit: 0 });
      const amt = Math.abs(Number(t.amount ?? 0));
      if ((t.type ?? "").toLowerCase() === "credit") slot.credit += amt; else slot.debit += amt;
    }
    setTotals(agg);

    const { data: ie } = await supabase
      .from("ca_inter_entity_transactions")
      .select("id, from_business_id, to_business_id, txn_date, amount, nature, description, elimination_status")
      .eq("ca_firm_id", firmId).eq("group_id", groupId)
      .gte("txn_date", start).lte("txn_date", end)
      .order("txn_date", { ascending: false });
    setIetxns((ie ?? []) as Ietxn[]);
  }, [firmId, groupId, groupMembers, period]);

  useEffect(() => { void loadConsolidation(); }, [loadConsolidation]);

  const nameFor = (id: string) => members.find((m) => m.business_id === id)?.client_name ?? "—";

  const createGroup = async () => {
    if (!firmId || !newGroup.trim()) return toast.error("Group name required");
    const { data, error } = await supabase.from("ca_entity_groups")
      .insert({ ca_firm_id: firmId, name: newGroup.trim() }).select("id").single();
    if (error) return toast.error(error.message);
    await logCAAudit({ firmId, entityType: "entity_group", entityId: (data as { id: string }).id, action: "entity_group_created", detail: { name: newGroup } });
    setNewGroup("");
    toast.success("Group created");
    await loadGroups();
  };

  const assign = async (businessId: string, gid: string | null, pct: number | null) => {
    const { error } = await supabase.from("ca_clients")
      .update({ group_id: gid, ownership_pct: pct })
      .eq("ca_firm_id", firmId!).eq("business_id", businessId);
    if (error) return toast.error(error.message);
    setMembers((prev) => prev.map((m) => (m.business_id === businessId ? { ...m, group_id: gid, ownership_pct: pct } : m)));
  };

  const setParent = async (businessId: string) => {
    const { error } = await supabase.from("ca_entity_groups").update({ parent_business_id: businessId || null }).eq("id", groupId);
    if (error) return toast.error(error.message);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, parent_business_id: businessId || null } : g)));
  };

  const addIetxn = async () => {
    if (!firmId || !groupId) return;
    if (!ieForm.from || !ieForm.to || ieForm.from === ieForm.to) return toast.error("Pick two different entities");
    if (!Number(ieForm.amount)) return toast.error("Amount required");
    const { error } = await supabase.from("ca_inter_entity_transactions").insert({
      ca_firm_id: firmId, group_id: groupId,
      from_business_id: ieForm.from, to_business_id: ieForm.to,
      amount: Number(ieForm.amount), nature: ieForm.nature, txn_date: ieForm.txn_date,
      description: ieForm.description.trim() || null, created_by: userId ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Inter-entity transaction recorded");
    setIeForm({ ...ieForm, amount: "", description: "" });
    await loadConsolidation();
  };

  const eliminate = async (t: Ietxn) => {
    const { error } = await supabase.from("ca_inter_entity_transactions")
      .update({ elimination_status: t.elimination_status === "eliminated" ? "pending" : "eliminated" }).eq("id", t.id);
    if (error) return toast.error(error.message);
    await loadConsolidation();
  };

  const consolidated = useMemo(() => {
    const income = groupMembers.reduce((s, m) => s + (totals[m.business_id]?.credit ?? 0), 0);
    const spend = groupMembers.reduce((s, m) => s + (totals[m.business_id]?.debit ?? 0), 0);
    const elim = ietxns.filter((t) => t.elimination_status === "eliminated").reduce((s, t) => s + Number(t.amount), 0);
    return { income, spend, elim, netIncome: income - elim, netSpend: spend - elim };
  }, [groupMembers, totals, ietxns]);

  const activeGroup = groups.find((g) => g.id === groupId) ?? null;

  return (
    <div>
      <ModuleHeader
        title="Entity Groups & Consolidation"
        subtitle="Parent–subsidiary structures across clients of the firm, a consolidated period view of the group, and inter-entity transactions with elimination tracking."
        right={editable ? undefined : <CABadge tone="grey">Read only</CABadge>}
      />

      <CACard style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <CAField label="Group">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...caInputStyle, width: 280 }}>
              {groups.length === 0 && <option value="">No groups yet</option>}
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </CAField>
          <CAField label="Period">
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...caInputStyle, width: 170 }} />
          </CAField>
          {editable && (
            <>
              <CAField label="New group">
                <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Sharma Holdings" style={{ ...caInputStyle, width: 240 }} />
              </CAField>
              <CAButton onClick={createGroup}>Create group</CAButton>
            </>
          )}
        </div>
        {activeGroup && editable && (
          <div style={{ marginTop: 14, maxWidth: 320 }}>
            <CAField label="Parent entity">
              <select value={activeGroup.parent_business_id ?? ""} onChange={(e) => setParent(e.target.value)} style={caInputStyle}>
                <option value="">Not set</option>
                {groupMembers.map((m) => <option key={m.business_id} value={m.business_id}>{m.client_name}</option>)}
              </select>
            </CAField>
          </div>
        )}
      </CACard>

      <StatStrip items={[
        { label: "Entities in group", value: String(groupMembers.length) },
        { label: "Consolidated inflow", value: inr(consolidated.netIncome) },
        { label: "Consolidated outflow", value: inr(consolidated.netSpend) },
        { label: "Eliminated", value: inr(consolidated.elim) },
      ]} />

      <CACard style={{ padding: 4, marginBottom: 18 }}>
        <div style={{ padding: "14px 16px 4px", fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink }}>
          Group membership
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Client", "In group", "Ownership %", "Inflow", "Outflow"].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr></thead>
            <tbody>
              {members.length === 0 && (
                <tr><td colSpan={5} style={caTd}><CAEmpty title="No clients yet" hint="Add clients to the firm before building group structures." /></td></tr>
              )}
              {members.map((m) => (
                <tr key={m.business_id}>
                  <td style={caTd}>
                    {m.client_name}
                    {activeGroup?.parent_business_id === m.business_id && <span style={{ marginLeft: 8 }}><CABadge tone="teal">Parent</CABadge></span>}
                  </td>
                  <td style={caTd}>
                    {editable ? (
                      <select value={m.group_id ?? ""} onChange={(e) => assign(m.business_id, e.target.value || null, m.ownership_pct)} style={{ ...caInputStyle, height: 34, width: 200 }}>
                        <option value="">—</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    ) : (groups.find((g) => g.id === m.group_id)?.name ?? "—")}
                  </td>
                  <td style={caTd}>
                    {editable ? (
                      <input
                        type="number" defaultValue={m.ownership_pct ?? ""} placeholder="—"
                        onBlur={(e) => assign(m.business_id, m.group_id, e.target.value === "" ? null : Number(e.target.value))}
                        style={{ ...caInputStyle, height: 34, width: 100 }}
                      />
                    ) : (m.ownership_pct === null ? "—" : `${m.ownership_pct}%`)}
                  </td>
                  <td style={{ ...caTd, fontFamily: CA.mono, textAlign: "right" }}>{inr(totals[m.business_id]?.credit ?? 0)}</td>
                  <td style={{ ...caTd, fontFamily: CA.mono, textAlign: "right" }}>{inr(totals[m.business_id]?.debit ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CACard>

      {editable && groupMembers.length >= 2 && (
        <CACard style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink, marginBottom: 12 }}>Record inter-entity transaction</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            <CAField label="From">
              <select value={ieForm.from} onChange={(e) => setIeForm({ ...ieForm, from: e.target.value })} style={caInputStyle}>
                <option value="">Select</option>
                {groupMembers.map((m) => <option key={m.business_id} value={m.business_id}>{m.client_name}</option>)}
              </select>
            </CAField>
            <CAField label="To">
              <select value={ieForm.to} onChange={(e) => setIeForm({ ...ieForm, to: e.target.value })} style={caInputStyle}>
                <option value="">Select</option>
                {groupMembers.map((m) => <option key={m.business_id} value={m.business_id}>{m.client_name}</option>)}
              </select>
            </CAField>
            <CAField label="Amount (₹)"><input type="number" value={ieForm.amount} onChange={(e) => setIeForm({ ...ieForm, amount: e.target.value })} style={caInputStyle} /></CAField>
            <CAField label="Nature">
              <select value={ieForm.nature} onChange={(e) => setIeForm({ ...ieForm, nature: e.target.value })} style={caInputStyle}>
                {["sale", "purchase", "loan", "reimbursement", "management_fee", "other"].map((n) => <option key={n} value={n}>{n.replace("_", " ")}</option>)}
              </select>
            </CAField>
            <CAField label="Date"><input type="date" value={ieForm.txn_date} onChange={(e) => setIeForm({ ...ieForm, txn_date: e.target.value })} style={caInputStyle} /></CAField>
            <CAField label="Description"><input value={ieForm.description} onChange={(e) => setIeForm({ ...ieForm, description: e.target.value })} style={caInputStyle} /></CAField>
          </div>
          <div style={{ marginTop: 14 }}><CAButton onClick={addIetxn}>Record</CAButton></div>
        </CACard>
      )}

      <CACard style={{ padding: 4 }}>
        <div style={{ padding: "14px 16px 4px", fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink }}>
          Inter-entity transactions · {period}
        </div>
        {ietxns.length === 0 ? (
          <CAEmpty title="No inter-entity transactions recorded" hint="Record intra-group flows so they can be eliminated on consolidation." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Date", "From", "To", "Nature", "Amount", "Elimination", ""].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr></thead>
              <tbody>
                {ietxns.map((t) => (
                  <tr key={t.id}>
                    <td style={caTd}>{dateIN(t.txn_date)}</td>
                    <td style={caTd}>{nameFor(t.from_business_id)}</td>
                    <td style={caTd}>{nameFor(t.to_business_id)}</td>
                    <td style={caTd}>{t.nature.replace("_", " ")}</td>
                    <td style={{ ...caTd, fontFamily: CA.mono, textAlign: "right" }}>{inr(t.amount)}</td>
                    <td style={caTd}><CABadge tone={t.elimination_status === "eliminated" ? "green" : "amber"}>{t.elimination_status.replace("_", " ")}</CABadge></td>
                    <td style={{ ...caTd, textAlign: "right" }}>
                      {editable && (
                        <button onClick={() => eliminate(t)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: CA.sans, fontSize: 12, fontWeight: 600, color: CA.teal }}>
                          {t.elimination_status === "eliminated" ? "Undo" : "Eliminate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CACard>
    </div>
  );
}
