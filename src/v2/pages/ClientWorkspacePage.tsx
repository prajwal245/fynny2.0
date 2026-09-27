import { useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Stat, Tabs, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, AgentTimeline, AnimatedCounter, ProcessingCard } from "../agents";
import { useV2 } from "../store";
import { CloseProgress, NextAction } from "../components/CloseProgress";

export default function ClientWorkspacePage() {
  const { clientId } = useParams({ from: "/v2/clients/$clientId" });
  const { clients, docs, exceptions, reports, chases, review, runs, recon, runRecon, generateReport, period, closeStateFor, activityFor } = useV2();
  const client = clients.find((c) => c.id === clientId);
  const [tab, setTab] = useState("overview");

  if (!client) {
    return (
      <EmptyState
        title="Client not found"
        description="This client may have been removed. Go back to the client list to pick another one."
        action={<Link className="v2-btn v2-btn-primary" to="/v2/clients">Back to clients</Link>}
      />
    );
  }

  const cDocs = docs.filter((d) => d.clientId === client.id);
  const cEx = exceptions.filter((e) => e.clientId === client.id && e.status === "open");
  const cReview = review.filter((r) => r.clientId === client.id && r.status === "open");
  const cReports = reports.filter((r) => r.clientId === client.id);
  const close = closeStateFor(client.id);
  const timeline = activityFor(client.id);

  const runNext = () => {
    if (close.next.action === "recon") {
      runRecon(client.id, (r) => toast.success(`Recon complete. Matched ${r.matched}, exceptions ${r.exceptions}.`));
      toast.success("Recon agent is matching transactions");
      setTab("recon");
      return;
    }
    if (close.next.action === "mis") {
      generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`));
      toast.success("Narrate agent is preparing the MIS");
      setTab("mis");
      return;
    }
    setTab(close.next.tab);
  };
  const cChases = chases.filter((c) => c.clientId === client.id && c.status !== "Resolved");
  const bankRows = cDocs.flatMap((d) => d.rows);
  const clientRuns = runs.filter((r) => r.target === client.id);
  const reconRunning = clientRuns.some((r) => r.agent === "recon");
  const result = recon[client.id];
  const matched = result ? result.matched : Math.max(0, bankRows.length - cEx.length);

  const status = cEx.length > 0
    ? { label: "Needs attention", tone: "bad" as const }
    : cReview.length > 0 || cChases.length > 0
      ? { label: "Ready for review", tone: "warn" as const }
      : { label: "All clear", tone: "good" as const };

  return (
    <>
      <Link to="/v2/clients" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: V.body, textDecoration: "none", marginBottom: 12 }}>
        <ChevronLeft size={14} /> Clients
      </Link>
      <PageHeader
        title={client.name}
        subtitle={`${client.entityType}${client.gstin ? ` · ${client.gstin}` : ""} · closing ${period}`}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <div style={{ display: "grid", gap: 12, marginBottom: clientRuns.length ? 18 : 0 }}>
        <AnimatePresence>
          {clientRuns.map((r) => (
            <ProcessingCard key={r.id} agent={r.agent} title={r.title} steps={r.steps} current={r.current} />
          ))}
        </AnimatePresence>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "overview", label: "Overview" },
          { value: "documents", label: "Documents", count: cDocs.length },
          { value: "review", label: "Review Queue", count: cReview.length },
          { value: "exceptions", label: "Exception Queue", count: cEx.length },
          { value: "recon", label: "Recon" },
          { value: "mis", label: "MIS", count: cReports.length },
          { value: "chaser", label: "Chaser", count: cChases.length },
          { value: "activity", label: "Activity", count: timeline.length },
        ]}
      />

      {tab === "overview" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div style={{ marginBottom: 18 }}>
            <NextAction state={close} onGo={runNext} />
          </div>
          <Card style={{ marginBottom: 18 }}>
            <CloseProgress state={close} />
          </Card>
          <div className="v2-grid-cards" style={{ marginBottom: 18 }}>
            <Stat label="Documents" value={<AnimatedCounter value={cDocs.length} />} hint="Collected so far" />
            <Stat label="Awaiting review" value={<AnimatedCounter value={cReview.length} />} hint="Low confidence rows" />
            <Stat label="Open exceptions" value={<AnimatedCounter value={cEx.length} />} tone={cEx.length ? "bad" : "neutral"} hint="Unmatched bank lines" />
            <Stat label="Open chases" value={<AnimatedCounter value={cChases.length} />} hint="Documents still pending" />
          </div>
          <Card>
            <h3 style={{ fontSize: 15 }}>Quick actions</h3>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="v2-btn v2-btn-primary" disabled={reconRunning} onClick={() => { runRecon(client.id, (r) => toast.success(`Recon complete. Matched ${r.matched}, exceptions ${r.exceptions}.`)); toast.success("Recon agent is matching transactions"); }}>
                Run recon
              </button>
              <button className="v2-btn v2-btn-ghost" onClick={() => { generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`)); toast.success("Narrate agent is preparing the MIS"); }}>
                Generate MIS
              </button>
              <Link className="v2-btn v2-btn-ghost" to="/v2/documents">Upload documents</Link>
            </div>
            <div style={{ fontSize: 12.5, color: V.muted, marginTop: 14 }}>
              Last MIS: {client.lastMis ? formatDate(client.lastMis) : "Not generated yet"}
            </div>
          </Card>
        </motion.div>
      )}

      {tab === "documents" && (
        cDocs.length === 0 ? (
          <EmptyState title="No documents for this client" description="Upload a statement or bills from the Documents page and they will show up here." action={<Link className="v2-btn v2-btn-primary" to="/v2/documents">Go to Documents</Link>} />
        ) : (
          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>File</th><th>Source</th><th>Status</th><th>Rows</th><th>Date</th></tr></thead>
              <tbody>
                {cDocs.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td style={{ color: V.body }}>{d.source}</td>
                    <td>{d.status === "Processing" ? <AgentStatusBadge agent="extract" active label="Extracting" /> : <Badge tone={d.status === "Parsed" ? "good" : "bad"}>{d.status}</Badge>}</td>
                    <td className="num" style={{ color: V.body }}>{d.rows.length}</td>
                    <td className="num" style={{ color: V.body }}>{formatDate(d.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === "review" && (
        cReview.length === 0 ? (
          <EmptyState title="Nothing needs review" description="Every extracted row for this client met the confidence threshold." action={<Link className="v2-btn v2-btn-ghost" to="/v2/review">Open review queue</Link>} />
        ) : (
          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>Document</th><th>Raw text</th><th>Suggestion</th><th>Confidence</th></tr></thead>
              <tbody>
                {cReview.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.docName}</td>
                    <td style={{ color: V.muted, fontSize: 12.5 }}>{r.rawText}</td>
                    <td>{r.suggestion.particulars}</td>
                    <td><Badge tone={r.confidence >= 0.7 ? "warn" : "bad"}>{Math.round(r.confidence * 100)} percent</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === "exceptions" && (
        cEx.length === 0 ? (
          <EmptyState title="No open exceptions" description="Every bank line for this client is matched." action={<Link className="v2-btn v2-btn-ghost" to="/v2/exceptions">Open exception queue</Link>} />
        ) : (
          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>Reason</th><th>Narration</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {cEx.map((e) => (
                  <tr key={e.id}>
                    <td><Badge tone="warn">{e.reason}</Badge></td>
                    <td style={{ color: V.body }}>{e.narration}</td>
                    <td className="num" style={{ color: e.amount < 0 ? V.maroon : V.green }}>{formatINR(e.amount)}</td>
                    <td className="num" style={{ color: V.body }}>{formatDate(e.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === "recon" && (
        <>
          <div className="v2-grid-cards" style={{ marginBottom: 18 }}>
            <Stat label="Bank transactions" value={<AnimatedCounter value={bankRows.length} />} />
            <Stat label="Book transactions" value={<AnimatedCounter value={Math.max(0, bankRows.length - cEx.length)} />} />
            <Stat label="Matched" value={<AnimatedCounter value={matched} />} tone="good" hint={result ? `Last run ${formatDate(result.at)}` : "Run recon to refresh"} />
            <Stat label="Exceptions" value={<AnimatedCounter value={cEx.length} />} tone={cEx.length ? "bad" : "neutral"} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="v2-btn v2-btn-primary"
              disabled={reconRunning}
              onClick={() => { runRecon(client.id, (r) => toast.success(`Recon complete. Matched ${r.matched}, exceptions ${r.exceptions}.`)); toast.success("Recon agent is matching transactions"); }}
            >
              {reconRunning ? "Recon agent is working" : "Run recon"}
            </button>
            <Link className="v2-btn v2-btn-ghost" to="/v2/exceptions">View exception queue</Link>
            <AgentStatusBadge agent="recon" active={reconRunning} label={reconRunning ? "Matching transactions" : "Recon"} />
          </div>
          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>Date</th><th>Particulars</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {bankRows.length === 0 && <tr><td colSpan={4} style={{ color: V.muted, textAlign: "center", padding: 28 }}>No transactions to reconcile yet.</td></tr>}
                {bankRows.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{formatDate(r.date)}</td>
                    <td>{r.particulars}</td>
                    <td className="num" style={{ color: r.amount < 0 ? V.maroon : V.green }}>{formatINR(r.amount)}</td>
                    <td><Badge tone={i < matched ? "good" : "warn"}>{i < matched ? "Matched" : "Unmatched"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === "mis" && (
        cReports.length === 0 ? (
          <EmptyState title="No MIS yet" description="Generate a report for this client and every figure will stay linked to its transactions." action={<button className="v2-btn v2-btn-primary" onClick={() => { generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`)); toast.success("Narrate agent is preparing the MIS"); }}>Generate MIS</button>} />
        ) : (
          <Card style={{ padding: 0 }} className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>Period</th><th>Revenue</th><th>Expenses</th><th>Generated</th></tr></thead>
              <tbody>
                {cReports.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to="/v2/reports/$reportId" params={{ reportId: r.id }} style={{ color: V.ink }}>{r.period}</Link>
                    </td>
                    <td className="num" style={{ color: V.green }}>{formatINR(r.revenue)}</td>
                    <td className="num" style={{ color: V.maroon }}>{formatINR(r.expenses)}</td>
                    <td className="num" style={{ color: V.body }}>{formatDate(r.generated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === "chaser" && (
        cChases.length === 0 ? (
          <EmptyState title="Nothing pending from this client" description="When something is outstanding, create a chase item and track it to closure." action={<Link className="v2-btn v2-btn-primary" to="/v2/chaser">Go to Chaser</Link>} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {cChases.map((c) => (
              <Card key={c.id} hover>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.type}</div>
                    <div style={{ fontSize: 12.5, color: V.body, marginTop: 3 }}>{c.contact} · due {formatDate(c.due)}</div>
                  </div>
                  <Badge tone={c.status === "Escalated" ? "bad" : "warn"}>{c.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )
      )}
      {tab === "activity" && (
        timeline.length === 0 ? (
          <EmptyState title="Nothing has happened yet" description="Every document read, row confirmed, recon run and report generated for this client is recorded here." />
        ) : (
          <Card>
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>What happened on this client</h3>
            <AgentTimeline items={timeline.map((a) => ({ at: a.at, text: a.text, agent: a.agent }))} />
          </Card>
        )
      )}
    </>
  );
}
