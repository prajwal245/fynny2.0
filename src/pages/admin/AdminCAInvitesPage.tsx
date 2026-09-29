import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Mail, RefreshCw, Search, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Firm = {
  id: string;
  firm_name: string;
  ca_name: string | null;
  email: string | null;
  plan_type: string | null;
  max_clients: number | null;
  is_active: boolean | null;
  verification_status: string | null;
  clients_used: number;
};

type Member = {
  id: string;
  ca_firm_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: string;
  status: string;
  created_at: string;
};

const FIRM_ROLES = [
  { value: "partner", label: "Partner", blurb: "Full firm control: clients, staff, filings." },
  { value: "manager", label: "Manager", blurb: "Manage clients and filings, invite staff." },
  { value: "staff", label: "Staff", blurb: "Work on assigned clients." },
  { value: "viewer", label: "Viewer", blurb: "Read-only access to firm dashboards." },
];

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid hsl(var(--fyn-gold) / 0.25)",
  borderRadius: 16,
  boxShadow: "0 8px 24px hsl(var(--fyn-ink) / 0.06)",
};
const body: React.CSSProperties = { fontFamily: "Inter, sans-serif", color: "hsl(var(--fyn-ink))" };
const inputStyle: React.CSSProperties = {
  ...body,
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid hsl(var(--fyn-gold) / 0.3)",
  background: "#FFFDF8",
  fontSize: 14,
};

