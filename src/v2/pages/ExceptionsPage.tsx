import { useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge } from "../agents";
import { EXCEPTION_REASONS, useV2 } from "../store";

const REASONS = EXCEPTION_REASONS;

export default function ExceptionsPage() {
  const { exceptions, clients, clientName, setExceptionStatus, runs } = useV2();
  const [client, setClient] = useState("all");
  const [reason, setReason] = useState("all");

  const reconRunning = runs.some((r) => r.agent === "recon");
  const list = exceptions.filter(
    (e) => e.status === "open" && (client === "all" || e.clientId === client) && (reason === "all" || e.reason === reason),
  );

  return (
    <>
      <PageHeader
        title="Exception Queue"
        subtitle="Bank lines the Recon agent could not settle on its own. Separate from the Review Queue."
        action={<AgentStatusBadge agent="recon" active={reconRunning} label={reconRunning ? "Matching transactions" : `${list.length} open`} />}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="v2-input" style={{ width: "auto", minWidth: 200 }} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="all">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="v2-input" style={{ width: "auto", minWidth: 200 }} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="all">All reason codes</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={22} />}
          title="No open exceptions"
          description="Every bank line has a match. Anything the Recon agent cannot settle will appear here with a reason code."
        />
      ) : (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead><tr><th>Client</th><th>Reason</th><th>Narration</th><th>Amount</th><th>Date</th><th>Suggested match</th><th /></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.map((e) => (
                  <motion.tr
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ duration: 0.32, ease: "easeOut" }}
                  >
                    <td style={{ fontWeight: 600 }}>{clientName(e.clientId)}</td>
                    <td><Badge tone="warn">{e.reason}</Badge></td>
                    <td style={{ color: V.body }}>{e.narration}{e.detail && <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>{e.detail}</div>}</td>
                    <td className="num" style={{ color: e.amount < 0 ? V.maroon : V.green }}>{formatINR(e.amount)}</td>
                    <td className="num" style={{ color: V.body }}>{formatDate(e.date)}</td>
                    <td style={{ color: V.body, fontSize: 12.5 }}>{e.candidates[0] ?? "No candidate found"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
                        <button className="v2-btn v2-btn-quiet" disabled={!e.candidateIds?.length} title={e.candidateIds?.length ? "Match with the suggested entry" : "No suggested entry to match"} onClick={() => { setExceptionStatus(e.id, "resolved", { action: "match" }); toast.success("Matched manually. Matched count updated."); }}>Match</button>
                        <button className="v2-btn v2-btn-quiet" onClick={() => { setExceptionStatus(e.id, "ignored"); toast.success("Exception ignored"); }}>Ignore</button>
                        <button className="v2-btn v2-btn-quiet" title="Mark as reconciled outside FynHelp" onClick={() => { setExceptionStatus(e.id, "resolved", { action: "reconciled_external" }); toast.success("Exception resolved"); }}>Resolve</button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
