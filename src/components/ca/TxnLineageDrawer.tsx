/**
 * Data lineage for a posted number.
 *
 * Every canonical transaction carries either a `source_reference`
 * (`<provider>:<id>` written by a sync job) or a `source_document_id`
 * (written when a document was extracted and posted). This drawer resolves
 * whichever is present back to its origin so a CA can answer "where did this
 * number come from?" without leaving the client.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CA, CACard, CABadge, dateIN, inr } from "@/components/ca/portalUi";

export interface LineageTxn {
  id: string;
  date: string | null;
  description: string | null;
  amount: number | null;
  type: string | null;
  category: string | null;
  source_reference: string | null;
  source_document_id: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  zoho_books: "Zoho Books",
  razorpay: "Razorpay",
  manual: "Manual entry",
  csv: "CSV import",
};

export function sourceLabel(t: { source_reference: string | null; source_document_id: string | null }): string {
  if (t.source_document_id) return "Document";
  if (!t.source_reference) return "Manual";
  const provider = t.source_reference.split(":")[0] ?? "";
  return PROVIDER_LABELS[provider] ?? provider;
}

interface Job {
  id: string;
  source_system: string;
  status: string;
  records_synced: number | null;
  completed_at: string | null;
  created_at: string;
}

interface Doc {
  id: string;
  original_filename: string | null;
  document_type: string | null;
  filing_period: string | null;
  created_at: string | null;
}

export default function TxnLineageDrawer({
  firmId, businessId, txn, onClose,
}: { firmId: string; businessId: string; txn: LineageTxn; onClose: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const provider = txn.source_reference?.split(":")[0] ?? null;
      if (provider) {
        const { data } = await supabase
          .from("ca_sync_jobs")
          .select("id, source_system, status, records_synced, completed_at, created_at")
          .eq("ca_firm_id", firmId)
          .eq("business_id", businessId)
          .eq("source_system", provider)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setJob((data as Job) ?? null);
      }
      if (txn.source_document_id) {
        const { data } = await supabase
          .from("ca_client_documents")
          .select("id, original_filename, document_type, filing_period, created_at")
          .eq("id", txn.source_document_id)
          .maybeSingle();
        if (!cancelled) setDoc((data as Doc) ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [firmId, businessId, txn]);

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: `0.5px solid ${CA.line}` }}>
      <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.faint }}>{label}</span>
      <span style={{ fontFamily: CA.sans, fontSize: 13, color: CA.ink, textAlign: "right" }}>{value}</span>
    </div>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.35)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}
    >
      <CACard
        style={{ width: 420, height: "100%", borderRadius: 0, padding: 24, overflowY: "auto" }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700 }}>Where this number came from</div>
            <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: CA.muted }}>
              <X size={18} />
            </button>
          </div>

          <CABadge tone="teal">{sourceLabel(txn)}</CABadge>

          <div style={{ marginTop: 16 }}>
            <Row label="Description" value={txn.description ?? "—"} />
            <Row label="Date" value={dateIN(txn.date)} />
            <Row label="Amount" value={inr(txn.amount)} />
            <Row label="Direction" value={txn.type ?? "—"} />
            <Row label="Category" value={txn.category ?? "—"} />
            <Row label="Source reference" value={txn.source_reference ?? "—"} />
          </div>

          {loading ? (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 18 }}>Resolving source…</div>
          ) : (
            <>
              {job && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontFamily: CA.serif, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Sync job</div>
                  <Row label="Source system" value={PROVIDER_LABELS[job.source_system] ?? job.source_system} />
                  <Row label="Status" value={job.status} />
                  <Row label="Records in run" value={job.records_synced != null ? String(job.records_synced) : "—"} />
                  <Row label="Finished" value={dateIN(job.completed_at ?? job.created_at)} />
                </div>
              )}
              {doc && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontFamily: CA.serif, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Source document</div>
                  <Row label="File" value={doc.original_filename ?? "—"} />
                  <Row label="Type" value={doc.document_type ?? "—"} />
                  <Row label="Period" value={doc.filing_period ?? "—"} />
                  <Row label="Uploaded" value={dateIN(doc.created_at)} />
                </div>
              )}
              {!job && !doc && (
                <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 18, lineHeight: 1.6 }}>
                  No sync job or document is linked to this row — it was entered manually or imported before
                  lineage tracking was switched on.
                </div>
              )}
            </>
          )}
        </div>
      </CACard>
    </div>
  );
}
