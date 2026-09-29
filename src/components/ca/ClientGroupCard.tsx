/**
 * Shows where a client sits in its corporate group: the parent it rolls up to,
 * and the subsidiaries that roll up to it. Renders nothing for a standalone
 * entity so the overview stays clean.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import { CA, CACard } from "@/components/ca/portalUi";

interface Entity {
  id: string;
  client_name: string;
}

export default function ClientGroupCard({ firmId, clientId }: { firmId: string; clientId: string }) {
  const navigate = useNavigate();
  const [parent, setParent] = useState<Entity | null>(null);
  const [children, setChildren] = useState<Entity[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: self } = await supabase
        .from("ca_clients")
        .select("parent_id")
        .eq("id", clientId)
        .maybeSingle();

      const parentId = (self as { parent_id: string | null } | null)?.parent_id ?? null;

      const [parentRes, childRes] = await Promise.all([
        parentId
          ? supabase.from("ca_clients").select("id, client_name").eq("id", parentId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("ca_clients")
          .select("id, client_name")
          .eq("ca_firm_id", firmId)
          .eq("parent_id", clientId)
          .order("client_name", { ascending: true }),
      ]);

      if (!alive) return;
      setParent((parentRes.data as Entity | null) ?? null);
      setChildren(((childRes as { data: Entity[] | null }).data ?? []) as Entity[]);
    })();
    return () => {
      alive = false;
    };
  }, [firmId, clientId]);

  if (!parent && children.length === 0) return null;

  const go = (id: string) => navigate(`/ca/clients/${id}`);

  return (
    <CACard style={{ padding: "16px 18px", marginTop: 16 }}>
      <div
        style={{
          fontFamily: CA.sans,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: CA.faint,
          marginBottom: 10,
        }}
      >
        Group structure
      </div>

      {parent && (
        <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginBottom: children.length ? 10 : 0 }}>
          Part of group:{" "}
          <button
            type="button"
            onClick={() => go(parent.id)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: CA.teal, fontFamily: CA.sans, fontSize: 13, fontWeight: 600 }}
          >
            {parent.client_name}
          </button>
        </div>
      )}

      {children.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Subsidiaries:</span>
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(c.id)}
              style={{
                background: "rgba(26,26,26,0.03)",
                border: `0.5px solid ${CA.line}`,
                borderRadius: 999,
                padding: "4px 11px",
                cursor: "pointer",
                color: CA.ink,
                fontFamily: CA.sans,
                fontSize: 12.5,
              }}
            >
              {c.client_name}
            </button>
          ))}
        </div>
      )}
    </CACard>
  );
}
