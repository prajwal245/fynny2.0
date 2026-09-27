import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Plus } from "lucide-react";
import { Card, EmptyState, Modal, PageHeader, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, ProcessingCard } from "../agents";
import { PERIODS, REPORT_TEMPLATES, ReportTemplate, useV2 } from "../store";

const TEMPLATE_HINT: Record<ReportTemplate, string> = {
  "Monthly MIS": "Revenue, expenses, variances and the transactions behind them.",
  "Bank Reconciliation Summary": "Credits, debits and high value lines with every bank row listed.",
  "Key Variances": "Only the movement against the prior period.",
  "Working Paper": "Everything above in one file, laid out for the audit file.",
  "Exception and Review Summary": "Internal record of what was queried, corrected and left out.",
};

export default function ReportsPage() {
  const { reports, clients, clientName, generateReport, runs, period: currentPeriod } = useV2();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [period, setPeriod] = useState(currentPeriod);
  const [template, setTemplate] = useState<ReportTemplate>(REPORT_TEMPLATES[0]);
  const navigate = useNavigate();

  const narrateRuns = runs.filter((r) => r.agent === "narrate");

  const generate = () => {
    if (!clientId) { toast.error("Add a client first"); return; }
    setOpen(false);
    toast.success("Narrate agent is preparing the report");
    generateReport(clientId, period, template, (r) => {
      toast.success(`${r.template} ready`);
      navigate({ to: "/v2/reports/$reportId", params: { reportId: r.id } });
    });
  };


  return (
    <>
      <PageHeader
        title="MIS and Reports"
        subtitle={`Narrate agent. Every number stays linked to the transactions behind it. Current period ${currentPeriod}.`}
        action={<button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Generate MIS</button>}
      />

      <div style={{ display: "grid", gap: 12, marginBottom: narrateRuns.length ? 18 : 0 }}>
        <AnimatePresence>
          {narrateRuns.map((r) => (
            <ProcessingCard key={r.id} agent="narrate" title={r.title} steps={r.steps} current={r.current} />
          ))}
        </AnimatePresence>
      </div>

      {reports.length === 0 && narrateRuns.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={22} />}
          title="No reports yet"
          description="Generate an MIS for a client and period. Every figure is computed from the transactions we already read."
          action={<button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Generate MIS</button>}
        />
      ) : reports.length > 0 && (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead><tr><th>Client</th><th>Period</th><th>Template</th><th>Revenue</th><th>Expenses</th><th>Generated</th></tr></thead>
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
                    <td style={{ fontWeight: 600 }}>{clientName(r.clientId)}</td>
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
          <div>
            <label className="v2-label">Client</label>
            <select className="v2-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
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

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="v2-btn v2-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="v2-btn v2-btn-primary" onClick={generate}>Generate</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
