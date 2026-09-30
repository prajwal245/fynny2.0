import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Plus } from "lucide-react";
import { Card, EmptyState, Modal, PageHeader, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, ProcessingCard } from "../agents";
import { parsePeriod } from "@/lib/practice/core";
import { PERIODS, REPORT_TEMPLATES, ReportTemplate, useV2 } from "../store";

const TEMPLATE_HINT: Record<ReportTemplate, string> = {
  "Monthly MIS": "Revenue, expenses, variances and the transactions behind them.",
  "Bank Reconciliation Summary": "Credits, debits and high value lines with every bank row listed.",
  "Key Variances": "Only the movement against the prior period.",
  "Working Paper": "Everything above in one file, laid out for the audit file.",
  "Exception and Review Summary": "Internal record of what was queried, corrected and left out.",
};

/** MIS and Reports. All clients as a page; the client's MIS tab when given a clientId. */
export default function ReportsPage({ clientId: scopedClient }: { clientId?: string } = {}) {
  const { reports: allReports, clients, clientName, generateReport, runs, dismissRun, isRunning, matchedTxns, period: currentPeriod } = useV2();
  const reports = scopedClient ? allReports.filter((r) => r.clientId === scopedClient) : allReports;
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(scopedClient ?? clients[0]?.id ?? "");
  const [period, setPeriod] = useState(currentPeriod);
  const [template, setTemplate] = useState<ReportTemplate>(REPORT_TEMPLATES[0]);
  const navigate = useNavigate();

  // Inside a client workspace the workspace itself shows the live cards.
  const narrateRuns = scopedClient ? [] : runs.filter((r) => r.agent === "narrate");
  // Only matched transactions may enter an MIS: say so before anyone presses Generate.
  let matchedInPeriod = 0;
  try {
    const p = parsePeriod(period);
    matchedInPeriod = clientId ? matchedTxns(clientId).filter((t) => t.date >= p.start && t.date <= p.end).length : 0;
  } catch { matchedInPeriod = 0; }
  const narrating = clientId ? runs.some((r) => r.agent === "narrate" && r.target === clientId && r.status === "running") : false;

  const generate = () => {
    if (!clientId) { toast.error("Add a client first"); return; }
    if (isRunning("narrate", clientId)) return;
    setOpen(false);
    generateReport(clientId, period, template, (r) => {
      toast.success(`${r.template} ready`);
      navigate({ to: "/v2/reports/$reportId", params: { reportId: r.id } });
    });
  };


  return (
    <>
      {scopedClient ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Generate MIS</button>
        </div>
      ) : (
        <PageHeader
        title="MIS and Reports"
        subtitle={`Narrate agent. Every number stays linked to the transactions behind it. Current period ${currentPeriod}.`}
        action={<button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Generate MIS</button>}
      />
      )}

      <div style={{ display: "grid", gap: 12, marginBottom: narrateRuns.length ? 18 : 0 }}>
        <AnimatePresence>
          {narrateRuns.map((r) => (
            <ProcessingCard key={r.id} run={r} onDismiss={() => dismissRun(r.id)} />
          ))}
        </AnimatePresence>
      </div>

      {reports.length === 0 && !runs.some((r) => r.agent === "narrate" && r.status === "running" && (!scopedClient || r.clientId === scopedClient)) ? (
        <EmptyState
          icon={<BarChart3 size={22} />}
          title="No reports yet"
          description="Generate an MIS after reconciliation has matched transactions. Only matched transactions are used, and every number is source-traceable."
          action={<button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Generate MIS</button>}
        />
      ) : reports.length > 0 && (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead><tr>{!scopedClient && <th>Client</th>}<th>Period</th><th>Template</th><th>Revenue</th><th>Expenses</th><th>Generated</th></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {reports.map((r) => (
                  <motion.tr
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="clickable"
                    onClick={() => navigate({ to: "/v2/reports/$reportId", params: { reportId: r.id } })}
                  >
                    {!scopedClient && <td style={{ fontWeight: 600 }}>{clientName(r.clientId)}</td>}
                    <td style={{ color: V.body }}>{r.period}</td>
                    <td style={{ color: V.body }}>{r.template}</td>
                    <td className="num" style={{ color: V.green }}>{formatINR(r.revenue)}</td>
                    <td className="num" style={{ color: V.maroon }}>{formatINR(r.expenses)}</td>
                    <td className="num" style={{ color: V.body }}>{formatDate(r.generated)}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Generate MIS">
        <div style={{ display: "grid", gap: 14 }}>
          <AgentStatusBadge agent="narrate" label="Narrate agent" />
          {!scopedClient && (
            <div>
              <label className="v2-label">Client</label>
              <select className="v2-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="v2-label">Period</label>
            <select className="v2-input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="v2-label">Template</label>
            <div style={{ display: "grid", gap: 8 }}>
              {REPORT_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTemplate(t)}
                  style={{
                    textAlign: "left", padding: "11px 13px", borderRadius: 13, cursor: "pointer",
                    border: `1px solid ${template === t ? V.ink : V.line}`,
                    background: template === t ? "rgba(20,20,20,.03)" : "transparent",
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t}</div>
                  <div style={{ fontSize: 12, color: V.muted, marginTop: 2 }}>{TEMPLATE_HINT[t]}</div>
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid="mis-basis"
            style={{
              fontSize: 12.5,
              borderRadius: 12,
              padding: "10px 12px",
              background: matchedInPeriod ? "rgba(31,90,70,0.07)" : "rgba(176,122,24,.08)",
              color: matchedInPeriod ? V.green : V.body,
            }}
          >
            {matchedInPeriod
              ? `${matchedInPeriod} matched transaction${matchedInPeriod === 1 ? "" : "s"} in ${period}. Only these are used, and every number links to its source.`
              : `Generate MIS after reconciliation has matched transactions. Nothing in ${period} is matched yet.`}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="v2-btn v2-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="v2-btn v2-btn-primary" onClick={generate} disabled={!matchedInPeriod || narrating}>
              {narrating ? "Narrate is preparing…" : "Generate"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
