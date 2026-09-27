import { useEffect, useState } from "react";
import { Mail, Plus } from "lucide-react";
import { Card, PageHeader } from "./AdminDashboardPage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const TABS = ["Profile", "Admin Team", "Security", "Email Templates", "Notifications"] as const;
type Tab = typeof TABS[number];

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("Profile");

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage admin portal configuration" />

      <div className="grid gap-6 lg:grid-cols-[240px,1fr]">
        {/* Vertical tabs */}
        <Card style={{ padding: 16, alignSelf: "start" }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                className="block w-full text-left mb-2"
                style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: active ? "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)" : "transparent",
                  color: active ? "#fff" : "rgba(23,18,8,0.65)",
                  fontFamily: "Raleway, sans-serif", fontWeight: 500, fontSize: 15,
                  border: "none", cursor: "pointer",
                }}
              >{t}</button>
            );
          })}
        </Card>

        <Card style={{ padding: 32, minHeight: 600 }}>
          {tab === "Profile" && <ProfileTab />}
          {tab === "Admin Team" && <AdminTeamTab />}
          {tab === "Security" && <SecurityTab />}
          {tab === "Email Templates" && <EmailTemplatesTab />}
          {tab === "Notifications" && <NotificationsTab />}
        </Card>
      </div>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>{title}</h3>
      {subtitle && <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}>{subtitle}</p>}
    </div>
  );
}

