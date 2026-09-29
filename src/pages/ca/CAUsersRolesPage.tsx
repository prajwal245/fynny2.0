import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { toast } from "sonner";
import {
  CA, CACard, CAHeading, CAButton, CAField, caInputStyle, CABadge, statusTone,
  caTh, caTd, CAEmpty, dateIN,
} from "@/components/ca/portalUi";
import RbacTestPanel from "@/components/ca/RbacTestPanel";

const ROLES = ["partner", "manager", "senior", "junior", "client"];
const INVITE_ROLES = ["partner", "manager", "senior", "junior"];

interface Member {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  role: string;
  status: string | null;
  created_at: string;
  full_name?: string | null;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function CAUsersRolesPage() {
  const { firmId, userId, caRole } = useCAPortal();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "junior" });
  const [inviting, setInviting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const role = (caRole ?? "").toLowerCase();
  const isPartner = role === "partner" || role === "admin";

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_firm_members")
      .select("id, user_id, invited_email, role, status, created_at")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    const rows = ((data ?? []) as Member[]);
    const ids = rows.map((r) => r.user_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, updated_at").in("user_id", ids);
      const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      rows.forEach((r) => {
        const p = r.user_id ? byId.get(r.user_id) : null;
        r.full_name = p?.full_name ?? null;
        (r as any).last_active = p?.updated_at ?? null;
      });
    }
    setMembers(rows);
    setLoading(false);
  }, [firmId]);

  useEffect(() => { void load(); }, [load]);

  const active = members.filter((m) => m.status !== "invited");
  const pending = members.filter((m) => m.status === "invited");

  const changeRole = async (m: Member, next: string) => {
    if (m.user_id && m.user_id === userId) return toast.error("You cannot change your own role");
    const { error } = await supabase.from("ca_firm_members").update({ role: next }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(`Role set to ${next}`);
    void load();
  };

  const setStatus = async (m: Member, status: string) => {
    if (status === "inactive") {
      if (m.user_id && m.user_id === userId) return toast.error("You cannot deactivate yourself");
      const partners = active.filter((x) => x.role === "partner" && x.status === "active");
      if (m.role === "partner" && partners.length <= 1)
        return toast.error("Your firm must keep at least one Partner");
      if (!window.confirm(`Deactivate ${m.invited_email ?? "this member"}? They will lose portal access immediately.`))
        return;
    }
    const { error } = await supabase.from("ca_firm_members").update({ status }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(status === "inactive" ? "Member deactivated" : "Member reactivated");
    void load();
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmId) return;
    const email = invite.email.trim().toLowerCase();
    if (!isEmail(email)) return toast.error("Enter a valid email address");
    if (members.some((m) => (m.invited_email ?? "").toLowerCase() === email))
      return toast.error("That email is already part of this firm");
    setInviting(true);
    const { error } = await supabase.from("ca_firm_members").insert({
      ca_firm_id: firmId, invited_email: email, role: invite.role, status: "invited",
    });
    if (error) { setInviting(false); return toast.error(error.message); }
    const { error: mailErr } = await supabase.functions.invoke("ca-send-email", {
      body: { kind: "team_invite", ca_firm_id: firmId, to: email, role: invite.role },
    });
    setInviting(false);
    if (mailErr) toast.warning(`Member added, but the invite email failed: ${mailErr.message}`);
    else toast.success(`Invitation sent to ${email}`);
    setInvite({ email: "", role: "junior" });
    setPanelOpen(false);
    void load();
  };

  const resend = async (m: Member) => {
    if (!firmId || !m.invited_email) return;
    const { error } = await supabase.functions.invoke("ca-send-email", {
      body: { kind: "team_invite", ca_firm_id: firmId, to: m.invited_email, role: m.role },
    });
    if (error) return toast.error(error.message);
    toast.success(`Invite resent to ${m.invited_email}`);
  };

  const cancelInvite = async (m: Member) => {
    const { error } = await supabase.from("ca_firm_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Invite cancelled");
    void load();
  };

  const avatar = (email: string | null) => (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 999, background: CA.teal, color: "#fff",
        fontFamily: CA.sans, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
      }}
    >
      {(email ?? "?").charAt(0)}
    </span>
  );

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <CAHeading>Users &amp; roles</CAHeading>
        {isPartner && <CAButton onClick={() => setPanelOpen(true)}>Invite member</CAButton>}
      </div>

      <CACard style={{ marginTop: 18, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `0.5px solid ${CA.line}`, fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>
          Team
        </div>
        {loading ? (
          <CAEmpty title="Loading team…" />
        ) : active.length === 0 ? (
          <CAEmpty title="No team members yet" hint="Invite your first colleague to get started." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={caTh} />
                <th style={caTh}>Email</th>
                <th style={caTh}>Role</th>
                <th style={caTh}>Status</th>
                <th style={caTh}>Last active</th>
                <th style={caTh} />
              </tr>
            </thead>
            <tbody>
              {active.map((m) => (
                <tr key={m.id}>
                  <td style={{ ...caTd, width: 44 }}>{avatar(m.invited_email)}</td>
                  <td style={caTd}>
                    <div style={{ fontWeight: 600 }}>{m.invited_email ?? "—"}</div>
                    {m.full_name && <div style={{ fontSize: 12, color: CA.muted }}>{m.full_name}</div>}
                  </td>
                  <td style={caTd}>
                    {isPartner && m.user_id !== userId ? (
                      <select
                        style={{ ...caInputStyle, height: 34, width: 130 }}
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <CABadge tone="teal">{m.role}</CABadge>
                    )}
                  </td>
                  <td style={caTd}><CABadge tone={statusTone(m.status)}>{m.status ?? "—"}</CABadge></td>
                  <td style={caTd}>{dateIN((m as any).last_active ?? m.created_at)}</td>
                  <td style={{ ...caTd, textAlign: "right" }}>
                    {isPartner && m.status === "inactive" && (
                      <CAButton variant="ghost" onClick={() => setStatus(m, "active")} style={{ padding: "6px 12px" }}>
                        Reactivate
                      </CAButton>
                    )}
                    {isPartner && m.status !== "inactive" && m.user_id !== userId && (
                      <CAButton variant="danger" onClick={() => setStatus(m, "inactive")} style={{ padding: "6px 12px" }}>
                        Deactivate
                      </CAButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CACard>

      {isPartner && active.length === 1 && (
        <RbacTestPanel
          onQuickInvite={(r) => {
            setInvite((v) => ({ ...v, role: r }));
            setPanelOpen(true);
            window.setTimeout(() => emailRef.current?.focus(), 50);
          }}
        />
      )}

      <CACard style={{ marginTop: 18, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `0.5px solid ${CA.line}`, fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>
          Pending invites
        </div>
        {pending.length === 0 ? (
          <CAEmpty title="No pending invites" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={caTh}>Email</th>
                <th style={caTh}>Role</th>
                <th style={caTh}>Invited</th>
                <th style={caTh} />
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.id}>
                  <td style={caTd}>{m.invited_email ?? "—"}</td>
                  <td style={caTd}><CABadge tone="amber">{m.role}</CABadge></td>
                  <td style={caTd}>{dateIN(m.created_at)}</td>
                  <td style={{ ...caTd, textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 8 }}>
                      <CAButton variant="ghost" onClick={() => resend(m)} style={{ padding: "6px 12px" }}>Resend invite</CAButton>
                      {isPartner && (
                        <CAButton variant="danger" onClick={() => cancelInvite(m)} style={{ padding: "6px 12px" }}>Cancel invite</CAButton>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CACard>

      {panelOpen && (
        <>
          <div
            onClick={() => setPanelOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.25)", zIndex: 50 }}
          />
          <div
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: 320, zIndex: 51,
              background: CA.card, borderLeft: `0.5px solid ${CA.line}`, padding: 22,
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink }}>Invite member</div>
            <form onSubmit={sendInvite} style={{ display: "grid", gap: 14 }}>
              <CAField label="Email">
                <input
                  ref={emailRef}
                  style={caInputStyle}
                  value={invite.email}
                  onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                  placeholder="colleague@cafirm.com"
                />
              </CAField>
              <CAField label="Role">
                <select
                  style={caInputStyle as React.CSSProperties}
                  value={invite.role}
                  onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
                >
                  {INVITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </CAField>
              <div style={{ display: "flex", gap: 10 }}>
                <CAButton type="submit" disabled={inviting}>{inviting ? "Sending…" : "Send invite"}</CAButton>
                <CAButton variant="ghost" onClick={() => setPanelOpen(false)}>Cancel</CAButton>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
