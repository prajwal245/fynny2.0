import { useEffect, useMemo, useState, CSSProperties } from "react";
import { useNavigate } from "@/lib/router-compat";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { logAdminAction } from "@/lib/adminAudit";

const fmtINR = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`;

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  active:    { bg: "rgba(16,185,129,0.12)", fg: "#0F7B4F", label: "Active" },
  trial:     { bg: "rgba(139,105,20,0.15)", fg: "#8B6914", label: "Trial" },
  cancelled: { bg: "rgba(23,18,8,0.08)",    fg: "hsl(var(--fyn-ink) / 0.7)", label: "Cancelled" },
  past_due:  { bg: "rgba(234,140,30,0.15)", fg: "#C26B00", label: "Past Due" },
  none:      { bg: "rgba(23,18,8,0.06)",    fg: "hsl(var(--fyn-ink) / 0.55)", label: "No sub" },
};

const PLAN_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  free_trial: { bg: "rgba(139,105,20,0.12)", fg: "#8B6914", label: "Free Trial" },
  starter:    { bg: "rgba(59,130,246,0.12)", fg: "#3B82F6", label: "Starter" },
  pro:        { bg: "rgba(16,185,129,0.12)", fg: "#0F7B4F", label: "Pro" },
  enterprise: { bg: "rgba(120,53,15,0.12)",  fg: "#78350F", label: "Enterprise" },
  none:       { bg: "rgba(23,18,8,0.06)",    fg: "hsl(var(--fyn-ink) / 0.55)", label: "-" },
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  mobile: string | null;
  whatsapp_phone: string | null;
  business_id: string | null;
  updated_at: string;
};
type BusinessRow = { id: string; business_name: string };
type SubRow = { business_id: string | null; plan_type: string; status: string; mrr: number | string };
type RoleRow = { user_id: string; role: string };

type Row = {
  user_id: string;
  name: string;
  mobile: string;
  company: string;
  plan: string;
  status: string;
  mrr: number;
  role: string;
  last_active: string;
};

const COLUMNS = ["Select", "Name", "Mobile", "Company", "Role", "Plan", "Status", "MRR", "Last Updated", "Actions"];
const ROLES = ["user", "support_agent", "analyst", "ops_admin", "admin", "super_admin"] as const;

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const [profilesRes, businessesRes, subsRes, rolesRes] = await Promise.all([
      supabase.from("profiles")
        .select("user_id, full_name, display_name, mobile, whatsapp_phone, business_id, updated_at")
        .order("updated_at", { ascending: false }).limit(500),
      supabase.from("businesses").select("id, business_name"),
      supabase.from("subscriptions").select("business_id, plan_type, status, mrr"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.error) {
      toast.error("Failed to load users");
      setLoading(false); return;
    }
    const profiles = (profilesRes.data ?? []) as ProfileRow[];
    const bizMap = new Map<string, string>(
      ((businessesRes.data ?? []) as BusinessRow[]).map((b) => [b.id, b.business_name])
    );
    const subMap = new Map<string, SubRow>();
    ((subsRes.data ?? []) as SubRow[]).forEach((s) => {
      if (s.business_id) subMap.set(s.business_id, s);
    });
    const roleMap = new Map<string, string[]>();
    ((rolesRes.data ?? []) as RoleRow[]).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role); roleMap.set(r.user_id, arr);
    });

    const built: Row[] = profiles.map((p) => {
      const sub = p.business_id ? subMap.get(p.business_id) : undefined;
      const roles = roleMap.get(p.user_id) ?? [];
      const topRole = ["super_admin", "admin", "ops_admin", "support_agent", "analyst", "user"]
        .find((r) => roles.includes(r)) ?? "user";
      return {
        user_id: p.user_id,
        name: p.display_name || p.full_name || "Unnamed user",
        mobile: p.mobile || p.whatsapp_phone || "-",
        company: p.business_id ? (bizMap.get(p.business_id) ?? "-") : "-",
        plan: sub?.plan_type ?? "none",
        status: sub?.status ?? "none",
        mrr: Number(sub?.mrr ?? 0),
        role: topRole,
        last_active: p.updated_at,
      };
    });
    setRows(built);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => rows.filter((r) => {
    if (q && !`${r.name} ${r.company} ${r.mobile} ${r.user_id}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (planFilter !== "all" && r.plan !== planFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  }), [rows, q, planFilter, statusFilter]);

  const allSelected = visible.length > 0 && visible.every((r) => selected.includes(r.user_id));

  const exportCsv = () => {
    const target = selected.length ? rows.filter((r) => selected.includes(r.user_id)) : visible;
    const header = ["user_id","name","mobile","company","role","plan","status","mrr","last_updated"];
    const csv = [header.join(",")]
      .concat(target.map((r) => [r.user_id, r.name, r.mobile, r.company, r.role, r.plan, r.status, r.mrr, r.last_active]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `users-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${target.length} user${target.length === 1 ? "" : "s"}`);
  };

  const setRole = async (userId: string, newRole: string) => {
    const role = newRole as typeof ROLES[number];
    // Remove all existing roles, then insert the chosen one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as never });
    if (error) { toast.error(error.message); return; }
    await logAdminAction({ action: "user_role_changed", target_type: "user", target_id: userId, details: { role } });
    toast.success(`Role set to ${role}`);
    load();
  };

  return (
    <div>
      <PageHeader title="User Management" subtitle="Manage all FYNHelp users and businesses" />

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, mobile, ID…"
            className="flex-1 min-w-[220px] rounded-lg px-4 py-2.5"
            style={inputStyle}
          />
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="rounded-lg px-3 py-2.5" style={{ ...inputStyle, fontSize: 13, minWidth: 140 }}>
            <option value="all">All Plans</option>
            <option value="free_trial">Free Trial</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
            <option value="none">No Subscription</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg px-3 py-2.5" style={{ ...inputStyle, fontSize: 13, minWidth: 140 }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="cancelled">Cancelled</option>
            <option value="past_due">Past Due</option>
            <option value="none">No subscription</option>
          </select>
          <button onClick={exportCsv} className="rounded-lg px-4 py-2.5"
            style={{ ...inputStyle, fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Export CSV
          </button>
        </div>
      </Card>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <Card style={{ marginBottom: 16, background: "rgba(139,105,20,0.06)", border: "1px solid rgba(139,105,20,0.25)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, color: "hsl(var(--fyn-ink))" }}>
              {selected.length} user{selected.length > 1 ? "s" : ""} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportCsv} style={secondaryBtn}>Export Selected</button>
              <button onClick={() => setSelected([])} style={secondaryBtn}>Clear</button>
            </div>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(23,18,8,0.04)", borderBottom: "2px solid rgba(139,105,20,0.2)" }}>
                {COLUMNS.map((c) => (
                  <th key={c} style={{ padding: "16px", textAlign: "left", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))", whiteSpace: "nowrap" }}>
                    {c === "Select" ? (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => setSelected(e.target.checked ? visible.map((r) => r.user_id) : [])}
                        style={{ cursor: "pointer" }}
                      />
                    ) : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={COLUMNS.length} style={{ padding: 32, textAlign: "center", fontFamily: "Roboto, sans-serif", color: "hsl(var(--fyn-ink) / 0.5)" }}>Loading users…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={COLUMNS.length} style={{ padding: 32, textAlign: "center", fontFamily: "Roboto, sans-serif", color: "hsl(var(--fyn-ink) / 0.5)" }}>No users match these filters.</td></tr>
              )}
              {visible.map((r, i) => {
                const isSel = selected.includes(r.user_id);
                const baseBg = i % 2 ? "rgba(244,237,218,0.3)" : "#fff";
                const go = () => navigate(`/admin/users/${r.user_id}`);
                const planStyle = PLAN_STYLE[r.plan] ?? PLAN_STYLE.none;
                const statusStyle = STATUS_STYLE[r.status] ?? STATUS_STYLE.none;
                return (
                  <tr
                    key={r.user_id}
                    style={{ background: isSel ? "rgba(139,105,20,0.06)" : baseBg, borderBottom: "1px solid rgba(23,18,8,0.06)", cursor: "pointer", transition: "background 0.15s" }}
                  >
                    <td style={cell} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, r.user_id] : selected.filter((id) => id !== r.user_id))}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={cell} onClick={go}><span style={{ fontWeight: 500, color: "hsl(var(--fyn-ink))" }}>{r.name}</span></td>
                    <td style={cell} onClick={go}><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)" }}>{r.mobile}</span></td>
                    <td style={cell} onClick={go}><span style={{ color: "hsl(var(--fyn-ink) / 0.85)" }}>{r.company}</span></td>
                    <td style={cell} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={r.role}
                        onChange={(e) => setRole(r.user_id, e.target.value)}
                        style={{ ...inputStyle, height: 32, fontSize: 12, padding: "0 8px", minWidth: 130 }}
                      >
                        {ROLES.map((rr) => <option key={rr} value={rr}>{rr}</option>)}
                      </select>
                    </td>
                    <td style={cell} onClick={go}><Badge {...planStyle} /></td>
                    <td style={cell} onClick={go}><Badge {...statusStyle} /></td>
                    <td style={cell} onClick={go}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 600, color: r.mrr > 0 ? "#8B6914" : "hsl(var(--fyn-ink) / 0.4)" }}>
                        {r.mrr > 0 ? fmtINR(r.mrr) : "-"}
                      </span>
                    </td>
                    <td style={cell} onClick={go}>
                      <span style={{ fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>
                        {new Date(r.last_active).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </td>
                    <td style={cell} onClick={(e) => e.stopPropagation()}><ActionsMenu userId={r.user_id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid rgba(23,18,8,0.15)",
  fontFamily: "Roboto, sans-serif",
  fontSize: 14,
  color: "hsl(var(--fyn-ink))",
  background: "#fff",
};

const secondaryBtn: CSSProperties = {
  height: 36, padding: "0 14px", borderRadius: 8,
  background: "transparent", border: "1px solid rgba(23,18,8,0.15)",
  color: "hsl(var(--fyn-ink))",
  fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer",
};

const cell: CSSProperties = {
  padding: "14px 16px", fontFamily: "Roboto, sans-serif", fontSize: 14,
  color: "hsl(var(--fyn-ink) / 0.85)", verticalAlign: "middle", whiteSpace: "nowrap",
};

function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: bg, color: fg, fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 12 }}>
      {label}
    </span>
  );
}

function ActionsMenu({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const deleteUser = async () => {
    if (!confirm("Permanently delete this user? This cannot be undone.")) return;
    try {
      const { error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      await logAdminAction({ action: "user_deleted", target_type: "user", target_id: userId });
      toast.success("User deleted");
      window.location.reload();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error((err as Error).message || "Failed to delete user");
    }
  };

  const items = [
    { label: "View Profile", fn: () => navigate(`/admin/users/${userId}`) },
    { label: "View Audit Log", fn: () => navigate(`/admin/audit-logs?user=${userId}`) },
    { label: "Delete User", fn: deleteUser, danger: true },
  ];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Open actions menu"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
        <MoreVertical size={16} color="hsl(var(--fyn-ink) / 0.6)" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", right: 0, top: "100%", marginTop: 4, minWidth: 200,
            background: "#fff", border: "1px solid rgba(23,18,8,0.12)",
            borderRadius: 10, boxShadow: "0 8px 24px rgba(23,18,8,0.12)",
            zIndex: 50, overflow: "hidden", padding: "4px 0",
          }}>
            {items.map((item) => (
              <button key={item.label} onClick={() => { setOpen(false); item.fn(); }}
                className="w-full text-left px-4 py-2.5 hover:bg-[hsl(var(--fyn-ink)/0.04)] transition-colors"
                style={{
                  fontFamily: "Roboto, sans-serif", fontSize: 13,
                  color: item.danger ? "#C41E1E" : "hsl(var(--fyn-ink))",
                  border: "none", background: "transparent",
                  cursor: "pointer", display: "block",
                }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
