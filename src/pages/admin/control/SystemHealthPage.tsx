import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminAiReaderCheck, adminSystemHealth } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { Btn, Empty, ErrorNote, Kpi, PageHead, Panel, Pill, Table, Td, muted, when } from "./ui";

const TONE = { ok: "good", warn: "warn", down: "bad" } as const;
const LABEL = { ok: "Working", warn: "Check", down: "Not working" } as const;

export default function SystemHealthPage() {
  const h = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => adminCall(() => adminSystemHealth()),
    refetchInterval: 60_000,
  });
  const ai = useMutation({ mutationFn: () => adminCall(() => adminAiReaderCheck()) });
  const [showAi, setShowAi] = useState(false);
  const d = h.data;
  const worst = d?.checks.some((c) => c.status === "down") ? "down" : d?.checks.some((c) => c.status === "warn") ? "warn" : "ok";

  return (
    <div>
      <PageHead
        title="System Health"
        sub="Live checks of the database, sign-in, payments, email, document reading and the agents. Refreshes every minute."
        action={<Btn onClick={() => h.refetch()} disabled={h.isFetching} testId="health-refresh">{h.isFetching ? "Checking…" : "Check now"}</Btn>}
      />
      <ErrorNote error={h.error} />
      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Kpi label="Overall" value={LABEL[worst]} hint={`Checked ${when(d.checkedAt)}`} />
            <Kpi label="Agent runs, 24 hours" value={d.runs.total} hint={`${d.runs.byStatus["failed"] ?? 0} failed · ${d.runs.stuck} stuck`} />
            <Kpi label="Documents waiting" value={(d.documents["queued"] ?? 0) + (d.documents["retry"] ?? 0) + (d.documents["processing"] ?? 0)} hint={`${d.documents["failed"] ?? 0} could not be read`} />
            <Kpi label="Last Razorpay event" value={d.lastWebhook ? when(d.lastWebhook.received_at) : "None yet"} hint={d.lastWebhook?.event ?? "Webhook has not delivered"} />
          </div>
          <Panel title="Services">
            <Table head={["Service", "Status", "Detail", "Response"]} testId="health-table">
              {d.checks.map((c) => (
                <tr key={c.key}>
                  <Td>{c.name}</Td>
                  <Td><Pill tone={TONE[c.status]}>{LABEL[c.status]}</Pill></Td>
                  <Td>{c.detail}</Td>
                  <Td mono>{c.ms != null ? `${c.ms} ms` : "—"}</Td>
                </tr>
              ))}
            </Table>
            <p className="text-xs mt-3" style={{ color: muted }}>
              Last scheduled job run: {d.lastScheduledRun ? when(d.lastScheduledRun) : "none recorded"}. Settings are checked for presence only; their values never leave the server.
            </p>
          </Panel>
          <Panel title="AI reader">
            <div className="flex items-center gap-3 mb-3">
              <Btn onClick={() => { setShowAi(true); ai.mutate(); }} disabled={ai.isPending} testId="ai-check">{ai.isPending ? "Asking the AI…" : "Run a live check"}</Btn>
              <span className="text-xs" style={{ color: muted }}>Sends each configured provider a tiny question and shows whether it answered. Keys are never shown.</span>
            </div>
            <ErrorNote error={ai.error} />
            {showAi && ai.data && (
              <div className="text-sm mb-3">
                {!ai.data.configured.length && <p>No provider key is visible to the server{ai.data.edge ? "; the built-in fallback is available." : ", and the built-in fallback is not available."}</p>}
                {ai.data.results.map((r) => (
                  <p key={r.provider}>{r.ok ? "Working" : "Not working"}: {r.provider}, {r.ms} ms.{r.ok ? "" : ` ${r.detail}`}</p>
                ))}
              </div>
            )}
            {d.aiFailures.length === 0 ? (
              <Empty>No failed AI calls in the last 24 hours.</Empty>
            ) : (
              <Table head={["When", "Firm", "What it was reading", "Provider", "Reason"]}>
                {d.aiFailures.map((r, i) => (
                  <tr key={`${r.at}-${i}`}>
                    <Td>{when(r.at)}</Td>
                    <Td>{r.firm}</Td>
                    <Td>{r.purpose}</Td>
                    <Td>{r.provider} {r.model !== "—" ? `(${r.model})` : ""}</Td>
                    <Td className="max-w-[420px] break-words">{r.error || "—"}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
          <Panel title="Failures in the last 24 hours">
            {d.recentFailures.length === 0 ? (
              <Empty>No agent failures in the last 24 hours.</Empty>
            ) : (
              <Table head={["When", "Firm", "Agent", "What the firm saw", "Admin detail"]}>
                {d.recentFailures.map((r) => (
                  <tr key={r.id}>
                    <Td>{when(r.started_at)}</Td>
                    <Td>{r.firm}</Td>
                    <Td>{r.agent}</Td>
                    <Td className="max-w-[420px] break-words">{r.error ?? "—"}</Td>
                    <Td className="max-w-[420px] break-words">{r.adminNote ?? "—"}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
