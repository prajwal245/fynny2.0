/**
 * Communication settings — auto follow-up rules, WhatsApp status and
 * notification preferences for the firm.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import {
  CA, CACard, CAHeading, CAButton, CABadge, CAField, caInputStyle, caTh, caTd, CAEmpty,
} from "@/components/ca/portalUi";

interface Rule {
  id: string;
  rule_name: string;
  trigger_event: string;
  wait_days: number;
  action_type: string;
  escalate_to_role: string | null;
  is_active: boolean;
}

const NOTIF_TYPES: { key: string; label: string }[] = [
  { key: "compliance_7d", label: "Compliance deadline (7 days before)" },
  { key: "compliance_3d", label: "Compliance deadline (3 days before)" },
  { key: "document_overdue", label: "Document request overdue" },
  { key: "task_sla_breach", label: "Task SLA breached" },
  { key: "portal_activity", label: "Client portal activity" },
  { key: "exception_raised", label: "New exception raised" },
];

const TRIGGERS = [
  { value: "document_overdue", label: "Document request overdue" },
  { value: "compliance_overdue", label: "Compliance filing overdue" },
];

export default function CACommSettingsPage() {
  const { firmId } = useCAPortal();
  const [rules, setRules] = useState<Rule[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    rule_name: "", trigger_event: "document_overdue", wait_days: 3, action_type: "email", escalate_to_role: "",
  });

  const load = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    const [{ data: r, error }, { data: f }] = await Promise.all([
      supabase
        .from("ca_follow_up_rules")
        .select("id, rule_name, trigger_event, wait_days, action_type, escalate_to_role, is_active")
        .eq("ca_firm_id", firmId)
        .order("wait_days", { ascending: true }),
      supabase.from("ca_firms").select("notification_prefs").eq("id", firmId).maybeSingle(),
    ]);
    if (error) toast.error(error.message);
    setRules((r as Rule[]) ?? []);
    const stored = (f?.notification_prefs ?? {}) as Record<string, boolean>;
    const next: Record<string, boolean> = {};
    for (const t of NOTIF_TYPES) next[t.key] = stored[t.key] ?? true;
    setPrefs(next);
    setLoading(false);
  }, [firmId]);

  useEffect(() => { void load(); }, [load]);

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmId) return;
    if (!form.rule_name.trim()) return toast.error("Name the rule");
    const wait = Number(form.wait_days);
    if (!Number.isFinite(wait) || wait < 1 || wait > 30) return toast.error("Wait days must be between 1 and 30");
    setSaving(true);
    const { error } = await supabase.from("ca_follow_up_rules").insert({
      ca_firm_id: firmId,
      rule_name: form.rule_name.trim(),
      trigger_event: form.trigger_event,
      wait_days: wait,
      action_type: form.action_type,
      escalate_to_role: form.escalate_to_role || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Rule added");
    setForm({ rule_name: "", trigger_event: "document_overdue", wait_days: 3, action_type: "email", escalate_to_role: "" });
    setOpen(false);
    void load();
  };

  const toggleRule = async (rule: Rule) => {
    if (!firmId) return;
    const { error } = await supabase
      .from("ca_follow_up_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id)
      .eq("ca_firm_id", firmId);
    if (error) return toast.error(error.message);
    void load();
  };

  const savePrefs = async () => {
    if (!firmId) return;
    setSaving(true);
    const { error } = await supabase.from("ca_firms").update({ notification_prefs: prefs }).eq("id", firmId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Notification preferences saved");
  };

  return (
    <div style={{ maxWidth: 940 }}>
      <CAHeading>Communications</CAHeading>
      <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 6 }}>
        Automatic follow-ups, channels and what the firm gets notified about.
      </div>

      {/* Section 1 — auto follow-up rules */}
      <CACard style={{ marginTop: 20, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `0.5px solid ${CA.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>Auto follow-up rules</div>
          <CAButton onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Add rule"}</CAButton>
        </div>

        {open && (
          <form onSubmit={addRule} style={{ padding: 18, display: "grid", gap: 14, borderBottom: `0.5px solid ${CA.line}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
              <CAField label="Rule name">
                <input style={caInputStyle} value={form.rule_name} onChange={(e) => setForm((f) => ({ ...f, rule_name: e.target.value }))} placeholder="Second reminder — 7 days overdue" />
              </CAField>
              <CAField label="Trigger">
                <select style={caInputStyle as React.CSSProperties} value={form.trigger_event} onChange={(e) => setForm((f) => ({ ...f, trigger_event: e.target.value }))}>
                  {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </CAField>
              <CAField label="Wait days (1–30)">
                <input type="number" min={1} max={30} style={caInputStyle} value={form.wait_days} onChange={(e) => setForm((f) => ({ ...f, wait_days: Number(e.target.value) }))} />
              </CAField>
              <CAField label="Action">
                <select style={caInputStyle as React.CSSProperties} value={form.action_type} onChange={(e) => setForm((f) => ({ ...f, action_type: e.target.value }))}>
                  <option value="email">Email</option>
                  <option value="portal_only">Portal only</option>
                </select>
              </CAField>
              <CAField label="Escalate to">
                <select style={caInputStyle as React.CSSProperties} value={form.escalate_to_role} onChange={(e) => setForm((f) => ({ ...f, escalate_to_role: e.target.value }))}>
                  <option value="">No escalation</option>
                  <option value="partner">Partner</option>
                  <option value="manager">Manager</option>
                </select>
              </CAField>
            </div>
            <div><CAButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save rule"}</CAButton></div>
          </form>
        )}

        {loading ? (
          <div style={{ padding: 20, fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading rules…</div>
        ) : !rules.length ? (
          <CAEmpty title="No follow-up rules yet" hint="Add one and the chaser runs itself on schedule." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Rule name", "Trigger", "Wait days", "Action", "Escalate to", "Active"].map((h) => <th key={h} style={caTh}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...caTd, fontWeight: 600 }}>{r.rule_name}</td>
                  <td style={caTd}>{TRIGGERS.find((t) => t.value === r.trigger_event)?.label ?? r.trigger_event}</td>
                  <td style={{ ...caTd, fontFamily: CA.mono }}>{r.wait_days}</td>
                  <td style={caTd}>{r.action_type === "email" ? "Email" : "Portal only"}</td>
                  <td style={caTd}>{r.escalate_to_role ? <CABadge tone="amber">{r.escalate_to_role}</CABadge> : "—"}</td>
                  <td style={caTd}>
                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontFamily: CA.sans, fontSize: 12 }}>
                      <input type="checkbox" checked={r.is_active} onChange={() => void toggleRule(r)} aria-label={`Toggle ${r.rule_name}`} />
                      {r.is_active ? "Active" : "Paused"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CACard>

      {/* Section 2 — WhatsApp */}
      <CACard style={{ marginTop: 20, padding: 20 }}>
        <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>WhatsApp Business API</div>
        <div style={{ fontFamily: CA.sans, fontSize: 13, lineHeight: 1.6, color: CA.muted }}>
          WhatsApp Business API is available for CA firms processing 200+ messages/month. Contact{" "}
          <a href="mailto:support@fynhelp.com" style={{ color: CA.teal }}>support@fynhelp.com</a> to set up your
          WhatsApp Business account and template approvals. Until then, use the pre-filled WhatsApp link in the
          chaser queue.
        </div>
      </CACard>

      {/* Section 3 — notification preferences */}
      <CACard style={{ marginTop: 20, padding: 20 }}>
        <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Notification preferences</div>
        <div style={{ display: "grid", gap: 10 }}>
          {NOTIF_TYPES.map((t) => (
            <label key={t.key} style={{ display: "flex", gap: 10, alignItems: "center", fontFamily: CA.sans, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={prefs[t.key] ?? true}
                onChange={(e) => setPrefs((p) => ({ ...p, [t.key]: e.target.checked }))}
              />
              {t.label}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <CAButton onClick={() => void savePrefs()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save preferences"}
          </CAButton>
        </div>
      </CACard>
    </div>
  );
}
