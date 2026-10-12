import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { Card, Drawer, EmptyState, PageHeader, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, AnimatedCounter, FadeIn, RowSkeleton } from "../agents";
import { Txn, monthOf, useV2 } from "../store";
import { downloadExcel, printReport } from "../lib/exportReport";
import { toast } from "sonner";
import { openExceptions } from "../lib/exceptions";

/** Older reports stored "SALARY — SALARY": show the text once. */
function dedupeParticulars(p: string): string {
  const [a, b] = p.split(" — ");
  return b !== undefined && a.trim().toLowerCase() === b.trim().toLowerCase() ? a : p;
}

export default function ReportDetailPage() {
  const { reportId } = useParams({ from: "/v2/reports/$reportId" });
  const { reports, clientName, firm, session, signOffReport, requestCorrection, partnerView, exceptions, review, docs } = useV2();
  const report = reports.find((r) => r.id === reportId);
  const [source, setSource] = useState<{ label: string; rows: Txn[] } | null>(null);
  const [insightsReady, setInsightsReady] = useState(false);
  const [note, setNote] = useState("");
  // Sign-off is a deliberate two-step action, and reopening needs a reason.
  const [confirming, setConfirming] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setInsightsReady(true), 900);
    return () => clearTimeout(t);
  }, [reportId]);

  if (!report) {
    return <EmptyState title="Report not found" description="This report may have been removed. Go back to the reports list to pick another one." action={<Link className="v2-btn v2-btn-primary" to="/v2/reports">Back to reports</Link>} />;
  }

  const net = report.revenue - report.expenses;
  const inPeriod = (d?: string) => Boolean(d) && monthOf(d!) === report.period;
  const open = {
    exceptions: openExceptions(exceptions).filter((e) => e.clientId === report.clientId && inPeriod(e.date)).length,
    review: review.filter((r) => r.clientId === report.clientId && r.status === "open").length,
    unmatched: docs
      .filter((d) => d.clientId === report.clientId)
      .flatMap((d) => d.rows)
      .filter((r) => r.side === "bank" && inPeriod(r.date) && (r.matchStatus === "unmatched" || r.matchStatus === "exception")).length,
  };
  const openTotal = open.exceptions + open.review + open.unmatched;
  const openText = [
    open.exceptions && `${open.exceptions} open exception${open.exceptions === 1 ? "" : "s"}`,
    open.review && `${open.review} row${open.review === 1 ? "" : "s"} in the Review Queue`,
    open.unmatched && `${open.unmatched} unreconciled bank line${open.unmatched === 1 ? "" : "s"}`,
  ].filter(Boolean).join(", ");
  const exceptionTemplate = report.template === "Exception and Review Summary";
  const signOff = async () => {
    setSigning(true);
    const ok = await signOffReport(report.id, session?.name ?? "Partner", { acknowledgeOpen: openTotal > 0 && ackOpen });
    setSigning(false);
    if (ok) {
      setConfirming(false);
      setAckOpen(false);
    }
  };
  const allRows = [...report.sources.revenue, ...report.sources.expenses];
  // Same count as the Generate dialog: every matched line in the period, including taxes and advances.
  const flowCount = (report.otherFlows ?? []).reduce((n, f) => n + f.count, 0);
  const matchedCount = allRows.length + flowCount;

  const meta = { clientName: clientName(report.clientId), firmName: firm?.name ?? "FynHelp" };

  // The gateway gross-up is part of the Revenue and Expenses figures, so it is listed with their sources.
  const g = report.gateway;
  const grossUpIn: Txn[] = g ? [{ date: "", particulars: "Fees and GST on fees kept by the payment gateway (added back from the settlement report)", amount: g.fees + g.gst_on_fees }] : [];
  const grossUpOut: Txn[] = g
    ? [
        { date: "", particulars: "Payment gateway fees (settlement report)", amount: -g.fees },
        { date: "", particulars: "GST on payment gateway fees (18%)", amount: -g.gst_on_fees },
      ]
    : [];
  // Every matched line the report knows: revenue, expenses, and taxes/advances/transfers.
  const everyRow = [...allRows, ...(report.otherFlows ?? []).flatMap((f) => f.rows)];
  const citedRows = (ids?: string[]) => (ids?.length ? everyRow.filter((r) => r.id && ids.includes(r.id)) : everyRow);
  const metrics = [
    { label: "Revenue", value: report.revenue, tone: V.green, rows: [...report.sources.revenue, ...grossUpIn] },
    { label: "Expenses", value: report.expenses, tone: V.maroon, rows: [...report.sources.expenses, ...grossUpOut] },
    { label: "Net", value: net, tone: net >= 0 ? V.green : V.maroon, rows: [...allRows, ...grossUpIn, ...grossUpOut] },
  ];

  return (
    <>
      <Link to="/v2/reports" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: V.body, textDecoration: "none", marginBottom: 12 }}>
        <ChevronLeft size={14} /> Reports
      </Link>
      <PageHeader
        title={`${clientName(report.clientId)} — ${report.period}`}
        subtitle={`${report.template} generated ${formatDate(report.generated)} from ${matchedCount} matched transaction${matchedCount === 1 ? "" : "s"}${flowCount ? ` (${flowCount} of them taxes, advances or transfers, shown separately)` : ""}${report.excluded ? `. ${report.excluded} unmatched line${report.excluded > 1 ? "s" : ""} left out by rule` : ""}`}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AgentStatusBadge agent="narrate" label="Narrate" />
            <button className="v2-btn v2-btn-ghost" onClick={() => { printReport(report, meta); toast.success("Choose Save as PDF in the print dialog"); }}><Printer size={15} /> PDF</button>
            <button className="v2-btn v2-btn-ghost" onClick={() => { void downloadExcel(report, meta).then(() => toast.success("Excel file downloaded", { duration: 2500 })).catch(() => toast.error("The Excel file could not be created. Try again.")); }}><Download size={15} /> Excel</button>
          </div>
        }
      />

      {report.warnings && report.warnings.length > 0 && (
        <Card style={{ marginBottom: 18, borderLeft: `3px solid ${V.beige}`, background: V.cream }}>
          {report.warnings.map((w) => (
            <div key={w} style={{ fontSize: 13, color: V.body, lineHeight: 1.6 }}>{w}</div>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: 18, borderLeft: `3px solid ${report.signedOff ? V.green : report.correction ? V.maroon : V.blue}` }}>
        {report.signedOff ? (
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Signed off</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{report.signedOff.by} accepted this report on {formatDate(report.signedOff.at)}.</div>
            {report.signedOffWithOpen && (
              <div style={{ fontSize: 12.5, color: V.body, marginTop: 4 }}>
                Signed off with {report.signedOffWithOpen.exceptions} exception(s), {report.signedOffWithOpen.review} review row(s) and {report.signedOffWithOpen.unmatched} unreconciled line(s) left out.
              </div>
            )}
            {partnerView && (
              reopening ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                  <input className="v2-input" style={{ width: 300 }} autoFocus placeholder="Why it needs reopening" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                  <button className="v2-btn v2-btn-primary" disabled={!reopenReason.trim()} onClick={() => { requestCorrection(report.id, `Reopened: ${reopenReason.trim()}`); setReopening(false); setReopenReason(""); toast.success("Report reopened. Sign it off again when it is right."); }}>Reopen report</button>
                  <button className="v2-btn v2-btn-quiet" onClick={() => setReopening(false)}>Cancel</button>
                </div>
              ) : (
                <button className="v2-btn v2-btn-quiet" style={{ marginTop: 12 }} onClick={() => setReopening(true)}>Reopen</button>
              )
            )}
          </div>
        ) : report.correction ? (
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Correction requested</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{report.correction.note}</div>
            {partnerView && !confirming && (
              <button className="v2-btn v2-btn-primary" style={{ marginTop: 12 }} onClick={() => setConfirming(true)}>Sign off now</button>
            )}
          </div>
        ) : partnerView ? (
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>Partner review</div>
            <div style={{ fontSize: 14, marginTop: 6, marginBottom: 12 }}>Open any number to see the transactions behind it, then accept or send it back.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="v2-btn v2-btn-primary" onClick={() => setConfirming(true)} disabled={confirming}>Sign off</button>
              <input className="v2-input" style={{ width: 280 }} placeholder="What needs correcting" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="v2-btn v2-btn-ghost" disabled={!note.trim()} onClick={() => { requestCorrection(report.id, note.trim()); setNote(""); toast.success("Sent back to the team"); }}>Request correction</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: V.body }} data-testid="awaiting-signoff">Waiting for partner sign off. Only a partner can sign off an MIS. Tally or Zoho stays the source of truth for the books.</div>
        )}
      </Card>

      {confirming && !report.signedOff && (
        <Card style={{ marginBottom: 18, borderLeft: `3px solid ${openTotal ? V.maroon : V.green}` }} data-testid="signoff-confirm">
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Sign off {clientName(report.clientId)}, {report.period}?</div>
          {openTotal > 0 ? (
            <>
              <div style={{ fontSize: 13.5, color: V.body, marginTop: 6 }}>
                Still open: {openText}. They are left out of these figures. Clearing them first is recommended.
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginTop: 10 }}>
                <input type="checkbox" checked={ackOpen} onChange={(e) => setAckOpen(e.target.checked)} />
                I have checked these and want to sign off with them left out.
              </label>
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: V.body, marginTop: 6 }}>Nothing is open for this client and month. Once signed off, the report can be shared with the client; you can reopen it later if something changes.</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="v2-btn v2-btn-primary" disabled={signing || (openTotal > 0 && !ackOpen)} data-busy={signing} onClick={signOff}>Confirm sign off</button>
            <button className="v2-btn v2-btn-quiet" onClick={() => { setConfirming(false); setAckOpen(false); }}>Cancel</button>
          </div>
        </Card>
      )}

      {!exceptionTemplate && (
      <div className="v2-grid-cards" style={{ marginBottom: 20 }}>
        {metrics.map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.07 }}>
            <Card hover onClick={() => setSource({ label: m.label, rows: m.rows })} style={{ cursor: "pointer" }}>
              <div style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 32, fontWeight: 600, marginTop: 10, color: m.tone, letterSpacing: "-0.03em" }}>
                <AnimatedCounter value={m.value} format={(n) => formatINR(n)} />
              </div>
              <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>{m.rows.length} source transaction{m.rows.length === 1 ? "" : "s"}. Click to open.</div>
            </Card>
          </motion.div>
        ))}
      </div>
      )}

      {!exceptionTemplate && report.gateway && (
        <Card style={{ marginBottom: 20, background: V.cream }} data-testid="gateway-grossup">
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Payment gateway payouts grossed up</div>
          <div style={{ fontSize: 13.5, color: V.body, marginTop: 4, lineHeight: 1.55 }}>
            {report.gateway.payouts} payout{report.gateway.payouts === 1 ? "" : "s"} matched the uploaded settlement report. Revenue includes the {formatINR(report.gateway.fees + report.gateway.gst_on_fees)} customers paid that the gateway kept, and the same amount is in expenses as gateway fees ({formatINR(report.gateway.fees)}) and GST on fees ({formatINR(report.gateway.gst_on_fees)}).
          </div>
        </Card>
      )}

      {!exceptionTemplate && report.statutory && report.statutory.length > 0 && (
        <Card style={{ marginBottom: 20 }} data-testid="statutory-dates">
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Statutory dates that follow from this month</div>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {report.statutory.map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5, flexWrap: "wrap" }}>
                <span>{s.label}</span>
                <b className="num">by {formatDate(s.due)}</b>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: V.muted, marginTop: 8 }}>Worked out from the TDS, PF/ESI and GST payments in this month's bank lines.</div>
        </Card>
      )}

      {!exceptionTemplate && report.otherFlows && report.otherFlows.length > 0 && (
        <Card style={{ marginBottom: 20 }} data-testid="other-flows">
          <h3 style={{ fontSize: 15.5 }}>Not counted as revenue or expenses</h3>
          <div style={{ fontSize: 12.5, color: V.muted, marginTop: 4, marginBottom: 12 }}>Cash that moved this month but is not income or expense.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {report.otherFlows.map((f) => (
              <button key={f.key} className="v2-btn v2-btn-quiet" style={{ justifyContent: "space-between", width: "100%" }} onClick={() => setSource({ label: f.label, rows: f.rows })}>
                <span>{f.label} · {f.count} line{f.count === 1 ? "" : "s"}</span>
                <span className="num" style={{ color: f.direction === "out" ? V.maroon : V.green }}>{formatINR(f.direction === "out" ? -f.amount : f.amount)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {exceptionTemplate && (
        <Card style={{ marginBottom: 20 }} data-testid="exception-summary">
          <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Open exceptions and review items</h3>
          {report.bankSummary.length === 0 || report.bankSummary.every((b) => !b.value) ? (
            <p style={{ fontSize: 13.5, color: V.body, margin: 0 }}>Nothing open for {report.period}: every bank line is matched or decided and the Review Queue is empty.</p>
          ) : (
            <table className="v2-table">
              <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Count</th><th /></tr></thead>
              <tbody>
                {report.bankSummary.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className="num" style={{ textAlign: "right" }}>{b.value}</td>
                    <td style={{ textAlign: "right" }}>{b.rows.length > 0 && <button className="v2-btn v2-btn-quiet" onClick={() => setSource({ label: b.label, rows: b.rows })}>View {b.rows.length === 1 ? "line" : "lines"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 style={{ fontSize: 15.5, margin: "22px 0 12px" }}>Decided this period</h3>
          {!report.decisions?.length ? (
            <p style={{ fontSize: 13.5, color: V.body, margin: 0 }}>No line was ignored, matched by hand or marked reconciled elsewhere in {report.period}.</p>
          ) : (
            <div className="v2-scroll">
              <table className="v2-table" data-testid="exception-decisions">
                <thead><tr><th>Date</th><th>Line</th><th style={{ textAlign: "right" }}>Amount</th><th>Decision</th><th>Note</th></tr></thead>
                <tbody>
                  {report.decisions.map((d, i) => (
                    <tr key={i}>
                      <td className="num">{d.date ? formatDate(d.date) : ""}</td>
                      <td>{d.particulars}<div style={{ fontSize: 12, color: V.muted }}>{d.reason}</div></td>
                      <td className="num" style={{ textAlign: "right", color: d.amount < 0 ? V.maroon : V.green }}>{formatINR(d.amount)}</td>
                      <td>{d.outcome}</td>
                      <td style={{ fontSize: 12.5, color: V.body }}>{d.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!exceptionTemplate && (
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
                    onClick={() => setSource({ label: i.source, rows: citedRows(i.cited_transaction_ids) })}
                  >
                    {i.cited_transaction_ids?.length
                      ? `${citedRows(i.cited_transaction_ids).length} transaction${citedRows(i.cited_transaction_ids).length === 1 ? "" : "s"}`
                      : i.source}
                  </button>
                </div>
              </FadeIn>
            ))}
          </div>
        )}
      </Card>
      )}

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

      {!exceptionTemplate && report.bankSummary.length > 0 && (report.template === "Bank Reconciliation Summary" || report.template === "Working Paper") && (
        <Card style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Bank reconciliation summary</h3>
          <div className="v2-grid-cards">
            {report.bankSummary.map((b) => (
              <div key={b.label} style={{ background: V.gray, borderRadius: 14, padding: 14, cursor: b.rows.length ? "pointer" : "default" }} onClick={() => b.rows.length && setSource({ label: b.label, rows: b.rows })}>
                <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: V.muted, fontWeight: 600 }}>{b.label}</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{(b.unit ? b.unit === "count" : b.label.toLowerCase().includes("lines")) ? b.value : formatINR(b.value)}</div>
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
                  <td className="num">{r.date ? formatDate(r.date) : "—"}</td>
                  <td>{dedupeParticulars(r.particulars)}</td>
                  <td className="num" style={{ textAlign: "right", color: r.amount < 0 ? V.maroon : V.green }}>{formatINR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="source-total">
                <td />
                <td style={{ fontWeight: 700 }}>Total · {source.rows.length} line{source.rows.length === 1 ? "" : "s"}</td>
                <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                  {formatINR(Math.round(source.rows.reduce((s, r) => s + r.amount, 0) * 100) / 100)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Drawer>
    </>
  );
}
