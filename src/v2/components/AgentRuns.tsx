import { useState } from "react";
import { toast } from "sonner";
import { Badge, Card, EmptyState, V, type Tone } from "../ui";
import { AGENTS, AgentStatusBadge, type AgentKey } from "../agents";
import { useV2, type AgentRunRecord } from "../store";

const TRIGGER: Record<string, string> = {
  user: "Started by you",
  pipeline: "Automatic, after Extract",
  schedule: "Scheduled",
  retry: "Automatic retry",
  channel: "Arrived by email or WhatsApp",
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  running: { label: "Running", tone: "info" },
  succeeded: { label: "Done", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  skipped: { label: "Skipped", tone: "neutral" },
};

function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function duration(ms?: number) {
  if (ms === undefined) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Every agent run on this client: what ran, why it ran, and how it went. */
export function AgentRunsCard({ clientId }: { clientId: string }) {
  const { agentRunsFor, reprocessDoc } = useV2();
  const runs = agentRunsFor(clientId);
  const [busy, setBusy] = useState<string | null>(null);

  if (!runs.length)
    return (
      <EmptyState
        title="No agent runs yet"
        description="Each time Extract reads a document, Recon matches a month, Narrate writes an MIS or Chaser opens a chase, the run is recorded here with what started it."
      />
    );

  const retry = async (r: AgentRunRecord) => {
    if (!r.subjectId) return;
    setBusy(r.id);
    try {
      await reprocessDoc(r.subjectId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ padding: 0 }} className="v2-scroll">
      <div style={{ padding: "16px 18px 6px" }}>
        <h3 style={{ fontSize: 15 }}>Agent runs</h3>
        <div style={{ fontSize: 12.5, color: V.muted, marginTop: 4 }}>
          Extract hands over to Recon as soon as both sides of a month are in. Failed reads are retried automatically.
        </div>
      </div>
      <table className="v2-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Agent</th>
            <th>What happened</th>
            <th>Started by</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const s = STATUS[r.status] ?? STATUS.skipped;
            const agent = (r.agent in AGENTS ? r.agent : "extract") as AgentKey;
            return (
              <tr key={r.id} data-run-status={r.status}>
                <td className="num" style={{ color: V.body, whiteSpace: "nowrap" }}>{when(r.at)}</td>
                <td><AgentStatusBadge agent={agent} label={AGENTS[agent].name} /></td>
                <td style={{ color: V.body, maxWidth: 420 }}>
                  {r.status === "failed" ? (r.error ?? r.summary) : r.summary}
                  {r.subject && r.agent === "extract" && (
                    <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>
                      {r.subject}{r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}
                    </div>
                  )}
                  {r.memoryReleased > 0 && (
                    <div style={{ fontSize: 12, color: V.green, marginTop: 3 }}>
                      {r.memoryReleased} line{r.memoryReleased === 1 ? "" : "s"} settled from your earlier corrections
                    </div>
                  )}
                  {r.retryAt && r.status === "failed" && (
                    <div style={{ fontSize: 12, color: V.muted, marginTop: 3 }}>Next automatic try {when(r.retryAt)}</div>
                  )}
                </td>
                <td style={{ color: V.body, fontSize: 12.5 }}>
                  {TRIGGER[r.trigger] ?? r.trigger}
                  {r.period ? <div style={{ fontSize: 12, color: V.muted }}>{r.period}</div> : null}
                </td>
                <td>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <div style={{ fontSize: 11.5, color: V.muted, marginTop: 3 }}>{duration(r.ms)}</div>
                </td>
                <td>
                  {r.status === "failed" && r.agent === "extract" && r.subjectId && (
                    <button className="v2-btn v2-btn-quiet" disabled={busy === r.id} onClick={() => retry(r)}>
                      {busy === r.id ? "Retrying" : "Retry now"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
