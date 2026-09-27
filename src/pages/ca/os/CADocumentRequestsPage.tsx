import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, caInputStyle, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, QueueTable, StateChip, StatStrip } from "@/components/ca/os/primitives";
import { DOC_CLASS_LABELS, type CADocClass } from "@/lib/caIntake";
import { logCAAudit } from "@/lib/caAudit";

interface RequestRow {
  id: string;
  business_id: string;
  title: string;
  doc_types: string[];
  period: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

const CLASSES: CADocClass[] = ["bank", "invoice", "expense", "challan", "other"];

export default function CADocumentRequestsPage() {
  const { firmId } = useCAPortal();
  const { can, role } = useCARole();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ business_id: "", title: "", period: "", due_date: "", types: ["bank"] as string[] });
  const [busy, setBusy] = useState(false);

  const [autoMatched, setAutoMatched] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_document_requests")
      .select("id, business_id, title, doc_types, period, due_date, status, created_at")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as RequestRow[]);

    const { data: matches } = await supabase
      .from("ca_client_documents")
      .select("matched_request_id")
      .eq("ca_firm_id", firmId)
      .eq("auto_matched", true)
      .not("matched_request_id", "is", null);
    const map: Record<string, boolean> = {};
    for (const m of (matches ?? []) as any[]) if (m.matched_request_id) map[m.matched_request_id] = true;
    setAutoMatched(map);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);


  const nameFor = (id: string) => clients.find((c) => c.business_id === id)?.client_name ?? "Unknown client";

  const create = async () => {
    if (!firmId || !form.business_id || !form.title.trim()) {
      toast.error("Pick a client and give the request a title");
      return;
    }
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("ca_document_requests")
      .insert({
        ca_firm_id: firmId,
        business_id: form.business_id,
        title: form.title.trim(),
        doc_types: form.types,
        period: form.period || null,
        due_date: form.due_date || null,
        requested_by: userRes?.user?.id ?? null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logCAAudit({
      firmId,
      businessId: form.business_id,
      entityType: "document_request",
      entityId: data.id,
      action: "request_raised",
      actorRole: role,
      detail: { title: form.title, types: form.types, period: form.period },
    });
    toast.success("Request raised — the client sees it in their portal");
    setOpen(false);
    setForm({ business_id: "", title: "", period: "", due_date: "", types: ["bank"] });
    void load();
  };

  const closeRequest = async (r: RequestRow) => {
    const { error } = await supabase
      .from("ca_document_requests")
      .update({ status: "closed", fulfilled_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    await logCAAudit({ firmId: firmId!, businessId: r.business_id, entityType: "document_request", entityId: r.id, action: "request_closed", actorRole: role });
    void load();
  };

  const openCount = rows.filter((r) => r.status === "open").length;
  const overdue = rows.filter((r) => r.status === "open" && r.due_date && new Date(r.due_date) < new Date()).length;

  return (
    <div>
      <ModuleHeader
        title="Document requests"
        subtitle="Ask a client for exactly what you need, with a period and a due date. Everything they send lands in the intake inbox."
        right={can("process") ? <CAButton onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "New request"}</CAButton> : undefined}
      />

      <StatStrip
        items={[
          { label: "Open requests", value: String(openCount) },
          { label: "Overdue", value: String(overdue) },
          { label: "Total raised", value: String(rows.length) },
        ]}
      />

      {open && (
        <CACard style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <select style={caInputStyle} value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.business_id} value={c.business_id}>
                  {c.client_name}
                </option>
              ))}
            </select>
            <input style={caInputStyle} placeholder="What are you asking for?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input style={caInputStyle} placeholder="Period e.g. 2026-07" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            <input style={caInputStyle} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {CLASSES.map((c) => {
              const active = form.types.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, types: active ? form.types.filter((t) => t !== c) : [...form.types, c] })
                  }
                  style={{
                    fontFamily: CA.sans,
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                    border: `0.5px solid ${active ? CA.teal : CA.line}`,
                    background: active ? CA.tealSoft : "#fff",
                    color: active ? CA.teal : CA.ink,
                  }}
                >
                  {DOC_CLASS_LABELS[c]}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <CAButton onClick={create} disabled={busy}>
              Raise request
            </CAButton>
          </div>
        </CACard>
      )}

      <CACard style={{ padding: 20 }}>
        <QueueTable
          columns={["Client", "Request", "Period", "Due", "Status", ""]}
          empty="No document requests yet"
          emptyHint="Raise a request to start collecting records from a client."
          rows={rows.map((r) => [
            nameFor(r.business_id),
            <div key="t">
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 11.5, color: CA.faint }}>{(r.doc_types ?? []).map((t) => DOC_CLASS_LABELS[t as CADocClass] ?? t).join(", ")}</div>
            </div>,
            r.period ?? "—",
            dateIN(r.due_date),
            <div key="s" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StateChip value={r.status} />
              {autoMatched[r.id] ? (
                <span style={{ fontFamily: CA.sans, fontSize: 11, color: CA.teal, background: CA.tealSoft, borderRadius: 6, padding: "2px 7px" }}>
                  auto matched
                </span>
              ) : null}
            </div>,

            r.status === "open" && can("process") ? (
              <CAButton key="c" variant="ghost" onClick={() => closeRequest(r)}>
                Close
              </CAButton>
            ) : null,
          ])}
        />
      </CACard>
    </div>
  );
}
