import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CATwoFactorCard from "@/components/ca/CATwoFactorCard";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import {
  CA, CACard, CAHeading, CAButton, CAField, caInputStyle, CABadge, statusTone,
  caTh, caTd, CAEmpty, dateIN,
} from "@/components/ca/portalUi";

type TabKey = "profile" | "team" | "security" | "plan" | "notifications";

const TABS: { key: TabKey; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "team", label: "Team" },
  { key: "security", label: "Security" },
  { key: "plan", label: "Plan & Usage" },
  { key: "notifications", label: "Notifications" },
];

const TEAM_ROLES = ["partner", "manager", "senior", "junior", "client"];
const INVITE_ROLES = ["partner", "manager", "senior", "junior"];

const PREF_KEYS: { key: string; label: string }[] = [
  { key: "compliance_7d", label: "Compliance deadline — 7 days before" },
  { key: "compliance_3d", label: "Compliance deadline — 3 days before" },
  { key: "compliance_0d", label: "Compliance deadline — day of" },
  { key: "doc_overdue", label: "Document request overdue" },
  { key: "task_sla", label: "Task SLA breached" },
  { key: "new_exception", label: "New exception raised" },
  { key: "client_activity", label: "Client portal activity" },
  { key: "mis_ready", label: "Monthly MIS ready" },
];

interface FirmRow {
  firm_name: string;
  ca_name: string;
  icai_membership_number: string;
  firm_registration_number: string;
  pan_number: string;
  years_of_practice: string;
  email: string;
  phone: string;
  whatsapp_phone: string;
  city: string;
  state: string;
  logo_url: string;
  specializations: string;
}

const EMPTY_FIRM: FirmRow = {
  firm_name: "", ca_name: "", icai_membership_number: "", firm_registration_number: "",
  pan_number: "", years_of_practice: "", email: "", phone: "", whatsapp_phone: "",
  city: "", state: "", logo_url: "", specializations: "",
};

interface Member {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  role: string;
  status: string | null;
  created_at: string;
  full_name?: string | null;
}

interface Rule {
  id: string;
  rule_name: string | null;
  trigger_event: string | null;
  wait_days: number | null;
  action_type: string | null;
  is_active: boolean | null;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink, marginBottom: 16 }}>
      {children}
    </div>
  );
}

