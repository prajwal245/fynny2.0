import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, RotateCcw, RefreshCw, X, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type RoleUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  roles: string[];
};

const ROLE_CATALOG: { role: string; label: string; blurb: string; tone: string }[] = [
  { role: "super_admin", label: "Super Admin", blurb: "Full platform control, including role management. Grant sparingly.", tone: "#A93838" },
  { role: "admin", label: "Admin", blurb: "Broad admin access without CEO view or role management.", tone: "#A93838" },
  { role: "ops_admin", label: "Ops Admin", blurb: "Day-to-day operations: users, billing, content, approvals.", tone: "#8B6914" },
  { role: "support_agent", label: "Support Agent", blurb: "Support tickets and user lookups only.", tone: "#8B6914" },
  { role: "analyst", label: "Analyst", blurb: "Read-only analytics and monitoring dashboards.", tone: "#1F5A46" },
  { role: "blog_admin", label: "Blog Admin", blurb: "Blog authoring and publishing.", tone: "#1F5A46" },
  { role: "intern", label: "Intern", blurb: "Limited content assistance. Lowest elevated role.", tone: "#1F5A46" },
  { role: "moderator", label: "Moderator", blurb: "Community moderation.", tone: "#1F5A46" },
  { role: "user", label: "User", blurb: "Standard product access. No admin surface.", tone: "#6B6257" },
];

const HIGH_RISK = new Set(["super_admin", "admin"]);
const label = (r: string) => ROLE_CATALOG.find((c) => c.role === r)?.label ?? r;
const tone = (r: string) => ROLE_CATALOG.find((c) => c.role === r)?.tone ?? "#6B6257";

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid hsl(var(--fyn-gold) / 0.25)",
  borderRadius: 16,
  boxShadow: "0 8px 24px hsl(var(--fyn-ink) / 0.06)",
};
const body: React.CSSProperties = { fontFamily: "Inter, sans-serif", color: "hsl(var(--fyn-ink))" };

