import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole, TEAM_ROLES, TeamRole } from "@/hooks/useUserRole";


const RED = "#A93838"; const BORDER = "#E0D9C8";

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-6 mb-6 animate-fade-in" style={{ borderColor: BORDER }}>
    <h3 className="font-semibold text-[15px]" style={{ color: "#171208" }}>{title}</h3>
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

const inpCls = "w-full h-10 px-3 rounded-md border bg-card text-[14px] focus:outline-hidden focus:ring-2 focus:ring-[#A93838]/30";

type Member = { user_id: string; name: string; email: string; role: string; you: boolean };


const TeamAccessPage = () => {
  const { businessId, user } = useAuth();
  const { isOwner, role: myRole } = useUserRole();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("manager");
  const [sending, setSending] = useState(false);
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null);

  const loadMembers = async () => {
    if (!businessId) { setLoading(false); return; }
    const { data } = await (supabase.from("profiles") as any)
      .select("user_id, full_name, display_name, role")
      .eq("business_id", businessId);
    const rows = (data ?? []).map((p: any) => ({
      user_id: p.user_id,
      name: p.full_name || p.display_name || "Team member",
      email: "",
      role: (p.role ?? "owner").toLowerCase(),
      you: p.user_id === user?.id,
    }));
    setMembers(rows);
    setLoading(false);
  };

  useEffect(() => { loadMembers(); }, [businessId, user?.id]);

  const changeRole = async (userId: string, next: TeamRole) => {
    if (!isOwner) return toast.error("Only the Owner can change roles.");
    setSavingRoleFor(userId);
    const { error } = await (supabase.from("profiles") as any)
      .update({ role: next })
      .eq("user_id", userId);
    setSavingRoleFor(null);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    setMembers((m) => m.map((x) => x.user_id === userId ? { ...x, role: next } : x));
  };


  const sendInvite = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)) return toast.error("Invalid email");
    if (!businessId) return toast.error("No business linked");
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-team-invite", {
        body: { email: inviteEmail, business_id: businessId, role: inviteRole },
      });
      if (error) throw error;
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
    } catch {
      // Fallback: record as an early_access_request with type ca_invite-style payload
      const { error: eaErr } = await (supabase.from("early_access_requests") as any).insert({
        email: inviteEmail,
        module: "team_invite",
        user_id: user?.id ?? null,
        details: { business_id: businessId, role: inviteRole },
      });
      if (eaErr) toast.error(eaErr.message);
      else {
        toast.success(`Invite queued for ${inviteEmail}`);
        setInviteEmail("");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>Team & Access</h2>
      <p className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.60)" }}>Invite teammates and manage role-based permissions.</p>

      <Card title="Current Team Members">
        {loading ? (
          <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.5)" }}>Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>No team members yet. Invite someone below.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "rgba(23,18,8,0.5)" }}>
              <th className="py-2">Name</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t" style={{ borderColor: BORDER }}>
                  <td className="py-3 font-medium">{m.name}</td>
                  <td>
                    {isOwner && !m.you ? (
                      <select
                        data-testid={`role-select-${m.user_id}`}
                        value={m.role}
                        disabled={savingRoleFor === m.user_id}
                        onChange={(e) => changeRole(m.user_id, e.target.value as TeamRole)}
                        className="h-8 px-2 rounded-md border bg-card text-[13px]"
                        style={{ borderColor: BORDER }}
                      >
                        {TEAM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <span className="capitalize">{m.role}</span>
                    )}
                  </td>
                  <td className="text-right">
                    {m.you && <span className="text-[11px] px-2 py-1 rounded" style={{ background: "rgba(139,105,20,0.15)", color: "#8B6914" }}>You · {myRole}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isOwner && (
          <p className="mt-3 text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>
            Only the workspace Owner can change team roles.
          </p>
        )}
      </Card>

      <Card title="Invite Team Member">
        <div className="grid grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div><label className="block text-[13px] font-medium mb-1.5">Email</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inpCls} style={{ borderColor: BORDER }} /></div>
          <div><label className="block text-[13px] font-medium mb-1.5">Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as TeamRole)} className={inpCls} style={{ borderColor: BORDER }} disabled={!isOwner}>
              {TEAM_ROLES.filter((r) => r.value !== "owner").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
          <button onClick={sendInvite} disabled={sending || !isOwner} className="h-10 px-5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ background: RED }}>
            {sending ? "Sending…" : "Send Invite"}
          </button>
        </div>
        {!isOwner && <p className="mt-2 text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>Only the Owner can invite new teammates.</p>}
      </Card>

      <Card title="Roles & Permissions">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "rgba(23,18,8,0.5)" }}>
            <th className="py-2">Permission</th>
            <th className="text-center">Owner</th><th className="text-center">Manager</th>
            <th className="text-center">Accountant</th><th className="text-center">Viewer</th></tr></thead>
          <tbody>
            {([
              ["View all data", true, true, true, true],
              ["Edit financial data", true, true, false, false],
              ["GST / Tax / Reports edit", true, true, true, false],
              ["Company settings", true, false, false, false],
              ["Billing & payment methods", true, false, false, false],
              ["Delete workspace", true, false, false, false],
            ] as [string, boolean, boolean, boolean, boolean][]).map(([perm, ...vals]) => (
              <tr key={perm} className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-2.5">{perm}</td>
                {(vals as boolean[]).map((v, i) => (
                  <td key={i} className="text-center">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold"
                      style={{ background: v ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.12)", color: v ? "#16A34A" : "#DC2626" }}>
                      {v ? "✓" : "✗"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

    </div>
  );
};

export default TeamAccessPage;
