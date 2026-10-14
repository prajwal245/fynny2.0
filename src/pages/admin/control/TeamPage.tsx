import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminDeactivate, adminInvite, adminRevokeSessions, adminSetRole, adminTeam } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { ASSIGNABLE_ROLES, ROLE_LABEL, type AdminRole } from "@/lib/admin/rbac";
import { Btn, ErrorNote, PageHead, Panel, Pill, Table, Td, muted, when } from "./ui";

export default function TeamPage() {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["admin", "team"], queryFn: () => adminCall(() => adminTeam()) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support_agent");
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await adminCall(fn);
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["admin", "team"] });
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHead title="Admin Team" sub="Who can open this panel, with what role. Every admin must use an authenticator app; changing a role signs that person out." />
      <Panel title="Add an admin">
        <div className="flex flex-wrap gap-2 text-sm">
          <input className="rounded-lg border px-3 py-2 flex-1 min-w-[220px]" type="email" placeholder="name@fynhelp.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="invite-email" />
          <select className="rounded-lg border px-3 py-2" value={role} onChange={(e) => setRole(e.target.value as AdminRole)} aria-label="Role" data-testid="invite-role">
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <Btn kind="primary" disabled={busy === "invite" || !email.includes("@")} testId="invite-send" onClick={() => void act("invite", () => adminInvite({ data: { email, role } }), `Invite sent to ${email}. They set a password, then an authenticator, on first sign-in.`).then(() => setEmail(""))}>
            Send invite
          </Btn>
        </div>
        <p className="text-xs mt-2" style={{ color: muted }}>
          Super Admin: everything. Operations Manager: firms, operations, CA verification, support. Support Agent: view firms and billing, support tickets, refunds up to ₹5,000. Finance Manager: billing, refunds, exports, coupons.
        </p>
      </Panel>
      <Panel>
        <ErrorNote error={team.error} />
        {team.data && (
          <Table head={["Admin", "Role", "Two-step", "Last admin sign-in", "Live sessions", ""]} testId="team-table">
            {team.data.map((p) => (
              <tr key={p.userId}>
                <Td>
                  <b>{p.email}</b> {p.you && <span className="text-xs" style={{ color: muted }}>(you)</span>}
                </Td>
                <Td>
                  {p.you ? (
                    p.roles.map((r) => ROLE_LABEL[r as AdminRole] ?? r).join(", ")
                  ) : (
                    <select
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      value={ASSIGNABLE_ROLES.includes(p.roles[0] as AdminRole) ? p.roles[0] : ""}
                      onChange={(e) => void act(`role-${p.userId}`, () => adminSetRole({ data: { userId: p.userId, role: e.target.value as never } }), "Role changed. They have been signed out.")}
                      aria-label={`Role for ${p.email}`}
                    >
                      {!ASSIGNABLE_ROLES.includes(p.roles[0] as AdminRole) && <option value="">{p.roles.map((r) => ROLE_LABEL[r as AdminRole] ?? r).join(", ")}</option>}
                      {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                </Td>
                <Td><Pill tone={p.mfa ? "good" : "warn"}>{p.mfa ? "on" : "not set up"}</Pill></Td>
                <Td>{when(p.lastLoginAt)}<div className="text-xs font-mono" style={{ color: muted }}>{p.lastLoginIp ?? ""}</div></Td>
                <Td className="tabular-nums">{p.activeSessions}</Td>
                <Td>
                  {!p.you && (
                    <div className="flex gap-2">
                      <Btn disabled={busy !== null} testId={`revoke-${p.email}`} onClick={() => void act(`revoke-${p.userId}`, () => adminRevokeSessions({ data: { userId: p.userId } }), `${p.email} signed out everywhere.`)}>Sign out everywhere</Btn>
                      <Btn kind="danger" disabled={busy !== null} onClick={() => confirm(`Remove ${p.email}'s admin access and sign them out?`) && void act(`off-${p.userId}`, () => adminDeactivate({ data: { userId: p.userId } }), `${p.email} no longer has admin access.`)}>Deactivate</Btn>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
