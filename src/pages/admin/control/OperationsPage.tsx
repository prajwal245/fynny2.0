import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminRetryRun, adminRuns } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { useAdminSession } from "@/components/admin/AdminSessionGate";
import { Btn, Empty, ErrorNote, PageHead, Panel, Pill, Table, Td, muted, when } from "./ui";

const TONE = { succeeded: "good", failed: "bad", running: "warn" } as const;

export default function OperationsPage() {
  const { can } = useAdminSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [agent, setAgent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["admin", "runs", status, agent],
    queryFn: () => adminCall(() => adminRuns({ data: { status, agent } })),
    refetchInterval: 15_000,
  });

  const retry = async (id: string) => {
    setBusy(id);
    try {
      const r = await adminCall(() => adminRetryRun({ data: { runId: id } }));
      if (r.status === "failed") toast.error(`Read again, still failing: ${r.error ?? "unknown error"}`);
      else toast.success(`Document read again: ${r.status}.`);
      await qc.invalidateQueries({ queryKey: ["admin", "runs"] });
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHead title="Operations" sub="The agents' work across every firm, live. A read stuck for 10 minutes or failed can be pushed through again." />
      <Panel>
        <div className="flex flex-wrap gap-2 mb-4">
          <select className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-testid="runs-status">
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="stuck">Stuck (running over 10 min)</option>
            <option value="failed">Failed</option>
            <option value="succeeded">Succeeded</option>
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
            <option value="">All agents</option>
            <option value="extract">Extract (document reads)</option>
            <option value="recon">Recon</option>
            <option value="narrate">Narrate (MIS)</option>
            <option value="chaser">Chaser</option>
          </select>
        </div>
        <ErrorNote error={runs.error} />
        {runs.data?.length === 0 && <Empty>Nothing here.</Empty>}
        {!!runs.data?.length && (
          <Table head={["Started", "Firm", "Agent", "What", "Status", "Detail", ""]} testId="runs-table">
            {runs.data.map((r) => (
              <tr key={r.id}>
                <Td>{when(r.started_at)}</Td>
                <Td>{r.firm}</Td>
                <Td className="capitalize">{r.agent}<div className="text-xs" style={{ color: muted }}>{r.trigger}{r.attempt > 1 ? ` · try ${r.attempt}` : ""}</div></Td>
                <Td>{r.subject_label ?? "—"}</Td>
                <Td><Pill tone={r.stuck ? "bad" : (TONE[r.status as keyof typeof TONE] ?? "info")}>{r.stuck ? "stuck" : r.status}</Pill></Td>
                <Td><span className="text-xs">{r.error ?? r.summary ?? ""}</span></Td>
                <Td>{r.retryable && can("ops.retry") && <Btn disabled={busy === r.id} testId={`retry-${r.id}`} onClick={() => void retry(r.id)}>{busy === r.id ? "Reading…" : "Read again"}</Btn>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
