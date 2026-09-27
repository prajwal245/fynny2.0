import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { CA_ROLE_BLURB, CA_ROLE_LABELS, useCARole, type CARole } from "@/hooks/useCARole";
import { CA, CABadge, CACard, CAButton, caInputStyle } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, QueueTable, StateChip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";

const ROLES: CARole[] = ["partner", "manager", "senior", "junior"];

interface MemberRow {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  role: string;
  status: string | null;
  created_at: string;
}

export default function CAUsersRolesPage() {
  const { firmId } = useCAPortal();
  const { can, role: myRole, isLoading: roleLoading } = useCARole();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CARole>("junior");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_firm_members")
      .select("id, user_id, invited_email, role, status, created_at")
      .eq("ca_firm_id", firmId)
      .order("created_at");
    setMembers((data ?? []) as MemberRow[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    if (!firmId || !email.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("ca_firm_members").insert({
      ca_firm_id: firmId,
      invited_email: email.trim().toLowerCase(),
      role: inviteRole,
      status: "invited",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logCAAudit({
      firmId,
      entityType: "firm_member",
      action: "member_invited",
      actorRole: myRole,
      detail: { email: email.trim().toLowerCase(), role: inviteRole },
    });
    toast.success("Invitation recorded");
    setEmail("");
    void load();
  };

  const changeRole = async (m: MemberRow, next: CARole) => {
    if (!firmId) return;
    const { error } = await supabase.from("ca_firm_members").update({ role: next }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logCAAudit({
      firmId,
      entityType: "firm_member",
      entityId: m.id,
      action: "role_changed",
      actorRole: myRole,
      detail: { from: m.role, to: next, email: m.invited_email },
    });
    toast.success(`Role set to ${CA_ROLE_LABELS[next]}`);
    void load();
  };

  const setStatus = async (m: MemberRow, status: string) => {
    if (!firmId) return;
    const { error } = await supabase.from("ca_firm_members").update({ status }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logCAAudit({ firmId, entityType: "firm_member", entityId: m.id, action: `member_${status}`, actorRole: myRole });
    void load();
  };

  if (roleLoading) return null;
  if (!can("manage_users")) {
    return (
      <div>
        <ModuleHeader title="Users & Roles" subtitle="Who can do what inside your firm." />
        <PermissionNotice permission="manage_users" />
      </div>
    );
  }

  return (
    <div>
      <ModuleHeader
        title="Users & Roles"
        subtitle="Five roles govern every action in the portal. Permissions are enforced in the database, not just the interface."
        right={<CABadge tone="teal">You are {myRole ? CA_ROLE_LABELS[myRole] : "—"}</CABadge>}
      />

      <CACard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 700, color: CA.ink, marginBottom: 12 }}>Invite a team member</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ ...caInputStyle, maxWidth: 320 }}
            placeholder="name@firm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select style={{ ...caInputStyle, maxWidth: 180 }} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as CARole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {CA_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <CAButton onClick={invite} disabled={busy || !email.trim()}>
            Send invite
          </CAButton>
        </div>
        <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 10 }}>{CA_ROLE_BLURB[inviteRole]}</div>
      </CACard>

      <CACard style={{ padding: 20, marginBottom: 20 }}>
        <QueueTable
          columns={["Member", "Role", "Status", "Actions"]}
          empty="No team members yet"
          emptyHint="Invite colleagues to give them scoped access to your portfolio."
          rows={members.map((m) => [
            <div key="e">
              <div style={{ fontWeight: 600 }}>{m.invited_email ?? "—"}</div>
              <div style={{ fontSize: 11.5, color: CA.faint }}>{m.user_id ? "Linked account" : "Awaiting sign-up"}</div>
            </div>,
            <select
              key="r"
              value={ROLES.includes(m.role as CARole) ? m.role : "junior"}
              onChange={(e) => changeRole(m, e.target.value as CARole)}
              style={{ ...caInputStyle, height: 34, maxWidth: 150, fontSize: 13 }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {CA_ROLE_LABELS[r]}
                </option>
              ))}
            </select>,
            <StateChip key="s" value={m.status ?? "active"} />,
            <CAButton
              key="a"
              variant={m.status === "inactive" ? "ghost" : "danger"}
              onClick={() => setStatus(m, m.status === "inactive" ? "active" : "inactive")}
            >
              {m.status === "inactive" ? "Reactivate" : "Deactivate"}
            </CAButton>,
          ])}
        />
      </CACard>

      <CACard style={{ padding: 20 }}>
        <div style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 700, color: CA.ink, marginBottom: 12 }}>What each role can do</div>
        <div style={{ display: "grid", gap: 10 }}>
          {(["partner", "manager", "senior", "junior", "client"] as CARole[]).map((r) => (
            <div key={r} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 92, flexShrink: 0 }}>
                <CABadge tone={r === "partner" ? "teal" : "grey"}>{CA_ROLE_LABELS[r]}</CABadge>
              </div>
              <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>{CA_ROLE_BLURB[r]}</div>
            </div>
          ))}
        </div>
      </CACard>
    </div>
  );
}
