import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { toast } from "sonner";
import {
  CA, CACard, CAHeading, CAButton, CAField, caInputStyle, CABadge, statusTone,
  caTh, caTd, dateIN, CAEmpty,
} from "@/components/ca/portalUi";
import { CustomFieldInput, type FieldDef } from "@/components/ca/ClientProfilePanel";

interface Invitation {
  id: string;
  invited_email: string;
  client_name: string | null;
  access_level: string | null;
  status: string | null;
  token: string;
  created_at: string | null;
  expires_at: string | null;
}

const ENTITY_TYPES = [
  "Private Limited", "Public Limited", "One Person Company", "LLP", "Partnership Firm",
  "Sole Proprietorship", "Section 8 Company", "Nidhi Company", "Producer Company",
  "HUF", "Trust", "Society",
];

const EMPTY = {
  clientName: "", clientEmail: "", gstin: "", pan: "", phone: "", accessLevel: "read", notes: "",
  entityType: "Private Limited", entitySubtype: "", cin: "", llpin: "",
  incorporationDate: "", dpiitNumber: "", udyamNumber: "", groupId: "", ownershipPct: "", parentId: "",
};

export default function CAAddClientPage() {
  const { firmId, firmName, userId } = useCAPortal();
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [parents, setParents] = useState<{ id: string; client_name: string }[]>([]);


  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const loadInvites = useCallback(async () => {
    if (!firmId) return;
    setLoadingInvites(true);
    const { data, error } = await supabase
      .from("ca_client_invitations")
      .select("id, invited_email, client_name, access_level, status, token, created_at, expires_at")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setInvites((data as Invitation[]) ?? []);
    setLoadingInvites(false);
  }, [firmId]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  useEffect(() => {
    if (!firmId) return;
    (async () => {
      const [defsRes, groupsRes, parentsRes] = await Promise.all([
        supabase.from("ca_custom_field_defs")
          .select("id, field_key, label, field_type, options, is_required, sort_order")
          .eq("ca_firm_id", firmId).eq("is_active", true).order("sort_order"),
        supabase.from("ca_entity_groups").select("id, name").eq("ca_firm_id", firmId).order("name"),
        supabase.from("ca_clients").select("id, client_name")
          .eq("ca_firm_id", firmId).eq("is_demo", false).order("client_name"),
      ]);
      setDefs((defsRes.data as FieldDef[]) ?? []);
      setGroups((groupsRes.data as { id: string; name: string }[]) ?? []);
      setParents((parentsRes.data as { id: string; client_name: string }[]) ?? []);
    })();

  }, [firmId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.clientName.trim()) e.clientName = "Client name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail)) e.clientEmail = "Enter a valid email address";
    if (form.gstin && !/^[0-9A-Z]{15}$/.test(form.gstin.toUpperCase())) e.gstin = "GSTIN must be 15 characters";
    if (form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.toUpperCase())) e.pan = "PAN format: AAAAA9999A";
    if (form.ownershipPct.trim()) {
      const pct = Number(form.ownershipPct);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) e.ownershipPct = "Ownership % must be between 0 and 100";
    }
    for (const d of defs) {
      if (d.is_required && !(customValues[d.id] ?? "").trim()) e[d.id] = `${d.label} is required`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!firmId || !validate()) return;
    setSaving(true);
    try {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: invErr } = await supabase.from("ca_client_invitations").insert({
        ca_firm_id: firmId,
        invited_email: form.clientEmail.trim().toLowerCase(),
        client_name: form.clientName.trim(),
        access_level: form.accessLevel,
        token,
        status: "pending",
        notes: form.notes.trim() || null,
        sent_by: userId,
        expires_at: expiresAt,
      });
      if (invErr) throw invErr;

      const { data: insertedClient, error: clientErr } = await supabase.from("ca_clients").insert({
        ca_firm_id: firmId,
        client_name: form.clientName.trim(),
        client_email: form.clientEmail.trim().toLowerCase(),
        client_phone: form.phone.trim() || null,
        gstin: form.gstin.trim().toUpperCase() || null,
        pan: form.pan.trim().toUpperCase() || null,
        entity_type: form.entityType,
        entity_subtype: form.entitySubtype.trim() || null,
        cin: form.cin.trim().toUpperCase() || null,
        llpin: form.llpin.trim().toUpperCase() || null,
        incorporation_date: form.incorporationDate || null,
        dpiit_number: form.dpiitNumber.trim() || null,
        udyam_number: form.udyamNumber.trim() || null,
        notes: form.notes.trim() || null,
        client_status: "pending",
        is_demo: false,
        group_id: form.groupId || null,
        parent_id: form.parentId || null,

        ownership_pct: form.ownershipPct.trim() ? Number(form.ownershipPct) : null,
      }).select("id").single();
      if (clientErr) throw clientErr;

      const customRows = defs
        .filter((d) => (customValues[d.id] ?? "").trim())
        .map((d) => ({
          ca_firm_id: firmId,
          client_id: insertedClient.id as string,
          field_id: d.id,
          value: customValues[d.id],
        }));
      if (customRows.length) {
        const { error: cfErr } = await supabase.from("ca_custom_field_values").insert(customRows);
        if (cfErr) toast.warning(`Client saved, but custom fields failed: ${cfErr.message}`);
      }

      const acceptUrl = `${window.location.origin}/ca/invite/accept?token=${token}`;
      const { error: mailErr } = await supabase.functions.invoke("ca-send-email", {
        body: {
          kind: "client_invite",
          ca_firm_id: firmId,
          to: form.clientEmail.trim().toLowerCase(),
          client_name: form.clientName.trim(),
          access_level: form.accessLevel,
          accept_url: acceptUrl,
        },
      });

      if (mailErr) {
        toast.warning(`Client saved, but the invitation email failed: ${mailErr.message}`);
      } else {
        toast.success(
          `Invitation sent to ${form.clientEmail.trim()} — ${form.accessLevel} access, expires ${dateIN(expiresAt)}`,
        );
      }

      setForm({ ...EMPTY });
      setCustomValues({});
      loadInvites();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add client");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("ca_client_invitations").update({ status: "expired" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitation revoked");
    loadInvites();
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <CAHeading>Add client</CAHeading>
      <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 6 }}>
        Invite a business to share financial access with {firmName ?? "your firm"}.
      </p>

      <CACard style={{ padding: 24, marginTop: 20 }}>
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <CAField label="Client name" error={errors.clientName}>
              <input style={caInputStyle} value={form.clientName} onChange={set("clientName")} placeholder="Sharma Textiles Pvt Ltd" />
            </CAField>
            <CAField label="Client email" error={errors.clientEmail}>
              <input style={caInputStyle} type="email" value={form.clientEmail} onChange={set("clientEmail")} placeholder="owner@client.com" />
            </CAField>
            <CAField label="GSTIN" error={errors.gstin}>
              <input style={caInputStyle} value={form.gstin} onChange={set("gstin")} placeholder="29ABCDE1234F1Z5" />
            </CAField>
            <CAField label="PAN" error={errors.pan}>
              <input style={caInputStyle} value={form.pan} onChange={set("pan")} placeholder="ABCDE1234F" />
            </CAField>
            <CAField label="Entity type">
              <select style={caInputStyle as any} value={form.entityType} onChange={set("entityType")} required>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </CAField>
            <CAField label="Entity subtype">
              <input style={caInputStyle} value={form.entitySubtype} onChange={set("entitySubtype")} placeholder="e.g. Small Company, MSME Micro" />
            </CAField>
            <CAField label="CIN">
              <input style={caInputStyle} value={form.cin} onChange={set("cin")} placeholder="U12345KA2024PTC123456" />
            </CAField>
            <CAField label="LLPIN">
              <input style={caInputStyle} value={form.llpin} onChange={set("llpin")} placeholder="AAA-1234, for LLPs only" />
            </CAField>
            <CAField label="Incorporation date">
              <input style={caInputStyle} type="date" value={form.incorporationDate} onChange={set("incorporationDate")} />
            </CAField>
            <CAField label="DPIIT number">
              <input style={caInputStyle} value={form.dpiitNumber} onChange={set("dpiitNumber")} placeholder="DIPP12345" />
            </CAField>
            <CAField label="Udyam number">
              <input style={caInputStyle} value={form.udyamNumber} onChange={set("udyamNumber")} placeholder="UDYAM-KA-01-0000001" />
            </CAField>
            <CAField label="Phone">
              <input style={caInputStyle} value={form.phone} onChange={set("phone")} placeholder="9876543210" />
            </CAField>
            <CAField label="Access level">
              <select style={caInputStyle as any} value={form.accessLevel} onChange={set("accessLevel")}>
                <option value="read">Read only</option>
                <option value="full">Full access</option>
              </select>
            </CAField>
            <CAField label="Entity group">
              <select style={caInputStyle as React.CSSProperties} value={form.groupId} onChange={set("groupId")}>
                <option value="">Not part of a group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </CAField>
            <CAField label="Parent entity">
              <select style={caInputStyle as React.CSSProperties} value={form.parentId} onChange={set("parentId")}>
                <option value="">No parent entity</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.client_name}</option>)}
              </select>
            </CAField>

            <CAField label="Ownership %" error={errors.ownershipPct}>
              <input style={caInputStyle} type="number" min={0} max={100} step="0.01"
                value={form.ownershipPct} onChange={set("ownershipPct")} placeholder="e.g. 100" />
            </CAField>
            {defs.map((d) => (
              <CAField key={d.id} label={d.label + (d.is_required ? " *" : "")} error={errors[d.id]}>
                <CustomFieldInput
                  def={d}
                  value={customValues[d.id] ?? ""}
                  onChange={(v) => setCustomValues((s) => ({ ...s, [d.id]: v }))}
                />
              </CAField>
            ))}
          </div>
          <CAField label="Notes">
            <textarea
              style={{ ...caInputStyle, height: 84, padding: 12, resize: "vertical" }}
              value={form.notes}
              onChange={set("notes")}
              placeholder="Internal notes about this client"
            />
          </CAField>
          <div>
            <CAButton type="submit" disabled={saving || !firmId}>
              {saving ? "Sending invitation…" : "Add client & send invitation"}
            </CAButton>
          </div>
        </form>
      </CACard>

      <CACard style={{ marginTop: 24, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `0.5px solid ${CA.line}`, fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>
          Invitations
        </div>
        {loadingInvites ? (
          <CAEmpty title="Loading invitations…" />
        ) : invites.length === 0 ? (
          <CAEmpty title="No invitations yet" hint="Invitations you send appear here." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={caTh}>Client</th>
                <th style={caTh}>Email</th>
                <th style={caTh}>Access</th>
                <th style={caTh}>Status</th>
                <th style={caTh}>Sent</th>
                <th style={caTh}>Expires</th>
                <th style={caTh} />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td style={caTd}>{i.client_name ?? "—"}</td>
                  <td style={caTd}>{i.invited_email}</td>
                  <td style={caTd}>{i.access_level ?? "read"}</td>
                  <td style={caTd}><CABadge tone={statusTone(i.status)}>{i.status ?? "pending"}</CABadge></td>
                  <td style={caTd}>{dateIN(i.created_at)}</td>
                  <td style={caTd}>{dateIN(i.expires_at)}</td>
                  <td style={{ ...caTd, textAlign: "right" }}>
                    {i.status === "pending" && (
                      <CAButton variant="danger" onClick={() => revoke(i.id)} style={{ padding: "6px 12px", fontSize: 12 }}>
                        Revoke
                      </CAButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CACard>
    </div>
  );
}
