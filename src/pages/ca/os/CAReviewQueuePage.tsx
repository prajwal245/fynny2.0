import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, caInputStyle, dateIN } from "@/components/ca/portalUi";
import { ConfidenceChip, ModuleHeader, PermissionNotice, QueueTable, StateChip, StatStrip } from "@/components/ca/os/primitives";
import {
  DOC_CLASS_LABELS,
  postExtraction,
  rejectExtraction,
  type CADocClass,
  type CAExtraction,
  type ExtractionRow,
} from "@/lib/caIntake";
import { signalOcrCorrection } from "@/lib/caBrainSignals";

const FIELDS: Record<string, string[]> = {
  bank: ["date", "description", "amount", "direction"],
  invoice: ["customer", "invoice_number", "amount", "date"],
  expense: ["vendor", "category", "amount", "date"],
};

export default function CAReviewQueuePage() {
  const { firmId } = useCAPortal();
  const { can, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();
  const [items, setItems] = useState<CAExtraction[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractionRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_document_extractions")
      .select("*")
      .eq("ca_firm_id", firmId)
      .in("review_state", ["needs_review", "auto_accepted", "failed"])
      .order("created_at", { ascending: true });
    setItems((data ?? []) as unknown as CAExtraction[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => items.find((i) => i.id === activeId) ?? null, [items, activeId]);

  useEffect(() => {
    if (!active) {
      setDraft([]);
      return;
    }
    const rows = active.corrected?.rows ?? active.extracted?.rows ?? [];
    setDraft(rows.map((r) => ({ ...r })));
  }, [active]);

  const nameFor = (id: string) => clients.find((c) => c.business_id === id)?.client_name ?? "Unknown client";

  const post = async () => {
    if (!active) return;
    setBusy(true);
    const res = await postExtraction(active, draft);
    setBusy(false);
    if (!res.ok) return toast.error(res.error ?? "Could not post");
    toast.success(`${res.posted} rows posted to the ledger`);
    void signalOcrCorrection(
      active.ca_firm_id,
      active.business_id,
      active.classification,
      active.confidence ?? null,
      draft.length,
    );
    setActiveId(null);
    void load();
  };

  const reject = async () => {
    if (!active) return;
    const reason = window.prompt("Why is this document being rejected?");
    if (!reason) return;
    const err = await rejectExtraction(active, reason);
    if (err) return toast.error(err);
    toast.success("Rejected and logged");
    setActiveId(null);
    void load();
  };

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Review queue" subtitle="Low-confidence extractions waiting for a human." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  const fields = active ? FIELDS[active.classification] ?? [] : [];

  return (
    <div>
      <ModuleHeader
        title="Review queue"
        subtitle="Anything the model was not sure about stops here. Correct the fields, then post — every posted row keeps a link back to its source document."
      />

      <StatStrip
        items={[
          { label: "In queue", value: String(items.length) },
          { label: "Needs review", value: String(items.filter((i) => i.review_state === "needs_review").length) },
          { label: "Failed extraction", value: String(items.filter((i) => i.review_state === "failed").length) },
        ]}
      />

      <CACard style={{ padding: 20, marginBottom: 20 }}>
        {items.length === 0 ? (
          <div style={{ padding: "28px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: CA.sans, fontSize: 14, fontWeight: 700, color: "#1F5A46", marginBottom: 6 }}>
              Review queue is clear
            </div>
            <p style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
              All extracted documents are either posted to the ledger or awaiting upload. High confidence extractions post automatically, only items that need a human check appear here.
            </p>
          </div>
        ) : (
          <QueueTable
            columns={["Received", "Client", "Document", "Class", "Rows", "Confidence", "State", ""]}
            empty="Queue is clear"
            emptyHint="Every extraction has been reviewed or auto-accepted."
            rows={items.map((i) => [
              dateIN(i.created_at),
              nameFor(i.business_id),
              i.original_filename ?? "—",
              DOC_CLASS_LABELS[i.classification as CADocClass] ?? i.classification,
              String((i.extracted?.rows ?? []).length),
              <ConfidenceChip key="c" value={i.confidence} />,
              <StateChip key="s" value={i.review_state} />,
              <CAButton key="o" variant="ghost" onClick={() => setActiveId(i.id === activeId ? null : i.id)}>
                {i.id === activeId ? "Close" : "Review"}
              </CAButton>,
            ])}
          />
        )}
      </CACard>


      {active && (
        <CACard style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink }}>{active.original_filename}</div>
              <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 3 }}>
                {nameFor(active.business_id)} · {DOC_CLASS_LABELS[active.classification as CADocClass] ?? active.classification}
              </div>
            </div>
            <ConfidenceChip value={active.confidence} />
          </div>

          {active.error_message && (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.red, marginBottom: 12 }}>{active.error_message}</div>
          )}

          {fields.length === 0 || draft.length === 0 ? (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>
              No extractable rows. Reclassify the document in the inbox or reject it with a reason.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th
                        key={f}
                        style={{
                          textAlign: "left",
                          fontFamily: CA.sans,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          color: CA.faint,
                          padding: "8px 6px",
                        }}
                      >
                        {f.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.map((r, i) => (
                    <tr key={i}>
                      {fields.map((f) => (
                        <td key={f} style={{ padding: "4px 6px" }}>
                          <input
                            style={{ ...caInputStyle, height: 34, fontSize: 13 }}
                            value={String(r[f] ?? "")}
                            onChange={(e) => {
                              const next = [...draft];
                              next[i] = { ...next[i], [f]: e.target.value };
                              setDraft(next);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <CAButton onClick={post} disabled={busy || draft.length === 0}>
              Confirm & post to ledger
            </CAButton>
            <CAButton variant="danger" onClick={reject}>
              Reject
            </CAButton>
          </div>
        </CACard>
      )}
    </div>
  );
}
