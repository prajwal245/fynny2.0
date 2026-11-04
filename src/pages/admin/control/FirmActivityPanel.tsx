import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFirmActivity, adminFirmReport } from "@/lib/admin/admin.functions";
import { adminCall } from "@/components/admin/adminClient";
import { Btn, ErrorNote, Pill, day, line, muted, when } from "./ui";

const inr = (n: number | null) => (n == null ? "-" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info"> = { parsed: "good", needs_review: "warn", failed: "bad", queued: "info", processing: "info" };

function Box({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }} data-testid={testId}>
      <div className="font-semibold mb-1">{title}</div>
      {children}
    </div>
  );
}

/** Real usage of one firm, read-only: sign-in, first extract, documents and failures, AI cost, team, MIS reports and the activity trail. */
export function FirmActivityPanel({ firmId }: { firmId: string }) {
  const q = useQuery({ queryKey: ["admin", "firm-activity", firmId], queryFn: () => adminCall(() => adminFirmActivity({ data: { firmId } })) });
  const [reportId, setReportId] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ["admin", "firm-report", firmId, reportId],
    enabled: Boolean(reportId),
    queryFn: () => adminCall(() => adminFirmReport({ data: { firmId, reportId: reportId! } })),
  });
  if (q.isLoading) return <p style={{ color: muted }}>Loading activity…</p>;
  if (q.error) return <ErrorNote error={q.error} />;
  const a = q.data;
  if (!a) return null;
  const fx = a.firstExtract;
  return (
    <div className="grid gap-4" data-testid="firm-activity">
      <Box title="Activity & usage">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span style={{ color: muted }}>Signed up</span><span>{when(a.signedUpAt)}</span>
          <span style={{ color: muted }}>Owner last signed in</span><span>{a.ownerLastSignIn ? when(a.ownerLastSignIn) : "Never"}</span>
          <span style={{ color: muted }}>Last active</span><span>{a.lastActiveAt ? when(a.lastActiveAt) : "-"}</span>
          <span style={{ color: muted }}>Documents</span><span>{a.documents.total} ({a.documents.last24h} today, {a.documents.last7d} this week)</span>
          <span style={{ color: muted }}>Transactions read</span><span>{a.documents.transactions}</span>
          <span style={{ color: muted }}>Open review items</span><span>{a.documents.openReviewItems}</span>
          <span style={{ color: muted }}>AI (30 days)</span><span>{a.ai.calls} calls, {a.ai.failed} failed · {a.ai.tokensIn.toLocaleString("en-IN")} in / {a.ai.tokensOut.toLocaleString("en-IN")} out · est. ${a.ai.costUsd.toFixed(4)}</span>
        </div>
        {Object.keys(a.documents.byStatus).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(a.documents.byStatus).map(([s, n]) => <Pill key={s} tone={STATUS_TONE[s] ?? "info"}>{s.replace("_", " ")}: {n}</Pill>)}
          </div>
        )}
      </Box>

      <Box title="First extract" testId="firm-first-extract">
        {!fx ? (
          <span style={{ color: muted }}>No document uploaded yet.</span>
        ) : (
          <div className="grid gap-1">
            <div><b>{fx.file ?? "Untitled"}</b> · {fx.source ?? "upload"} · <Pill tone={STATUS_TONE[fx.status ?? ""] ?? "info"}>{(fx.status ?? "unknown").replace("_", " ")}</Pill></div>
            <div style={{ color: muted }}>Uploaded {when(fx.at)}{fx.hoursAfterSignup != null ? `, ${fx.hoursAfterSignup} hours after sign-up` : ""} · {fx.rows} rows read</div>
            {fx.error && <div style={{ color: "#8A1E18" }}>Error: {fx.error}</div>}
            {!fx.firstSuccessAt && <div style={{ color: "#8A1E18" }}>No document has been read successfully yet.</div>}
          </div>
        )}
      </Box>

      {a.documents.failures.length > 0 && (
        <Box title="Recent document errors" testId="firm-failures">
          <ul className="grid gap-1">
            {a.documents.failures.map((f) => (
              <li key={f.id}><span className="text-xs" style={{ color: muted }}>{when(f.at)}</span> <b>{f.file ?? "Untitled"}</b>: {f.error ?? "No reason recorded"} <span className="text-xs" style={{ color: muted }}>({f.attempts} tries)</span></li>
            ))}
          </ul>
        </Box>
      )}

      <Box title="Sign-ins by person">
        <ul>{a.team.map((m, i) => <li key={i}>{m.email ?? "Owner"} · {m.role} · {m.status} · last in {m.lastSignIn ? day(m.lastSignIn) : "never"}</li>)}</ul>
      </Box>

      <Box title="MIS reports" testId="firm-mis">
        {a.reports.length === 0 ? <span style={{ color: muted }}>None generated yet.</span> : (
          <ul className="grid gap-1">
            {a.reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{r.name} · {r.period ?? "-"} · {r.status ?? "-"} · {day(r.createdAt)}</span>
                {r.viewable ? <Btn onClick={() => setReportId(r.id)} testId="mis-view">View</Btn> : <span className="text-xs" style={{ color: muted }}>no content</span>}
              </li>
            ))}
          </ul>
        )}
        {reportId && (
          <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(23,18,8,.04)" }} data-testid="mis-viewer">
            {report.isLoading && <span style={{ color: muted }}>Loading report…</span>}
            <ErrorNote error={report.error} />
            {report.data && (
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div><b>{report.data.name}</b> · {report.data.period ?? ""}<div className="text-xs" style={{ color: muted }}>Read-only. This view is recorded in the audit log.</div></div>
                  <Btn onClick={() => setReportId(null)}>Close</Btn>
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <span style={{ color: muted }}>Revenue</span><span>{inr(report.data.totals.revenue)}</span>
                  <span style={{ color: muted }}>Expenses</span><span>{inr(report.data.totals.expenses)}</span>
                  <span style={{ color: muted }}>Receipts</span><span>{inr(report.data.totals.receipts)}</span>
                  <span style={{ color: muted }}>Payments</span><span>{inr(report.data.totals.payments)}</span>
                </div>
                {report.data.insights.length > 0 && <div><div className="font-semibold">Insights</div><ul className="list-disc pl-5">{report.data.insights.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                {report.data.variances.length > 0 && (
                  <div><div className="font-semibold">Changes vs prior month</div>
                    <ul>{report.data.variances.map((v, i) => <li key={i}>{v.label}: {inr(v.current)} (was {inr(v.prior)}{v.changePct != null ? `, ${v.changePct > 0 ? "+" : ""}${v.changePct}%` : ""})</li>)}</ul>
                  </div>
                )}
                {report.data.warnings.length > 0 && <div><div className="font-semibold">Warnings</div><ul className="list-disc pl-5">{report.data.warnings.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
              </div>
            )}
          </div>
        )}
      </Box>

      <Box title="Activity trail">
        {a.activity.length === 0 ? <span style={{ color: muted }}>Nothing recorded.</span> : (
          <ul className="grid gap-1">{a.activity.map((x, i) => <li key={i}><span className="text-xs" style={{ color: muted }}>{when(x.at)}</span> {x.text}</li>)}</ul>
        )}
      </Box>
    </div>
  );
}
