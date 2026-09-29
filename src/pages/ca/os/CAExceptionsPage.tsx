import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, CABadge, caInputStyle, inr, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, QueueTable, StateChip, StatStrip } from "@/components/ca/os/primitives";
import { REASON_LABELS, type ReasonCode } from "@/lib/caRecon";
import { logCAAudit } from "@/lib/caAudit";
import { signalBrain } from "@/lib/caBrainSignals";

interface ExceptionRow {
  id: string;
  business_id: string;
  source: string;
  reason_code: string;
  severity: string;
  amount: number | null;
  description: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

const SEV_TONE: Record<string, "red" | "amber" | "grey"> = { high: "red", medium: "amber", low: "grey" };

export default function CAExceptionsPage() {
  const { firmId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_exceptions")
      .select("id, business_id, source, reason_code, severity, amount, description, status, created_at, resolved_at")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data ?? []) as ExceptionRow[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameFor = (id: string) => clients.find((c) => c.business_id === id)?.client_name ?? "Unknown client";

  const resolve = async (r: ExceptionRow) => {
    const note = window.prompt("How was this resolved?");
    if (!note) return;
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("ca_exceptions")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: userRes?.user?.id ?? null,
        description: `${r.description ?? ""} — resolved: ${note}`,
      })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId: firmId!,
      businessId: r.business_id,
      entityType: "exception",
      entityId: r.id,
      action: "exception_resolved",
      actorRole: role,
      detail: { note, reason_code: r.reason_code },
    });
    void signalBrain(firmId, r.business_id, "exception_resolved", {
      reason_code: r.reason_code,
      severity: r.severity,
      amount: r.amount,
      days_open: Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000),
    });
    toast.success("Resolved and logged");
    void load();
  };

  const claim = async (r: ExceptionRow) => {
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("ca_exceptions")
      .update({ owner_id: userRes?.user?.id ?? null, status: "in_progress" })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    void load();
  };

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Exception queue" subtitle="Everything the system could not resolve on its own." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  const visible = rows.filter(
    (r) => (!clientFilter || r.business_id === clientFilter) && (!statusFilter || r.status === statusFilter),
  );
  const open = rows.filter((r) => r.status !== "resolved");
  const atRisk = open.reduce((s, r) => s + (r.amount ?? 0), 0);
  const oldest = open.reduce(
    (m, r) => Math.max(m, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)),
    0,
  );

  return (
    <div>
      <ModuleHeader
        title="Exception queue"
        subtitle="Unresolved items across reconciliation, ITC and TDS — ranked by money at risk and how long they have been sitting."
      />

      <StatStrip
        items={[
          { label: "Open exceptions", value: String(open.length), tone: open.length ? "amber" : "green" },
          { label: "Value at risk", value: inr(atRisk) },
          { label: "Oldest", value: oldest ? `${oldest} days` : "—" },
          { label: "Resolved", value: String(rows.length - open.length) },
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
          <select style={{ ...caInputStyle, maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="">All</option>
          </select>
        </div>

        <QueueTable
          columns={["Raised", "Client", "Item", "Reason", "Amount", "Severity", "Status", ""]}
          empty="Queue is clear"
          emptyHint="Run reconciliation on a client to surface anything that needs a human."
          rows={visible.map((r) => [
            dateIN(r.created_at),
            nameFor(r.business_id),
            <div key="d">
              <div style={{ fontWeight: 600 }}>{r.description ?? "—"}</div>
              <div style={{ fontSize: 11.5, color: CA.faint }}>{r.source}</div>
            </div>,
            REASON_LABELS[r.reason_code as ReasonCode] ?? r.reason_code,
            <span key="a" style={{ fontFamily: CA.mono }}>
              {inr(r.amount)}
            </span>,
            <CABadge key="s" tone={SEV_TONE[r.severity] ?? "grey"}>
              {r.severity}
            </CABadge>,
            <StateChip key="st" value={r.status} />,
            r.status !== "resolved" ? (
              <div key="act" style={{ display: "flex", gap: 6 }}>
                {r.status === "open" && (
                  <CAButton variant="ghost" onClick={() => claim(r)}>
                    Claim
                  </CAButton>
                )}
                <CAButton onClick={() => resolve(r)}>Resolve</CAButton>
              </div>
            ) : null,
          ])}
        />
      </CACard>
    </div>
  );
}
