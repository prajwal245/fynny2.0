import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { Card, Drawer, EmptyState, PageHeader, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, AnimatedCounter, FadeIn, RowSkeleton } from "../agents";
import { Txn, useV2 } from "../store";
import { downloadExcel, printReport } from "../lib/exportReport";
import { toast } from "sonner";

export default function ReportDetailPage() {
  const { reportId } = useParams({ from: "/v2/reports/$reportId" });
  const { reports, clientName, firm, role, session, signOffReport, requestCorrection } = useV2();
  const report = reports.find((r) => r.id === reportId);
  const [source, setSource] = useState<{ label: string; rows: Txn[] } | null>(null);
  const [insightsReady, setInsightsReady] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setInsightsReady(true), 900);
    return () => clearTimeout(t);
  }, [reportId]);

  if (!report) {
    return <EmptyState title="Report not found" description="This report may have been removed. Go back to the reports list to pick another one." action={<Link className="v2-btn v2-btn-primary" to="/v2/reports">Back to reports</Link>} />;
  }

  const net = report.revenue - report.expenses;
  const allRows = [...report.sources.revenue, ...report.sources.expenses];

  const meta = { clientName: clientName(report.clientId), firmName: firm?.name ?? "FynHelp" };

  const metrics = [
    { label: "Revenue", value: report.revenue, tone: V.green, rows: report.sources.revenue },
    { label: "Expenses", value: report.expenses, tone: V.maroon, rows: report.sources.expenses },
    { label: "Net", value: net, tone: net >= 0 ? V.green : V.maroon, rows: allRows },
  ];

  return (
    <>
      <Link to="/v2/reports" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: V.body, textDecoration: "none", marginBottom: 12 }}>
        <ChevronLeft size={14} /> Reports
      </Link>
      <PageHeader
        title={`${clientName(report.clientId)} — ${report.period}`}
        subtitle={`${report.template} generated ${formatDate(report.generated)} from ${allRows.length} matched transactions${report.excluded ? `. ${report.excluded} unmatched line${report.excluded > 1 ? "s" : ""} left out by rule` : ""}`}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AgentStatusBadge agent="narrate" label="Narrate" />
            <button className="v2-btn v2-btn-ghost" onClick={() => { printReport(report, meta); toast.success("Choose Save as PDF in the print dialog"); }}><Printer size={15} /> PDF</button>
            <button className="v2-btn v2-btn-ghost" onClick={() => { downloadExcel(report, meta); toast.success("Excel file downloaded"); }}><Download size={15} /> Excel</button>
          </div>
        }
      />

      <Card style={{ marginBottom: 18, borderLeft: `3px solid ${report.signedOff ? V.green : report.correction ? V.maroon : V.blue}` }}>
        {report.signedOff ? (
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Signed off</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{report.signedOff.by} accepted this report on {formatDate(report.signedOff.at)}.</div>
          </div>
        ) : report.correction ? (
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Correction requested</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{report.correction.note}</div>
            {role === "Partner" && (
              <button className="v2-btn v2-btn-primary" style={{ marginTop: 12 }} onClick={() => { signOffReport(report.id, session?.name ?? "Partner"); toast.success("Report signed off"); }}>Sign off now</button>
            )}
          </div>
        ) : role === "Partner" ? (
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Partner review</div>
            <div style={{ fontSize: 14, marginTop: 6, marginBottom: 12 }}>Open any number to see the transactions behind it, then accept or send it back.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="v2-btn v2-btn-primary" onClick={() => { signOffReport(report.id, session?.name ?? "Partner"); toast.success("Report signed off"); }}>Sign off</button>
              <input className="v2-input" style={{ width: 280 }} placeholder="What needs correcting" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="v2-btn v2-btn-ghost" disabled={!note.trim()} onClick={() => { requestCorrection(report.id, note.trim()); setNote(""); toast.success("Sent back to the team"); }}>Request correction</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: V.body }}>Waiting for partner sign off. Tally or Zoho stays the source of truth for the books.</div>
        )}
      </Card>

      <div className="v2-grid-cards" style={{ marginBottom: 20 }}>
        {metrics.map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.07 }}>
            <Card hover onClick={() => setSource({ label: m.label, rows: m.rows })} style={{ cursor: "pointer" }}>
              <div style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 32, fontWeight: 600, marginTop: 10, color: m.tone, letterSpacing: "-0.03em" }}>
                <AnimatedCounter value={m.value} format={(n) => formatINR(n)} />
              </div>
              <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>{m.rows.length} source transactions. Click to open.</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h3 style={{ fontSize: 15.5 }}>Insights</h3>
          <AgentStatusBadge agent="narrate" active={!insightsReady} label={insightsReady ? "Written" : "Writing insights"} />
        </div>
        {!insightsReady ? (
          <RowSkeleton rows={2} height={62} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {report.insights.map((i, idx) => (
              <FadeIn key={idx} delay={idx * 0.12}>
                <div style={{ background: V.gray, borderRadius: 14, padding: 14 }}>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{i.text}</p>
                  <button
                    className="v2-btn v2-btn-quiet"
                    style={{ marginTop: 10 }}
                    onClick={() => setSource({ label: i.source, rows: allRows })}
                  >
                    {i.source}
                  </button>
                </div>
              </FadeIn>
            ))}
          </div>
        )}
      </Card>

      {report.variances.length > 0 && report.template !== "Bank Reconciliation Summary" && (
        <Card style={{ marginTop: 18, padding: 0 }} className="v2-scroll">
          <h3 style={{ fontSize: 15.5, padding: "18px 20px 0" }}>Key variances against the prior period</h3>
          <table className="v2-table">
            <thead><tr><th>Line</th><th style={{ textAlign: "right" }}>Current</th><th style={{ textAlign: "right" }}>Prior</th><th style={{ textAlign: "right" }}>Change</th></tr></thead>
            <tbody>
              {report.variances.map((v) => {
                const delta = v.current - v.prior;
                return (
                  <tr key={v.label}>
                    <td style={{ fontWeight: 600 }}>{v.label}</td>
                    <td className="num" style={{ textAlign: "right" }}>{formatINR(v.current)}</td>
                    <td className="num" style={{ textAlign: "right", color: V.muted }}>{formatINR(v.prior)}</td>
                    <td className="num" style={{ textAlign: "right", color: delta >= 0 ? V.green : V.maroon }}>{formatINR(delta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {report.bankSummary.length > 0 && (report.template === "Bank Reconciliation Summary" || report.template === "Working Paper") && (
        <Card style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Bank reconciliation summary</h3>
          <div className="v2-grid-cards">
            {report.bankSummary.map((b) => (
              <div key={b.label} style={{ background: V.gray, borderRadius: 14, padding: 14, cursor: b.rows.length ? "pointer" : "default" }} onClick={() => b.rows.length && setSource({ label: b.label, rows: b.rows })}>
                <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>{b.label}</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{b.label.toLowerCase().includes("lines") ? b.value : formatINR(b.value)}</div>
                {b.rows.length > 0 && <div style={{ fontSize: 11.5, color: V.muted, marginTop: 4 }}>{b.rows.length} transactions. Click to open.</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Drawer open={!!source} onClose={() => setSource(null)} title={`Source transactions — ${source?.label ?? ""}`}>
        {!source || source.rows.length === 0 ? (
          <p style={{ fontSize: 13.5, color: V.body }}>No matched transactions are linked to this figure yet.</p>
        ) : (
          <table className="v2-table">
            <thead><tr><th>Date</th><th>Particulars</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {source.rows.map((r, i) => (
                <tr key={i}>
                  <td className="num">{formatDate(r.date)}</td>
                  <td>{r.particulars}</td>
                  <td className="num" style={{ textAlign: "right", color: r.amount < 0 ? V.maroon : V.green }}>{formatINR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Drawer>
    </>
  );
}
