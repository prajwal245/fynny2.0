import { useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Stat, Tabs, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, AgentTimeline, AnimatedCounter, ProcessingCard } from "../agents";
import { useV2 } from "../store";
import { CloseProgress, NextAction } from "../components/CloseProgress";
import { AgentRunsCard } from "../components/AgentRuns";
import DocumentsPage from "./DocumentsPage";
import ReviewPage from "./ReviewPage";
import ExceptionsPage from "./ExceptionsPage";
import ReportsPage from "./ReportsPage";
import ChaserPage from "./ChaserPage";
import { parsePeriod } from "@/lib/practice/core";

const STATUS_LABEL: Record<string, string> = { matched: "Matched", exception: "Exception", unmatched: "Not run", ignored: "Ignored" };

export default function ClientWorkspacePage() {
  const { clientId } = useParams({ from: "/v2/clients/$clientId" });
  const { clients, docs, exceptions, reports, chases, review, runs, recon, runRecon, generateReport, period, closeStateFor, activityFor, agentRunsFor, isReadyForMis } = useV2();
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
  let range: { start: string; end: string } | null = null;
  try { range = parsePeriod(period); } catch { range = null; }
  const inPeriod = cDocs.flatMap((d) => d.rows).filter((r) => !range || (r.date >= range.start && r.date <= range.end)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const bankSide = inPeriod.filter((r) => r.side !== "books");
  const bookSide = inPeriod.filter((r) => r.side === "books");
  const matchedBank = bankSide.filter((r) => r.matchStatus === "matched").length;
  const ignoredBank = bankSide.filter((r) => r.matchStatus === "ignored").length;
  const clientRuns = runs.filter((r) => r.target === client.id);
  const reconRunning = clientRuns.some((r) => r.agent === "recon");
  const result = recon[client.id];

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
          { value: "activity", label: "Activity", count: timeline.length + agentRunsFor(client.id).length },
        ]}
      />

      {tab === "overview" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {isReadyForMis(client.id, period) && cEx.length === 0 && cReview.length === 0 && !cReports.some((r) => r.period === period) && (
            <Card style={{ marginBottom: 18, background: "rgba(31,90,70,0.07)", borderColor: "rgba(31,90,70,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{period} is ready for its MIS</div>
                  <div style={{ fontSize: 13, color: V.body, marginTop: 3 }}>
                    The agents reconciled the month and nothing is waiting in Review or Exceptions.
                  </div>
                </div>
                <button className="v2-btn v2-btn-primary" onClick={() => { generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`)); toast.success("Narrate agent is preparing the MIS"); setTab("mis"); }}>
                  Generate MIS
                </button>
              </div>
            </Card>
          )}
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

      {tab === "documents" && <DocumentsPage clientId={client.id} />}

      {tab === "review" && <ReviewPage clientId={client.id} />}

      {tab === "exceptions" && <ExceptionsPage clientId={client.id} />}

      {tab === "recon" && (
        <>
          <div className="v2-grid-cards" style={{ marginBottom: 18 }}>
            <Stat label="Bank transactions" value={<AnimatedCounter value={bankSide.length} />} hint={`Dated in ${period}`} />
            <Stat label="Book transactions" value={<AnimatedCounter value={bookSide.length} />} hint={`Dated in ${period}`} />
            <Stat label="Matched" value={<AnimatedCounter value={matchedBank} />} tone="good" hint={result ? `Last run ${formatDate(result.at)}` : "Run recon to match"} />
            <Stat label="Unmatched" value={<AnimatedCounter value={bankSide.length - matchedBank - ignoredBank} />} tone={bankSide.length - matchedBank - ignoredBank ? "bad" : "neutral"} hint={`${cEx.length} open exception${cEx.length === 1 ? "" : "s"}`} onClick={() => setTab("exceptions")} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="v2-btn v2-btn-primary"
              disabled={reconRunning}
              onClick={() => { runRecon(client.id, (r) => toast.success(`Recon complete. Matched ${r.matched}, exceptions ${r.exceptions}.`)); toast.success("Recon agent is matching transactions"); }}
            >
              {reconRunning ? "Recon agent is working" : `Run recon for ${period}`}
            </button>
            <button className="v2-btn v2-btn-ghost" onClick={() => setTab("exceptions")}>View exceptions</button>
            <AgentStatusBadge agent="recon" active={reconRunning} label={reconRunning ? "Matching transactions" : "Exact, fuzzy, then rules"} />
          </div>
          {bankSide.length === 0 && bookSide.length === 0 ? (
            <EmptyState title={`Nothing dated in ${period} yet`} description="Upload the bank statement and the Tally export or ledger for this month, then run recon." action={<button className="v2-btn v2-btn-primary" onClick={() => setTab("documents")}>Upload documents</button>} />
          ) : (
            <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))" }}>
              {([["Bank side", bankSide], ["Books side", bookSide]] as const).map(([label, rows]) => (
                <Card key={label} style={{ padding: 0 }} className="v2-scroll">
                  <div style={{ padding: "14px 16px 0", fontWeight: 600 }}>{label} <span style={{ color: V.muted, fontWeight: 400 }}>· {rows.length}</span></div>
                  <table className="v2-table">
                    <thead><tr><th>Date</th><th>Particulars</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={4} style={{ color: V.muted, textAlign: "center", padding: 22 }}>{label === "Bank side" ? "No bank statement lines yet." : "No book entries yet. Upload the Tally export or ledger."}</td></tr>}
                      {rows.map((r, i) => (
                        <tr key={r.id ?? i}>
                          <td className="num">{formatDate(r.date)}</td>
                          <td>{r.particulars}</td>
                          <td className="num" style={{ color: r.amount < 0 ? V.maroon : V.green }}>{formatINR(r.amount)}</td>
                          <td><Badge tone={r.matchStatus === "matched" ? "good" : r.matchStatus === "exception" ? "bad" : r.matchStatus === "ignored" ? "neutral" : "warn"}>{STATUS_LABEL[r.matchStatus ?? "unmatched"] ?? r.matchStatus}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "mis" && <ReportsPage clientId={client.id} />}

      {tab === "chaser" && <ChaserPage clientId={client.id} />}
      {tab === "activity" && (
        <div style={{ marginBottom: 18 }}>
          <AgentRunsCard clientId={client.id} />
        </div>
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
