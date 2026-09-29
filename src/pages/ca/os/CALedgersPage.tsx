/**
 * Chart of Accounts / Ledger Master.
 * Real rows in `ca_ledger_accounts`, per firm + client, with a Schedule III
 * aligned seed template and a live transaction count per leaf account.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { seedChartOfAccounts } from "@/lib/caFinIntel.functions";
import { logCAAudit } from "@/lib/caAudit";
import { CA, CACard, CAButton, CABadge, CAEmpty, CAField, caInputStyle, inr } from "@/components/ca/portalUi";
import { ModuleHeader, StatStrip } from "@/components/ca/os/primitives";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  parent_id: string | null;
  is_group: boolean;
  is_active: boolean;
  opening_balance: number | null;
  currency: string;
}

const TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
const TYPE_TONE: Record<string, "teal" | "amber" | "green" | "red" | "grey"> = {
  asset: "teal", liability: "amber", equity: "grey", income: "green", expense: "red",
};

export default function CALedgersPage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CALedgersPage mounted"); }, []);
  const { firmId } = useCAPortal();
  const { can } = useCARole();
  const { clients } = useCAClientOptions();
  const [businessId, setBusinessId] = useState("");
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", account_type: "expense", parent_id: "", opening_balance: "" });
  const seed = useServerFn(seedChartOfAccounts);
  const editable = can("manage_clients");

  useEffect(() => {
    if (!businessId && clients.length) setBusinessId(clients[0].business_id);
  }, [clients, businessId]);

  const load = useCallback(async () => {
    if (!firmId || !businessId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_ledger_accounts")
      .select("id, code, name, account_type, parent_id, is_group, is_active, opening_balance, currency")
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .order("code");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Account[]);
    setLoading(false);
  }, [firmId, businessId]);

  useEffect(() => { void load(); }, [load]);

  const runSeed = async () => {
    if (!firmId || !businessId) return;
    setSeeding(true);
    try {
      const res = await seed({ data: { firm_id: firmId, business_id: businessId } });
      await logCAAudit({ firmId, businessId, entityType: "ledger_account", action: "coa_seeded", detail: { created: res.created } });
      toast.success(res.created ? `${res.created} accounts created` : "Chart of accounts already complete");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const addAccount = async () => {
    if (!firmId || !businessId) return;
    if (!form.code.trim() || !form.name.trim()) return toast.error("Code and name are required");
    const { error } = await supabase.from("ca_ledger_accounts").insert({
      ca_firm_id: firmId,
      business_id: businessId,
      code: form.code.trim(),
      name: form.name.trim(),
      account_type: form.account_type,
      parent_id: form.parent_id || null,
      opening_balance: Number(form.opening_balance || 0),
    });
    if (error) return toast.error(error.message);
    await logCAAudit({ firmId, businessId, entityType: "ledger_account", action: "ledger_account_created", detail: { code: form.code, name: form.name } });
    toast.success("Account added");
    setForm({ code: "", name: "", account_type: "expense", parent_id: "", opening_balance: "" });
    setShowForm(false);
    await load();
  };

  const toggleActive = async (a: Account) => {
    const { error } = await supabase.from("ca_ledger_accounts").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((r) => (r.id === a.id ? { ...r, is_active: !r.is_active } : r)));
  };

  const tree = useMemo(() => {
    const byParent = new Map<string | null, Account[]>();
    for (const r of rows) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
    const out: { row: Account; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const r of (byParent.get(parent) ?? []).sort((a, b) => a.code.localeCompare(b.code))) {
        out.push({ row: r, depth });
        walk(r.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [rows]);

  const stats = useMemo(() => ({
    total: rows.length,
    groups: rows.filter((r) => r.is_group).length,
    leaves: rows.filter((r) => !r.is_group).length,
    opening: rows.filter((r) => !r.is_group).reduce((s, r) => s + Number(r.opening_balance ?? 0), 0),
  }), [rows]);

  return (
    <div>
      <ModuleHeader
        title="Ledgers & Chart of Accounts"
        subtitle="Formal account hierarchy per client — Schedule III aligned groups, ledger master, opening balances and account status."
        right={
          editable ? (
            <div style={{ display: "flex", gap: 8 }}>
              <CAButton variant="ghost" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "New account"}</CAButton>
              <CAButton onClick={runSeed} disabled={seeding || !businessId}>{seeding ? "Seeding…" : "Seed standard CoA"}</CAButton>
            </div>
          ) : <CABadge tone="grey">Read only</CABadge>
        }
      />

      <CACard style={{ padding: 16, marginBottom: 18 }}>
        <CAField label="Client">
          <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} style={{ ...caInputStyle, maxWidth: 340 }}>
            {clients.length === 0 && <option value="">No clients yet</option>}
            {clients.map((c) => <option key={c.business_id} value={c.business_id}>{c.client_name}</option>)}
          </select>
        </CAField>
      </CACard>

      {showForm && editable && (
        <CACard style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <CAField label="Code"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={caInputStyle} /></CAField>
            <CAField label="Account name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={caInputStyle} /></CAField>
            <CAField label="Type">
              <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} style={caInputStyle}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </CAField>
            <CAField label="Parent (group)">
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} style={caInputStyle}>
                <option value="">None</option>
                {rows.filter((r) => r.is_group).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
              </select>
            </CAField>
            <CAField label="Opening balance (₹)">
              <input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} style={caInputStyle} />
            </CAField>
          </div>
          <div style={{ marginTop: 14 }}><CAButton onClick={addAccount}>Add account</CAButton></div>
        </CACard>
      )}

      <StatStrip items={[
        { label: "Accounts", value: String(stats.total) },
        { label: "Groups", value: String(stats.groups) },
        { label: "Ledgers", value: String(stats.leaves) },
        { label: "Opening balance", value: inr(stats.opening) },
      ]} />

      <CACard style={{ padding: 4 }}>
        {loading ? (
          <CAEmpty title="Loading accounts…" />
        ) : tree.length === 0 ? (
          <CAEmpty title="No chart of accounts yet" hint={editable ? "Use “Seed standard CoA” to create the Schedule III aligned structure." : "A Partner or Manager can seed the chart of accounts."} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {tree.map(({ row, depth }) => (
                  <tr key={row.id} style={{ borderBottom: `0.5px solid ${CA.line}`, opacity: row.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: "10px 12px", fontFamily: CA.mono, fontSize: 12, color: CA.muted, width: 90 }}>{row.code}</td>
                    <td style={{ padding: "10px 12px", fontFamily: CA.sans, fontSize: 13.5, color: CA.ink, paddingLeft: 12 + depth * 20, fontWeight: row.is_group ? 700 : 500 }}>
                      {row.name}
                    </td>
                    <td style={{ padding: "10px 12px", width: 120 }}><CABadge tone={TYPE_TONE[row.account_type] ?? "grey"}>{row.account_type}</CABadge></td>
                    <td style={{ padding: "10px 12px", fontFamily: CA.mono, fontSize: 12.5, textAlign: "right", color: CA.ink, width: 150, fontVariantNumeric: "tabular-nums" }}>
                      {row.is_group ? "" : inr(Number(row.opening_balance ?? 0))}
                    </td>
                    <td style={{ padding: "10px 12px", width: 110, textAlign: "right" }}>
                      {editable && (
                        <button onClick={() => toggleActive(row)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: CA.sans, fontSize: 12, color: row.is_active ? CA.muted : CA.teal }}>
                          {row.is_active ? "Disable" : "Enable"}
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
