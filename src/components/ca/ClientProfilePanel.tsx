/**
 * Client 360 — profile panel.
 *
 * Surfaces the two Client OS pieces that live outside the core client row:
 *  - entity group membership (group + ownership %)
 *  - firm-defined custom fields, stored per client record
 *
 * Custom values are keyed by `client_id` so they work before the client has
 * linked a live business; legacy values keyed by `business_id` are still read.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logCAAudit } from "@/lib/caAudit";
import { CA, CACard, CAButton, CAField, caInputStyle, CAEmpty } from "@/components/ca/portalUi";

export interface FieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  options: unknown;
  is_required: boolean;
  sort_order: number;
}

export function optionList(options: unknown): string[] {
  if (Array.isArray(options)) return options.map((o) => String(o));
  return [];
}

export function CustomFieldInput({
  def, value, onChange,
}: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  if (def.field_type === "select") {
    return (
      <select style={caInputStyle as React.CSSProperties} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {optionList(def.options).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (def.field_type === "boolean") {
    return (
      <select style={caInputStyle as React.CSSProperties} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  return (
    <input
      style={caInputStyle}
      type={def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

interface Props {
  firmId: string;
  clientId: string;
  businessId: string | null;
}

export default function ClientProfilePanel({ firmId, clientId, businessId }: Props) {
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [ownership, setOwnership] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [defsRes, groupsRes, clientRes] = await Promise.all([
      supabase.from("ca_custom_field_defs")
        .select("id, field_key, label, field_type, options, is_required, sort_order")
        .eq("ca_firm_id", firmId).eq("is_active", true).order("sort_order"),
      supabase.from("ca_entity_groups").select("id, name").eq("ca_firm_id", firmId).order("name"),
      supabase.from("ca_clients").select("group_id, ownership_pct").eq("id", clientId).maybeSingle(),
    ]);

    let q = supabase.from("ca_custom_field_values").select("field_id, value").eq("ca_firm_id", firmId);
    q = businessId
      ? q.or(`client_id.eq.${clientId},business_id.eq.${businessId}`)
      : q.eq("client_id", clientId);
    const valuesRes = await q;

    setDefs((defsRes.data as FieldDef[]) ?? []);
    setGroups((groupsRes.data as { id: string; name: string }[]) ?? []);
    setGroupId((clientRes.data?.group_id as string | null) ?? "");
    setOwnership(clientRes.data?.ownership_pct != null ? String(clientRes.data.ownership_pct) : "");
    const map: Record<string, string> = {};
    for (const row of valuesRes.data ?? []) map[row.field_id as string] = (row.value as string | null) ?? "";
    setValues(map);
    setLoading(false);
  }, [firmId, clientId, businessId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const pct = ownership.trim() === "" ? null : Number(ownership);
      if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
        throw new Error("Ownership % must be between 0 and 100");
      }
      const { error: clientErr } = await supabase.from("ca_clients")
        .update({ group_id: groupId || null, ownership_pct: pct })
        .eq("id", clientId);
      if (clientErr) throw clientErr;

      for (const def of defs) {
        const value = values[def.id] ?? "";
        const { data: existing } = await supabase.from("ca_custom_field_values")
          .select("id").eq("ca_firm_id", firmId).eq("field_id", def.id).eq("client_id", clientId).maybeSingle();
        if (existing?.id) {
          const { error } = await supabase.from("ca_custom_field_values")
            .update({ value: value || null, updated_at: new Date().toISOString() }).eq("id", existing.id);
          if (error) throw error;
        } else if (value) {
          const { error } = await supabase.from("ca_custom_field_values").insert({
            ca_firm_id: firmId, client_id: clientId, business_id: businessId, field_id: def.id, value,
          });
          if (error) throw error;
        }
      }

      await logCAAudit({
        firmId, businessId: businessId ?? undefined, entityType: "client",
        action: "client_profile_updated", detail: { client_id: clientId, group_id: groupId || null },
      });
      toast.success("Client profile saved");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save client profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CACard style={{ padding: 20, marginTop: 16 }}>
      <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Client profile</div>
      {loading ? (
        <CAEmpty title="Loading profile…" />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <CAField label="Entity group">
              <select style={caInputStyle as React.CSSProperties} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Not part of a group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </CAField>
            <CAField label="Ownership %">
              <input style={caInputStyle} type="number" min={0} max={100} step="0.01"
                value={ownership} onChange={(e) => setOwnership(e.target.value)} placeholder="e.g. 100" />
            </CAField>
            {defs.map((d) => (
              <CAField key={d.id} label={d.label + (d.is_required ? " *" : "")}>
                <CustomFieldInput
                  def={d}
                  value={values[d.id] ?? ""}
                  onChange={(v) => setValues((s) => ({ ...s, [d.id]: v }))}
                />
              </CAField>
            ))}
          </div>
          {defs.length === 0 && (
            <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint, marginTop: 10 }}>
              No custom fields defined yet — add them under Master data → Custom fields.
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <CAButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Save profile"}</CAButton>
          </div>
        </>
      )}
    </CACard>
  );
}
