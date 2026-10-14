import { useQuery } from "@tanstack/react-query";
import { adminSystemHealth } from "@/lib/admin/admin.functions";
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
          <Panel title="Failures in the last 24 hours">
            {d.recentFailures.length === 0 ? (
              <Empty>No agent failures in the last 24 hours.</Empty>
            ) : (
              <Table head={["When", "Firm", "Agent", "Error"]}>
                {d.recentFailures.map((r) => (
                  <tr key={r.id}>
                    <Td>{when(r.started_at)}</Td>
                    <Td>{r.firm}</Td>
                    <Td>{r.agent}</Td>
                    <Td className="max-w-[420px] break-words">{r.error ?? "—"}</Td>
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