function RolePill({ role }: { role: string }) {
  return (
    <span
      style={{
        ...body,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${tone(role)}44`,
        background: `${tone(role)}14`,
        color: tone(role),
        whiteSpace: "nowrap",
      }}
    >
      {label(role)}
    </span>
  );
}

export default function AdminRolesPage() {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyAdmins, setOnlyAdmins] = useState(true);
  const [editing, setEditing] = useState<RoleUser | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-roles", { body: payload });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error ?? "Request failed");
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ op: "list" });
      setUsers(data.users as RoleUser[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users
      .filter((u) => (onlyAdmins ? u.roles.some((r) => r !== "user") : true))
      .filter((u) => (term ? u.email.toLowerCase().includes(term) : true))
      .sort((a, b) => b.roles.length - a.roles.length || a.email.localeCompare(b.email));
  }, [users, q, onlyAdmins]);

  const superCount = users.filter((u) => u.roles.includes("super_admin")).length;

  const openEditor = (u: RoleUser) => { setEditing(u); setDraft([...u.roles]); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const data = await call({ op: "set", user_id: editing.id, roles: draft });
      setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, roles: data.roles } : u)));
      toast.success(`Roles updated for ${editing.email}`);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const resetLeastPrivilege = async (u: RoleUser) => {
    if (!window.confirm(`Revoke all elevated roles for ${u.email}? They will keep standard product access only.`)) return;
    try {
      await call({ op: "reset", user_id: u.id });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roles: [] } : x)));
      toast.success("Reset to least privilege");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 28, color: "hsl(var(--fyn-ink))", margin: 0 }}>
            Roles &amp; Permissions
          </h1>
          <p style={{ ...body, fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)", marginTop: 6 }}>
            View and edit role assignments. Defaults are least-privilege: users get no elevated role until one is granted.
          </p>
        </div>
        <button
          onClick={() => void load()}
          style={{ ...body, display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid hsl(var(--fyn-gold) / 0.35)", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {superCount <= 1 && (
        <div style={{ ...body, ...card, display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", marginBottom: 16, fontSize: 13, borderColor: "#A9383844", background: "#A9383810" }}>
          <AlertTriangle size={16} style={{ color: "#A93838", flexShrink: 0 }} />
          Only one super admin exists. The last super admin role cannot be removed.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 12, color: "hsl(var(--fyn-ink) / 0.4)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email…"
            style={{ ...body, width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: "1px solid hsl(var(--fyn-gold) / 0.3)", background: "#fff", fontSize: 13 }}
          />
        </div>
        <button
          onClick={() => setOnlyAdmins((v) => !v)}
          style={{ ...body, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid hsl(var(--fyn-gold) / 0.35)", background: onlyAdmins ? "#171208" : "#fff", color: onlyAdmins ? "#fff" : "hsl(var(--fyn-ink))" }}
        >
          {onlyAdmins ? "Showing role holders" : "Showing all users"}
        </button>
      </div>

      <div style={{ ...card, overflow: "hidden", marginBottom: 26 }}>
        {loading ? (
          <div style={{ ...body, padding: 28, fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>Loading users…</div>
        ) : filtered.length === 0 ? (
          <div style={{ ...body, padding: 28, fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)" }}>No users match this view.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "hsl(var(--fyn-gold) / 0.08)" }}>
                {["User", "Roles", "Last sign-in", ""].map((h) => (
                  <th key={h} style={{ ...body, textAlign: "left", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "hsl(var(--fyn-ink) / 0.55)", padding: "11px 16px", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid hsl(var(--fyn-gold) / 0.18)" }}>
                  <td style={{ ...body, padding: "12px 16px", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{u.email || "(no email)"}</div>
                    {!u.email_confirmed && (
                      <div style={{ fontSize: 11, color: "#A93838", marginTop: 2 }}>Email unconfirmed</div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {u.roles.length === 0
                        ? <span style={{ ...body, fontSize: 12, color: "hsl(var(--fyn-ink) / 0.5)" }}>No elevated role</span>
                        : u.roles.map((r) => <RolePill key={r} role={r} />)}
                    </div>
                  </td>
                  <td style={{ ...body, padding: "12px 16px", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)", whiteSpace: "nowrap" }}>
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Never"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => openEditor(u)}
                      style={{ ...body, background: "#C41E1E", color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginRight: 8 }}
                    >
                      Edit roles
                    </button>
                    {u.roles.length > 0 && (
                      <button
                        onClick={() => void resetLeastPrivilege(u)}
                        title="Reset to least privilege"
                        style={{ ...body, background: "#fff", border: "1px solid hsl(var(--fyn-gold) / 0.35)", borderRadius: 9, padding: "7px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <RotateCcw size={13} /> Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ShieldCheck size={17} style={{ color: "#8B6914" }} />
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, margin: 0, color: "hsl(var(--fyn-ink))" }}>
            Least-privilege reference
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          {ROLE_CATALOG.map((r) => (
            <div key={r.role} style={{ border: "1px solid hsl(var(--fyn-gold) / 0.22)", borderRadius: 12, padding: 14 }}>
              <RolePill role={r.role} />
              <p style={{ ...body, fontSize: 12.5, color: "hsl(var(--fyn-ink) / 0.65)", margin: "8px 0 0" }}>{r.blurb}</p>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div
          onClick={() => !saving && setEditing(null)}
          style={{ position: "fixed", inset: 0, background: "hsl(var(--fyn-ink) / 0.45)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "min(560px, 100%)", padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 20, margin: 0, color: "hsl(var(--fyn-ink))" }}>Edit roles</h3>
                <p style={{ ...body, fontSize: 13, color: "hsl(var(--fyn-ink) / 0.6)", margin: "4px 0 0" }}>{editing.email}</p>
              </div>
              <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--fyn-ink) / 0.5)" }}><X size={18} /></button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {ROLE_CATALOG.map((r) => {
                const on = draft.includes(r.role);
                return (
                  <button
                    key={r.role}
                    onClick={() => setDraft((d) => (on ? d.filter((x) => x !== r.role) : [...d, r.role]))}
                    style={{
                      ...body, textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
                      border: `1px solid ${on ? tone(r.role) : "hsl(var(--fyn-gold) / 0.25)"}`,
                      background: on ? `${tone(r.role)}0F` : "#fff",
                      borderRadius: 11, padding: "11px 13px",
                    }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? tone(r.role) : "hsl(var(--fyn-ink) / 0.25)"}`, background: on ? tone(r.role) : "transparent", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                      {on && <Check size={12} color="#fff" />}
                    </span>
                    <span>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</span>
                      {HIGH_RISK.has(r.role) && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#A93838", marginLeft: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>High risk</span>
                      )}
                      <span style={{ display: "block", fontSize: 12, color: "hsl(var(--fyn-ink) / 0.6)", marginTop: 2 }}>{r.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {draft.some((r) => HIGH_RISK.has(r)) && (
              <div style={{ ...body, display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#A93838", marginTop: 14 }}>
                <AlertTriangle size={14} /> High-risk roles selected. Grant only when the person needs full control.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setDraft([])}
                style={{ ...body, background: "#fff", border: "1px solid hsl(var(--fyn-gold) / 0.35)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Least privilege
              </button>
              <button
                disabled={saving}
                onClick={() => void save()}
                style={{ ...body, background: "#C41E1E", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