export default function CASettingsPage() {
  const { firmId, userId, caRole, refresh } = useCAPortal();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("profile");

  const [firm, setFirm] = useState<FirmRow>(EMPTY_FIRM);
  const [baseline, setBaseline] = useState<FirmRow>(EMPTY_FIRM);
  const [plan, setPlan] = useState<{ plan_type: string; max_clients: number }>({ plan_type: "free", max_clients: 10 });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [invite, setInvite] = useState({ email: "", role: "junior" });
  const [inviting, setInviting] = useState(false);

  const [session, setSession] = useState<{ email: string; lastSignIn: string | null; createdAt: string | null }>({
    email: "", lastSignIn: null, createdAt: null,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isPartner = (caRole ?? "").toLowerCase() === "partner" || (caRole ?? "").toLowerCase() === "admin";

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const [{ data: f, error: fe }, { data: m }, { data: r }, { count }] = await Promise.all([
      supabase.from("ca_firms").select("*").eq("id", firmId).maybeSingle(),
      supabase.from("ca_firm_members")
        .select("id, user_id, invited_email, role, status, created_at")
        .eq("ca_firm_id", firmId).order("created_at", { ascending: true }),
      supabase.from("ca_follow_up_rules")
        .select("id, rule_name, trigger_event, wait_days, action_type, is_active")
        .eq("ca_firm_id", firmId).order("wait_days", { ascending: true }),
      supabase.from("ca_clients").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId),
    ]);
    if (fe) toast.error(fe.message);
    if (f) {
      const loaded: FirmRow = {
        firm_name: f.firm_name ?? "",
        ca_name: f.ca_name ?? "",
        icai_membership_number: f.icai_membership_number ?? f.membership_number ?? "",
        firm_registration_number: f.firm_registration_number ?? "",
        pan_number: f.pan_number ?? "",
        years_of_practice: f.years_of_practice != null ? String(f.years_of_practice) : "",
        email: f.email ?? "",
        phone: f.phone ?? "",
        whatsapp_phone: f.whatsapp_phone ?? "",
        city: f.city ?? "",
        state: f.state ?? "",
        logo_url: f.logo_url ?? "",
        specializations: Array.isArray(f.specializations) ? f.specializations.join(", ") : "",
      };
      setFirm(loaded);
      setBaseline(loaded);
      setPlan({ plan_type: f.plan_type ?? "free", max_clients: f.max_clients ?? 10 });
      setPrefs((f.notification_prefs as Record<string, boolean>) ?? {});
    }

    const rows = (m ?? []) as Member[];
    const userIds = rows.map((x) => x.user_id).filter(Boolean) as string[];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", userIds);
      const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p.full_name]));
      rows.forEach((row) => { row.full_name = row.user_id ? byId.get(row.user_id) ?? null : null; });
    }
    setMembers(rows);
    setRules((r ?? []) as Rule[]);
    setClientCount(count ?? 0);
    setLoading(false);
  }, [firmId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      if (u) setSession({ email: u.email ?? "", lastSignIn: u.last_sign_in_at ?? null, createdAt: u.created_at ?? null });
    })();
  }, []);

  const profileDirty = useMemo(
    () => (Object.keys(EMPTY_FIRM) as (keyof FirmRow)[]).some((k) => firm[k] !== baseline[k]),
    [firm, baseline],
  );

  /** Field-level checks that run on blur, so a preparer sees the problem early. */
  const validateField = (k: keyof FirmRow) => () => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[k];
      const v = firm[k].trim();
      if (k === "phone" && v && v.replace(/\D/g, "").length !== 10) next.phone = "Phone must be 10 digits";
      if (k === "whatsapp_phone" && v && v.replace(/\D/g, "").length !== 10)
        next.whatsapp_phone = "WhatsApp number must be 10 digits";
      if (k === "icai_membership_number" && v.length < 8)
        next.icai_membership_number = "ICAI membership number must be at least 8 characters";
      if (k === "email" && v && !isEmail(v)) next.email = "Enter a valid email address";
      return next;
    });
  };

  const set = (k: keyof FirmRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFirm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmId) return;
    const errs: Record<string, string> = {};
    if (firm.firm_name.trim().length < 3) errs.firm_name = "Firm name must be at least 3 characters";
    if (firm.icai_membership_number.trim().length < 8) errs.icai_membership_number = "ICAI membership number must be at least 8 characters";
    if (firm.phone.trim() && !/^\d{10}$/.test(firm.phone.replace(/\D/g, "").slice(-10)) ) errs.phone = "Phone must be 10 digits";
    if (firm.phone.trim() && firm.phone.replace(/\D/g, "").length !== 10) errs.phone = "Phone must be 10 digits";
    if (firm.email.trim() && !isEmail(firm.email)) errs.email = "Enter a valid email address";
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error("Please fix the highlighted fields");

    setSaving(true);
    const { error } = await supabase.from("ca_firms").update({
      firm_name: firm.firm_name.trim(),
      ca_name: firm.ca_name.trim() || null,
      icai_membership_number: firm.icai_membership_number.trim(),
      membership_number: firm.icai_membership_number.trim(),
      firm_registration_number: firm.firm_registration_number.trim() || null,
      pan_number: firm.pan_number.trim().toUpperCase() || null,
      years_of_practice: firm.years_of_practice ? Number(firm.years_of_practice) : null,
      email: firm.email.trim() || null,
      phone: firm.phone.trim() || null,
      whatsapp_phone: firm.whatsapp_phone.trim() || null,
      city: firm.city.trim() || null,
      state: firm.state.trim() || null,
      logo_url: firm.logo_url.trim() || null,
      specializations: firm.specializations.split(",").map((s) => s.trim()).filter(Boolean),
    }).eq("id", firmId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    setBaseline(firm);
    void refresh();
  };

  const changeRole = async (m: Member, next: string) => {
    const { error } = await supabase.from("ca_firm_members").update({ role: next }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    void load();
  };

  const deactivate = async (m: Member) => {
    if (m.user_id && m.user_id === userId) return toast.error("You cannot deactivate yourself");
    const { error } = await supabase.from("ca_firm_members").update({ status: "inactive" }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Member deactivated");
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
    void load();
  };

  const savePrefs = async () => {
    if (!firmId) return;
    setSavingPrefs(true);
    const { error } = await supabase.from("ca_firms").update({ notification_prefs: prefs }).eq("id", firmId);
    setSavingPrefs(false);
    if (error) return toast.error(error.message);
    toast.success("Notification preferences saved");
    void refresh();
  };

  const activeTeam = useMemo(() => members.filter((m) => (m.status ?? "") === "active").length, [members]);
  const usagePct = plan.max_clients > 0 ? Math.min(100, (clientCount / plan.max_clients) * 100) : 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <CAHeading>Settings</CAHeading>

      <div style={{ display: "flex", gap: 4, marginTop: 18, borderBottom: `0.5px solid ${CA.line}` }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontFamily: CA.sans, fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? CA.teal : CA.muted,
              padding: "10px 14px",
              borderBottom: tab === t.key ? `2px solid ${CA.teal}` : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <CACard style={{ marginTop: 18 }}><CAEmpty title="Loading…" /></CACard>
      ) : tab === "profile" ? (
        <CACard style={{ padding: 24, marginTop: 18 }}>
          <SectionTitle>Firm profile</SectionTitle>
          <form onSubmit={saveProfile} style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
                <CAField label="Firm name" error={errors.firm_name}>
                  <input style={caInputStyle} value={firm.firm_name} onChange={set("firm_name")} />
                </CAField>
                <CAField label="CA name"><input style={caInputStyle} value={firm.ca_name} onChange={set("ca_name")} /></CAField>
                <CAField label="ICAI membership number" error={errors.icai_membership_number}>
                  <input style={caInputStyle} value={firm.icai_membership_number} onChange={set("icai_membership_number")} onBlur={validateField("icai_membership_number")} />
                </CAField>
                <CAField label="Firm registration number">
                  <input style={caInputStyle} value={firm.firm_registration_number} onChange={set("firm_registration_number")} />
                </CAField>
                <CAField label="PAN number"><input style={caInputStyle} value={firm.pan_number} onChange={set("pan_number")} /></CAField>
                <CAField label="Years of practice">
                  <input style={caInputStyle} type="number" min={0} value={firm.years_of_practice} onChange={set("years_of_practice")} />
                </CAField>
              </div>

              <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
                <CAField label="Email" error={errors.email}>
                  <input style={caInputStyle} value={firm.email} onChange={set("email")} onBlur={validateField("email")} />
                </CAField>
                <CAField label="Phone" error={errors.phone}>
                  <input style={caInputStyle} value={firm.phone} onChange={set("phone")} onBlur={validateField("phone")} />
                </CAField>
                <CAField label="WhatsApp phone" error={errors.whatsapp_phone}>
                  <input style={caInputStyle} value={firm.whatsapp_phone} onChange={set("whatsapp_phone")} onBlur={validateField("whatsapp_phone")} />
                </CAField>
                <CAField label="City"><input style={caInputStyle} value={firm.city} onChange={set("city")} /></CAField>
                <CAField label="State"><input style={caInputStyle} value={firm.state} onChange={set("state")} /></CAField>
                <CAField label="Logo URL">
                  <input style={caInputStyle} value={firm.logo_url} onChange={set("logo_url")} placeholder="https://…" />
                </CAField>
                {firm.logo_url.trim() && (
                  <img
                    src={firm.logo_url}
                    alt="Firm logo preview"
                    style={{ maxHeight: 56, maxWidth: 180, objectFit: "contain", border: `0.5px solid ${CA.line}`, borderRadius: 8, padding: 6, background: "#fff" }}
                  />
                )}
                <CAField label="Specializations (comma separated)">
                  <input style={caInputStyle} value={firm.specializations} onChange={set("specializations")} placeholder="GST, Audit, Taxation" />
                </CAField>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {firm.specializations.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                    <CABadge key={s} tone="teal">{s}</CABadge>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CAButton type="submit" disabled={saving || !profileDirty}>{saving ? "Saving…" : "Save profile"}</CAButton>
              {!profileDirty && !saving && (
                <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint }}>No unsaved changes</span>
              )}
            </div>
          </form>
        </CACard>
      ) : tab === "team" ? (
        <CACard style={{ marginTop: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `0.5px solid ${CA.line}`, fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>
            Team members
          </div>
          {members.length === 0 ? (
            <CAEmpty title="No team members yet — invite your first colleague below." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={caTh}>Name / Email</th>
                  <th style={caTh}>Role</th>
                  <th style={caTh}>Status</th>
                  <th style={caTh}>Joined</th>
                  <th style={caTh} />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={caTd}>
                      <div style={{ fontWeight: 600 }}>{m.full_name ?? m.invited_email ?? "—"}</div>
                      {m.full_name && <div style={{ fontSize: 12, color: CA.muted }}>{m.invited_email}</div>}
                    </td>
                    <td style={caTd}>
                      {isPartner ? (
                        <select
                          style={{ ...caInputStyle, height: 34, width: 130 }}
                          value={m.role}
                          onChange={(e) => changeRole(m, e.target.value)}
                        >
                          {TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <CABadge tone="teal">{m.role}</CABadge>
                      )}
                    </td>
                    <td style={caTd}><CABadge tone={statusTone(m.status)}>{m.status ?? "—"}</CABadge></td>
                    <td style={caTd}>{dateIN(m.created_at)}</td>
                    <td style={{ ...caTd, textAlign: "right" }}>
                      {isPartner && m.status !== "inactive" && m.user_id !== userId && (
                        <CAButton variant="danger" onClick={() => deactivate(m)} style={{ padding: "6px 12px" }}>
                          Deactivate
                        </CAButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={sendInvite} style={{ padding: 20, display: "flex", gap: 12, alignItems: "end", borderTop: `0.5px solid ${CA.line}` }}>
            <div style={{ flex: 1 }}>
              <CAField label="Invite team member">
                <input
                  style={caInputStyle}
                  value={invite.email}
                  onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                  placeholder="colleague@cafirm.com"
                />
              </CAField>
            </div>
            <div style={{ width: 160 }}>
              <CAField label="Role">
                <select style={caInputStyle as React.CSSProperties} value={invite.role} onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}>
                  {INVITE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </CAField>
            </div>
            <CAButton type="submit" disabled={inviting} style={{ height: 42 }}>
              {inviting ? "Sending…" : "Send invite"}
            </CAButton>
          </form>
        </CACard>
      ) : tab === "security" ? (
        <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
          <CACard style={{ padding: 24 }}>
            <SectionTitle>Session</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, fontFamily: CA.sans }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>Signed in as</div>
                <div style={{ fontSize: 14, color: CA.ink, marginTop: 5 }}>{session.email || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>Last sign in</div>
                <div style={{ fontSize: 14, color: CA.ink, marginTop: 5 }}>{dateIN(session.lastSignIn)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>Account created</div>
                <div style={{ fontSize: 14, color: CA.ink, marginTop: 5 }}>{dateIN(session.createdAt)}</div>
              </div>
            </div>
          </CACard>

          <CATwoFactorCard
            firmId={firmId}
            canManageFirm={caRole === "partner" || caRole === "manager" || caRole === "admin"}
          />

          <CACard style={{ padding: 24, border: `0.5px solid rgba(179,38,30,0.35)` }}>
            <SectionTitle>Danger zone</SectionTitle>
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginBottom: 14 }}>
              Deleting your firm account removes every client, document and filing record we hold for you.
            </div>
            <CAButton variant="danger" onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}>
              Delete firm account
            </CAButton>
          </CACard>

          {deleteOpen && (
            <div
              style={{
                position: "fixed", inset: 0, background: "rgba(26,26,26,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
              }}
              onClick={() => setDeleteOpen(false)}
            >
              <CACard style={{ padding: 24, width: 440 }} >
                <div onClick={(e) => e.stopPropagation()}>
                  <SectionTitle>Confirm deletion</SectionTitle>
                  <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginBottom: 14 }}>
                    Type your firm name <strong style={{ color: CA.ink }}>{firm.firm_name}</strong> to continue.
                  </div>
                  <input
                    style={caInputStyle}
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={firm.firm_name}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                    <CAButton variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</CAButton>
                    <CAButton
                      variant="danger"
                      disabled={deleteConfirm.trim() !== firm.firm_name.trim() || !firm.firm_name.trim()}
                      onClick={() => {
                        toast.info("Account deletion requires manual review. Please email support@fynhelp.com with your firm name and reason.");
                        setDeleteOpen(false);
                      }}
                    >
                      Request deletion
                    </CAButton>
                  </div>
                </div>
              </CACard>
            </div>
          )}
        </div>
      ) : tab === "plan" ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <CACard style={{ padding: 20 }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>Current plan</div>
              <div style={{ marginTop: 10 }}><CABadge tone="teal">{plan.plan_type}</CABadge></div>
              <a
                href="mailto:support@fynhelp.com"
                style={{ display: "inline-block", marginTop: 16, fontFamily: CA.sans, fontSize: 13, fontWeight: 600, color: CA.teal, textDecoration: "none" }}
              >
                Talk to us →
              </a>
            </CACard>

            <CACard style={{ padding: 20 }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>Clients</div>
              <div style={{ fontFamily: CA.mono, fontSize: 24, fontWeight: 700, color: CA.ink, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                {clientCount} <span style={{ fontSize: 14, color: CA.muted }}>/ {plan.max_clients}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: CA.line, marginTop: 12, overflow: "hidden" }}>
                <div style={{ width: `${usagePct}%`, height: "100%", background: usagePct > 80 ? CA.red : CA.teal }} />
              </div>
            </CACard>

            <CACard style={{ padding: 20 }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>Team</div>
              <div style={{ fontFamily: CA.mono, fontSize: 24, fontWeight: 700, color: CA.ink, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                {activeTeam}
              </div>
              <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 6 }}>Active members</div>
            </CACard>
          </div>

          <CACard style={{ marginTop: 18, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={caTh}>Feature</th>
                  <th style={caTh}>Included</th>
                  <th style={caTh}>Your plan</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Clients", `Up to ${plan.max_clients}`],
                  ["Team members", "Unlimited"],
                  ["AI features", "Included"],
                  ["Priority support", "Professional only"],
                ].map(([feature, included]) => (
                  <tr key={feature}>
                    <td style={caTd}>{feature}</td>
                    <td style={caTd}>{included}</td>
                    <td style={caTd}><CABadge tone="teal">{plan.plan_type}</CABadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CACard>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
          <CACard style={{ padding: 24 }}>
            <SectionTitle>Alert preferences</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {PREF_KEYS.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: CA.sans, fontSize: 13, color: CA.ink, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!prefs[key]}
                    onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                    style={{ accentColor: CA.teal, width: 16, height: 16 }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <CAButton onClick={savePrefs} disabled={savingPrefs}>{savingPrefs ? "Saving…" : "Save preferences"}</CAButton>
            </div>
          </CACard>

          <CACard style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `0.5px solid ${CA.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>Alert schedule</div>
              <button
                onClick={() => navigate("/ca/settings/communications")}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: CA.sans, fontSize: 13, fontWeight: 600, color: CA.teal }}
              >
                Manage rules →
              </button>
            </div>
            {rules.length === 0 ? (
              <CAEmpty title="No follow-up rules yet" hint="Create rules under Communications." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={caTh}>Rule</th>
                    <th style={caTh}>Trigger</th>
                    <th style={caTh}>Wait days</th>
                    <th style={caTh}>Action</th>
                    <th style={caTh}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td style={caTd}>{r.rule_name ?? "—"}</td>
                      <td style={caTd}>{r.trigger_event ?? "—"}</td>
                      <td style={caTd}>{r.wait_days ?? "—"}</td>
                      <td style={caTd}>{r.action_type ?? "—"}</td>
                      <td style={caTd}>
                        <CABadge tone={r.is_active ? "green" : "grey"}>{r.is_active ? "Active" : "Paused"}</CABadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CACard>
        </div>
      )}
    </div>
  );
}