function ProfileTab() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");
      setName((user?.user_metadata as { name?: string; full_name?: string } | undefined)?.name
           ?? (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? "");
    })();
  }, []);

  const updateProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({ data: { name, full_name: name } });
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
  };

  const changePassword = async () => {
    if (pwd.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pwd !== pwd2) { toast.error("Passwords do not match"); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) { toast.error(error.message); return; }
    setPwd(""); setPwd2("");
    toast.success("Password changed");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 48, padding: "0 14px", borderRadius: 12,
    border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
    fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))", outline: "none",
  };

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading title="Your Profile" subtitle="Update your name. Email is managed by your account provider." />
        <div className="grid gap-4 max-w-md">
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>Email</span>
            <input value={email} disabled style={{ ...inputStyle, background: "rgba(23,18,8,0.04)", color: "hsl(var(--fyn-ink) / 0.6)" }} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>Display Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
          </label>
          <button onClick={updateProfile} disabled={savingProfile}
            style={{ height: 44, padding: "0 18px", borderRadius: 12, background: "linear-gradient(135deg,#C41E1E,#8B6914)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, opacity: savingProfile ? 0.6 : 1, justifySelf: "start" }}>
            {savingProfile ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </section>

      <section>
        <SectionHeading title="Change Password" subtitle="Choose a strong password (8+ characters)." />
        <div className="grid gap-4 max-w-md">
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>New Password</span>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>Confirm New Password</span>
            <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </label>
          <button onClick={changePassword} disabled={savingPwd}
            style={{ height: 44, padding: "0 18px", borderRadius: 12, background: "linear-gradient(135deg,#C41E1E,#8B6914)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, opacity: savingPwd ? 0.6 : 1, justifySelf: "start" }}>
            {savingPwd ? "Updating…" : "Change Password"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminTeamTab() {
  const [rows, setRows] = useState<{ user_id: string; name: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("support_agent");
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["super_admin", "admin", "ops_admin", "support_agent", "analyst"]);
    const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("user_id, full_name, display_name").in("user_id", ids)
      : { data: [] as { user_id: string; full_name: string | null; display_name: string | null }[] };
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const merged = (roleRows ?? []).map((r) => {
      const p = profMap.get(r.user_id);
      return {
        user_id: r.user_id,
        name: p?.display_name || p?.full_name || "-",
        email: "",
        role: r.role,
      };
    });
    setRows(merged);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const inviteAdmin = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) { toast.error("Valid email required"); return; }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("new-admin-invite", {
        body: { email, role: inviteRole },
      });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "admin_invited",
          target_type: "user",
          target_id: data?.user_id ?? null,
          details: { email, role: inviteRole },
        });
      }
      toast.success("Admin invitation sent");
      setShowInvite(false);
      setInviteEmail("");
      load();
    } catch (err) {
      console.error("Invite error:", err);
      toast.error((err as Error).message || "Failed to invite admin");
    } finally {
      setInviting(false);
    }
  };

  return (
    <div>
      <SectionHeading title="Admin Users" subtitle="Team members with admin access to this portal" />
      <div className="overflow-x-auto" style={{ borderRadius: 12, border: "1px solid rgba(23,18,8,0.08)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(23,18,8,0.04)" }}>
              {["Name","User ID","Role","Actions"].map((h) => (
                <th key={h} style={{ padding: 14, textAlign: "left", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} style={{ ...cell, textAlign: "center", color: "hsl(var(--fyn-ink) / 0.5)" }}>Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} style={{ ...cell, textAlign: "center", color: "hsl(var(--fyn-ink) / 0.5)" }}>No admins yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={`${r.user_id}-${r.role}`} style={{ background: i % 2 ? "rgba(244,237,218,0.3)" : "#fff", borderTop: "1px solid rgba(23,18,8,0.06)" }}>
                <td style={cell}>{r.name}</td>
                <td style={{ ...cell, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{r.user_id.slice(0, 8)}…</td>
                <td style={cell}>{r.role}</td>
                <td style={cell}>
                  <button onClick={() => toast.info("Edit role from User Management page")} style={linkBtn("#8B6914")}>Edit Role</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={() => setShowInvite(true)} className="mt-6 inline-flex items-center gap-2"
        style={{
          height: 44, padding: "0 18px", borderRadius: 12,
          background: "linear-gradient(135deg, #C41E1E 0%, #8B6914 100%)",
          color: "#fff", border: "none", cursor: "pointer",
          fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14,
        }}>
        <Plus size={16} /> Add Admin
      </button>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(23,18,8,0.5)" }} onClick={() => setShowInvite(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: "hsl(var(--fyn-ink))", marginBottom: 16 }}>Invite Admin</h3>
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Email</label>
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@fynhelp.com"
              style={{ width: "100%", height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(23,18,8,0.15)", marginBottom: 14, fontFamily: "Roboto, sans-serif", fontSize: 14 }} />
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
              style={{ width: "100%", height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(23,18,8,0.15)", marginBottom: 18, fontFamily: "Roboto, sans-serif", fontSize: 14, background: "#fff" }}>
              <option value="support_agent">Support Agent</option>
              <option value="analyst">Analyst</option>
              <option value="ops_admin">Ops Admin</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInvite(false)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(23,18,8,0.15)", background: "transparent", cursor: "pointer", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={inviteAdmin} disabled={inviting} style={{ padding: "10px 18px", borderRadius: 10, background: "linear-gradient(135deg,#C41E1E,#8B6914)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 14, opacity: inviting ? 0.6 : 1 }}>
                {inviting ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityTab() {
  const [mfa, setMfa] = useState(false);
  const [allow, setAllow] = useState(false);
  return (
    <div className="space-y-10">
      <section>
        <SectionHeading title="Multi-Factor Authentication" />
        <ToggleRow label="Require MFA for all admins" sub="2 of 3 admins have enabled MFA" on={mfa} onChange={setMfa} />
      </section>

      <section>
        <SectionHeading title="Active Admin Sessions" />
        <div className="overflow-x-auto" style={{ borderRadius: 12, border: "1px solid rgba(23,18,8,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(23,18,8,0.04)" }}>
                {["Admin","IP","Device","Login","Last Activity","Actions"].map((h) => (
                  <th key={h} style={{ padding: 14, textAlign: "left", fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 13, color: "hsl(var(--fyn-ink))" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { a: "Tarun", ip: "103.x.x.x", d: "Chrome / macOS", l: "May 5, 14:35", la: "2 min ago" },
                { a: "Fynny", ip: "103.y.y.y", d: "Safari / iOS", l: "May 5, 09:20", la: "1 hour ago" },
              ].map((r, i) => (
                <tr key={r.ip} style={{ background: i % 2 ? "rgba(244,237,218,0.3)" : "#fff", borderTop: "1px solid rgba(23,18,8,0.06)" }}>
                  <td style={cell}>{r.a}</td>
                  <td style={cell}>{r.ip}</td>
                  <td style={cell}>{r.d}</td>
                  <td style={cell}>{r.l}</td>
                  <td style={cell}>{r.la}</td>
                  <td style={cell}><button onClick={() => toast.info("Revoke session coming in Part 4")} style={linkBtn("#C41E1E")}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading title="IP Allowlist" subtitle="Restrict admin access to specific IP addresses" />
        <ToggleRow label="Enable IP Allowlist" on={allow} onChange={setAllow} />
      </section>
    </div>
  );
}

function EmailTemplatesTab() {
  const items = [
    ["Welcome Email", "Sent to new users after signup"],
    ["Trial Ending", "Sent 3 days before free trial ends"],
    ["Payment Failed", "Sent when payment fails"],
    ["Password Reset", "Sent when user requests password reset"],
    ["Subscription Upgraded", "Sent when user upgrades plan"],
  ];
  return (
    <div>
      <SectionHeading title="Email Templates" subtitle="Customize automated emails sent to users" />
      <div className="space-y-3">
        {items.map(([name, desc]) => (
          <div key={name}
            className="flex items-center justify-between"
            style={{
              background: "rgba(139,105,20,0.05)",
              border: "1px solid rgba(139,105,20,0.15)",
              borderRadius: 12, padding: 20,
            }}>
            <div className="flex items-start gap-3">
              <Mail size={22} color="#8B6914" />
              <div>
                <div style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 16, color: "hsl(var(--fyn-ink))" }}>{name}</div>
                <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>{desc}</div>
              </div>
            </div>
            <button onClick={() => toast.info("Email template editor coming in Part 4")} style={{
              height: 38, padding: "0 16px", borderRadius: 10, background: "transparent",
              border: "2px solid #8B6914", color: "#8B6914",
              fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    signups: false, payments: true, tickets: true, errors: true,
  });
  const [slack, setSlack] = useState("");
  const items: { key: keyof typeof prefs; label: string; sub: string }[] = [
    { key: "signups", label: "New User Signups", sub: "Notify when a new user creates an account" },
    { key: "payments", label: "Payment Failures", sub: "Notify when a payment fails" },
    { key: "tickets", label: "New Support Tickets", sub: "Notify when a user creates a ticket" },
    { key: "errors", label: "Critical Errors", sub: "Notify when system errors occur" },
  ];
  return (
    <div className="space-y-10">
      <section>
        <SectionHeading title="Email Notifications" subtitle="Choose which admin notifications to receive via email" />
        <div>
          {items.map((it) => (
            <ToggleRow key={it.key} label={it.label} sub={it.sub}
              on={prefs[it.key]} onChange={(v) => setPrefs((p) => ({ ...p, [it.key]: v }))} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Slack Notifications" />
        <label style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>
          Slack Webhook URL
        </label>
        <input value={slack} onChange={(e) => setSlack(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          style={{
            width: "100%", height: 52, padding: "0 14px", borderRadius: 12,
            border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
            fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))", outline: "none",
          }}
        />
        <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.55)", marginTop: 6 }}>
          Paste your Slack webhook URL to send notifications to a channel.
        </p>
        <button onClick={() => toast.info("Test notification coming in Part 4")} className="mt-4"
          style={{
            height: 44, padding: "0 18px", borderRadius: 12, background: "transparent",
            border: "2px solid #8B6914", color: "#8B6914",
            fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>Send Test Notification</button>
      </section>
    </div>
  );
}

function ToggleRow({ label, sub, on, onChange }:
  { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between"
      style={{ padding: "16px 0", borderBottom: "1px solid rgba(23,18,8,0.05)" }}>
      <div>
        <div style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 15, color: "hsl(var(--fyn-ink))" }}>{label}</div>
        {sub && <div style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.55)" }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!on)}
        aria-pressed={on}
        style={{
          width: 56, height: 32, borderRadius: 999, position: "relative", border: "none", cursor: "pointer",
          background: on ? "linear-gradient(135deg,#C41E1E,#8B6914)" : "rgba(23,18,8,0.15)",
          transition: "background 0.25s ease",
        }}>
        <span style={{
          position: "absolute", top: 4, left: on ? 28 : 4, width: 24, height: 24,
          borderRadius: "50%", background: "#fff",
          transition: "left 0.25s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "14px 16px", fontFamily: "Roboto, sans-serif", fontSize: 14,
  color: "hsl(var(--fyn-ink) / 0.85)", verticalAlign: "middle",
};

const linkBtn = (color: string): React.CSSProperties => ({
  background: "transparent", border: "none", color, cursor: "pointer",
  fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, padding: 0,
});
