import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, caInputStyle } from "@/components/ca/portalUi";
import { AuditTimeline, ModuleHeader, StatStrip } from "@/components/ca/os/primitives";

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor_role: string | null;
  business_id: string | null;
  detail: unknown;
}

export default function CAAuditTrailPage() {
  const { firmId } = useCAPortal();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [clientFilter, setClientFilter] = useState("");

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_audit_events")
      .select("id, action, entity_type, created_at, actor_role, business_id, detail")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as AuditRow[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((r) => !clientFilter || r.business_id === clientFilter);
  const today = rows.filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString()).length;

  return (
    <div>
      <ModuleHeader
        title="Audit trail"
        subtitle="Append-only record of every action taken inside the firm — who did it, to which client, and when. Nothing here can be edited or deleted."
      />

      <StatStrip
        items={[
          { label: "Events recorded", value: String(rows.length) },
          { label: "Today", value: String(today) },
          { label: "Clients touched", value: String(new Set(rows.map((r) => r.business_id).filter(Boolean)).size) },
        ]}
      />

      <CACard style={{ padding: 20 }}>
        <select
          style={{ ...caInputStyle, maxWidth: 260, marginBottom: 14 }}
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.business_id} value={c.business_id}>
              {c.client_name}
            </option>
          ))}
        </select>
        <AuditTimeline events={visible} />
        <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 12 }}>
          Showing the 200 most recent events.
        </div>
      </CACard>
    </div>
  );
}