function Pill({ text, tone }: { text: string; tone: string }) {
  return (
    <span
      style={{
        ...body,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${tone}44`,
        background: `${tone}14`,
        color: tone,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const statusTone = (s: string) =>
  s === "active" ? "#1F5A46" : s === "invited" ? "#8B6914" : "#6B6257";

export default function AdminCAInvitesPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // invite form
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [firmId, setFirmId] = useState("");
  const [firmName, setFirmName] = useState("");
  const [caName, setCaName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [quota, setQuota] = useState(25);
  const [sending, setSending] = useState(false);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("ca-firm-invite", { body: payload });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error ?? "Request failed");
    return data as Record<string, unknown>;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ op: "list" });
      setFirms((data.firms as Firm[]) ?? []);
      setMembers((data.members as Member[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load CA firms");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const selectedFirm = firms.find((f) => f.id === firmId);
  useEffect(() => {
    if (mode === "existing" && selectedFirm?.max_clients) setQuota(selectedFirm.max_clients);
  }, [mode, selectedFirm]);

  const firmName_ = useMemo(() => {
    const map: Record<string, string> = {};
    firms.forEach((f) => { map[f.id] = f.firm_name; });
    return map;
  }, [firms]);

  const filteredMembers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (m) =>
        (m.invited_email ?? "").toLowerCase().includes(term) ||
        (firmName_[m.ca_firm_id] ?? "").toLowerCase().includes(term),
    );
  }, [members, q, firmName_]);

  const sendInvite = async () => {
    if (!email.trim()) return toast.error("Enter the invitee's email.");
    if (mode === "existing" && !firmId) return toast.error("Pick a firm.");
    if (mode === "new" && !firmName.trim()) return toast.error("Enter the new firm's name.");
    setSending(true);
    try {
      await call({
        op: "invite",
        email: email.trim(),
        role,
        max_clients: quota,
        ...(mode === "existing"
          ? { ca_firm_id: firmId }
          : { firm_name: firmName.trim(), ca_name: caName.trim() }),
      });
      toast.success(
        mode === "new"
          ? `Firm created and invite sent to ${email.trim()}`
          : `Invite sent to ${email.trim()}`,
      );
      setEmail(""); setFirmName(""); setCaName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setSending(false);
    }
  };

  const resend = async (m: Member) => {
    try {
      await call({ op: "resend", member_id: m.id });
      toast.success(`Invite re-sent to ${m.invited_email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resend failed");
    }
  };

  const revoke = async (m: Member) => {
    if (!window.confirm(`Revoke access for ${m.invited_email ?? "this member"}?`)) return;
    try {
      await call({ op: "revoke", member_id: m.id });
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      toast.success("Access revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    }
  };

  const saveQuota = async (f: Firm, value: number) => {
    try {
      await call({ op: "quota", ca_firm_id: f.id, max_clients: value });
      setFirms((prev) => prev.map((x) => (x.id === f.id ? { ...x, max_clients: value } : x)));
      toast.success(`Quota for ${f.firm_name} set to ${value} clients`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quota update failed");
    }
  };

  const pendingCount = members.filter((m) => m.status === "invited").length;

  return (
    <div style={{ ...body, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, margin: 0 }}>
            CA Portal Invites
          </h1>
          <p style={{ ...body, fontSize: 14, opacity: 0.7, margin: "4px 0 0" }}>
            Invite users into a CA firm's portal with a role and a client quota.
          </p>
        </div>
        <button
          onClick={() => void load()}
          style={{ ...body, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: "1px solid hsl(var(--fyn-gold) / 0.35)", background: "#FFFFFF", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {[
          { label: "CA firms", value: firms.length, icon: Building2 },
          { label: "Portal users", value: members.length, icon: Users },
          { label: "Pending invites", value: pendingCount, icon: Mail },
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7, fontSize: 12 }}>
              <s.icon size={14} /> {s.label}
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Invite form */}
      <div style={{ ...card, padding: 20 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, margin: "0 0 14px" }}>
          Send an invite
        </h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                ...body,
                padding: "7px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${mode === m ? "#A93838" : "hsl(var(--fyn-gold) / 0.3)"}`,
                background: mode === m ? "#A9383814" : "#FFFFFF",
                color: mode === m ? "#A93838" : "hsl(var(--fyn-ink))",
              }}
            >
              {m === "existing" ? "Existing firm" : "New firm"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {mode === "existing" ? (
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              CA firm
              <select value={firmId} onChange={(e) => setFirmId(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
                <option value="">Select a firm…</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.firm_name} — {f.clients_used}/{f.max_clients ?? 0} clients
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Firm name
                <input value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Sharma & Associates" style={{ ...inputStyle, marginTop: 6 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Principal CA name
                <input value={caName} onChange={(e) => setCaName(e.target.value)} placeholder="CA Rohit Sharma" style={{ ...inputStyle, marginTop: 6 }} />
              </label>
            </>
          )}

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Invitee email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@firm.com" style={{ ...inputStyle, marginTop: 6 }} />
          </label>

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Role
            <select
              value={mode === "new" ? "partner" : role}
              disabled={mode === "new"}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...inputStyle, marginTop: 6, opacity: mode === "new" ? 0.6 : 1 }}
            >
              {FIRM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Client quota
            <input
              type="number"
              min={1}
              max={5000}
              value={quota}
              onChange={(e) => setQuota(Number(e.target.value))}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
        </div>

        <p style={{ ...body, fontSize: 12, opacity: 0.65, marginTop: 10 }}>
          {mode === "new"
            ? "A new firm is created with this quota and the invitee becomes its partner. Verification stays pending until documents are reviewed."
            : FIRM_ROLES.find((r) => r.value === role)?.blurb}
          {" "}Quota caps how many client businesses the firm can hold.
        </p>

        <button
          onClick={() => void sendInvite()}
          disabled={sending}
          style={{
            ...body,
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#A93838",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: 14,
            cursor: sending ? "not-allowed" : "pointer",
            opacity: sending ? 0.7 : 1,
          }}
        >
          <Send size={15} /> {sending ? "Sending…" : "Send invite"}
        </button>
      </div>

      {/* Firms & quotas */}
      <div style={{ ...card, padding: 20 }}>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, margin: "0 0 14px" }}>
          Firms & client quotas
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.65, fontSize: 12 }}>
                <th style={{ padding: "8px 6px" }}>Firm</th>
                <th style={{ padding: "8px 6px" }}>Plan</th>
                <th style={{ padding: "8px 6px" }}>Clients used</th>
                <th style={{ padding: "8px 6px" }}>Quota</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ padding: 16, opacity: 0.6 }}>Loading…</td></tr>
              )}
              {!loading && firms.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 16, opacity: 0.6 }}>No CA firms yet.</td></tr>
              )}
              {firms.map((f) => (
                <tr key={f.id} style={{ borderTop: "1px solid hsl(var(--fyn-gold) / 0.18)" }}>
                  <td style={{ padding: "10px 6px", fontWeight: 600 }}>
                    {f.firm_name}
                    <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>{f.email ?? "—"}</div>
                  </td>
                  <td style={{ padding: "10px 6px" }}>{f.plan_type ?? "—"}</td>
                  <td style={{ padding: "10px 6px", fontVariantNumeric: "tabular-nums" }}>
                    {f.clients_used} / {f.max_clients ?? 0}
                  </td>
                  <td style={{ padding: "10px 6px" }}>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      defaultValue={f.max_clients ?? 25}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isInteger(v) && v > 0 && v !== f.max_clients) void saveQuota(f, v);
                      }}
                      style={{ ...inputStyle, width: 90, padding: "5px 8px" }}
                    />
                  </td>
                  <td style={{ padding: "10px 6px" }}>
                    <Pill
                      text={f.verification_status ?? (f.is_active ? "active" : "inactive")}
                      tone={f.verification_status === "approved" ? "#1F5A46" : "#8B6914"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Members / invites */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, margin: 0 }}>
            Portal users & invites
          </h2>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 11, opacity: 0.5 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email or firm"
              style={{ ...inputStyle, paddingLeft: 30, width: 260 }}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.65, fontSize: 12 }}>
                <th style={{ padding: "8px 6px" }}>Email</th>
                <th style={{ padding: "8px 6px" }}>Firm</th>
                <th style={{ padding: "8px 6px" }}>Role</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>Invited</th>
                <th style={{ padding: "8px 6px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredMembers.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 16, opacity: 0.6 }}>No portal users yet.</td></tr>
              )}
              {filteredMembers.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid hsl(var(--fyn-gold) / 0.18)" }}>
                  <td style={{ padding: "10px 6px", fontWeight: 600 }}>{m.invited_email ?? "—"}</td>
                  <td style={{ padding: "10px 6px" }}>{firmName_[m.ca_firm_id] ?? "—"}</td>
                  <td style={{ padding: "10px 6px" }}>
                    <Pill text={FIRM_ROLES.find((r) => r.value === m.role)?.label ?? m.role} tone="#8B6914" />
                  </td>
                  <td style={{ padding: "10px 6px" }}><Pill text={m.status} tone={statusTone(m.status)} /></td>
                  <td style={{ padding: "10px 6px", opacity: 0.7 }}>
                    {new Date(m.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td style={{ padding: "10px 6px", display: "flex", gap: 8 }}>
                    <button
                      onClick={() => void resend(m)}
                      title="Resend invite"
                      style={{ ...body, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: "1px solid hsl(var(--fyn-gold) / 0.35)", background: "#FFFFFF", cursor: "pointer", fontSize: 12 }}
                    >
                      <Mail size={13} /> Resend
                    </button>
                    <button
                      onClick={() => void revoke(m)}
                      title="Revoke access"
                      style={{ ...body, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: "1px solid #A9383855", background: "#A9383810", color: "#A93838", cursor: "pointer", fontSize: 12 }}
                    >
                      <Trash2 size={13} /> Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
