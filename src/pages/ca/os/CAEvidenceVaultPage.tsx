import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, caInputStyle, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, QueueTable, StatStrip } from "@/components/ca/os/primitives";
import { DOC_CLASS_LABELS, type CADocClass } from "@/lib/caIntake";

interface DocRow {
  id: string;
  business_id: string;
  original_filename: string;
  storage_path: string;
  document_type: string;
  filing_period: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

export default function CAEvidenceVaultPage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CAVaultPage mounted"); }, []);
  const { firmId } = useCAPortal();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [filter, setFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_client_documents")
      .select("id, business_id, original_filename, storage_path, document_type, filing_period, file_size_bytes, created_at")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data ?? []) as DocRow[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameFor = (id: string) => clients.find((c) => c.business_id === id)?.client_name ?? "Unknown client";

  const openDoc = async (r: DocRow) => {
    if (!r.storage_path) return toast.error("No file stored for this record");
    const { data, error } = await supabase.storage.from("ca-client-documents").createSignedUrl(r.storage_path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Could not open document");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const visible = rows.filter(
    (r) =>
      (!clientFilter || r.business_id === clientFilter) &&
      (!filter || r.original_filename.toLowerCase().includes(filter.toLowerCase())),
  );

  const totalMb = rows.reduce((s, r) => s + (r.file_size_bytes ?? 0), 0) / 1_000_000;

  return (
    <div>
      <ModuleHeader
        title="Evidence vault"
        subtitle="Every file collected for every client, stored privately and retrievable through short-lived signed links."
      />

      <StatStrip
        items={[
          { label: "Documents", value: String(rows.length) },
          { label: "Clients covered", value: String(new Set(rows.map((r) => r.business_id)).size) },
          { label: "Stored", value: `${totalMb.toFixed(1)} MB` },
        ]}
      />

      <CACard style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <select style={{ ...caInputStyle, maxWidth: 240 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>
                {c.client_name}
              </option>
            ))}
          </select>
          <input style={{ ...caInputStyle, maxWidth: 280 }} placeholder="Search filename" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>

        <QueueTable
          columns={["Stored", "Client", "File", "Type", "Period", ""]}
          empty="Nothing in the vault yet"
          emptyHint="Documents uploaded through the intake inbox or the client portal appear here."
          rows={visible.map((r) => [
            dateIN(r.created_at),
            nameFor(r.business_id),
            <span key="f" style={{ fontWeight: 600 }}>
              {r.original_filename}
            </span>,
            DOC_CLASS_LABELS[r.document_type as CADocClass] ?? r.document_type,
            r.filing_period ?? "—",
            r.storage_path ? (
              <CAButton key="o" variant="ghost" onClick={() => openDoc(r)}>
                Open
              </CAButton>
            ) : (
              <span key="o" style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>No file</span>
            ),
          ])}
        />
        <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 12 }}>
          Links expire after five minutes and are never public.
        </div>
      </CACard>
    </div>
  );
}
