import { useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Stat, Tabs, V, formatDate, formatINR } from "../ui";
import { AgentGlyph, AgentStatusBadge, AgentTimeline, AnimatedCounter, ShimmerText } from "../agents";
import { monthOf, useV2 } from "../store";
import { CloseProgress, NextAction } from "../components/CloseProgress";
import { AgentRunsCard } from "../components/AgentRuns";
import { ReconGuide } from "../components/ReconGuide";
import { Link2 } from "lucide-react";
import DocumentsPage from "./DocumentsPage";
import ReviewPage from "./ReviewPage";
import ExceptionsPage from "./ExceptionsPage";
import ReportsPage from "./ReportsPage";
import ChaserPage from "./ChaserPage";
import { parsePeriod } from "@/lib/practice/core";
import { openExceptionsIn } from "../lib/exceptions";

const STATUS_LABEL: Record<string, string> = { matched: "Matched", exception: "Exception", unmatched: "Not run", ignored: "Ignored" };

export default function ClientWorkspacePage() {
  const { clientId } = useParams({ from: "/v2/clients/$clientId" });
  const { clients, docs, exceptions, reports, chases, review, runs, recon, runRecon, generateReport, period, closeStateFor, activityFor, agentRunsFor, isReadyForMis } = useV2();
  const client = clients.find((c) => c.id === clientId);
  // Deep links from Today ("Resolve exceptions") open the right tab: /v2/clients/:id?tab=exceptions
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "overview";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && ["overview", "documents", "review", "exceptions", "recon", "mis", "chaser", "activity"].includes(t) ? t : "overview";
  });

  // "Fix" in Needs you names the failed file: /v2/clients/:id?tab=documents&doc=<id>
  const focusDoc = typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("doc") ?? undefined;

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
  // Counted for the month on screen, like the Exception Queue it opens.
  const cEx = openExceptionsIn(exceptions, monthOf, period).filter((e) => e.clientId === client.id);
  const cReview = review.filter((r) => r.clientId === client.id && r.status === "open");
  const cReports = reports.filter((r) => r.clientId === client.id);
  const close = closeStateFor(client.id);
  const timeline = activityFor(client.id);

  const runNext = () => {
    if (close.next.action === "recon") {
      startRecon();
      setTab("recon");
      return;
    }
    if (close.next.action === "mis") {
      generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`));
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
  // Recon needs both sides: when one is missing, take the person to the guide that supplies it.
  const startRecon = () => {
    if (!bankSide.length || !bookSide.length) {
      setTab("recon");
      toast.info(`Recon needs the ${!bankSide.length && !bookSide.length ? "bank statement and the books" : !bankSide.length ? "bank statement" : "books"} for ${period}. Upload, pick a file or ask the client below.`);
      return;
    }
    runRecon(client.id, (r) => toast.success(`Recon complete. Matched ${r.matched}, exceptions ${r.exceptions}.`));
  };
  const [matchTxn, setMatchTxn] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  // One click from any unmatched line to the matching drawer.
  const matchLine = (txnId: string) => {
    setMatchTxn(txnId);
    setTab("exceptions");
  };
  const matchedBank = bankSide.filter((r) => r.matchStatus === "matched").length;
  const ignoredBank = bankSide.filter((r) => r.matchStatus === "ignored").length;
  const clientRuns = runs.filter((r) => r.target === client.id || r.clientId === client.id);
  const reconRunning = clientRuns.some((r) => r.agent === "recon" && r.status === "running");
  const narrateRunning = clientRuns.some((r) => r.agent === "narrate" && r.status === "running");
  // The last run only describes this card when it was for the month on screen.
  const result = recon[client.id]?.period && recon[client.id]?.period !== period ? undefined : recon[client.id];
  const periodEx = cEx.filter((e) => !range || (e.date >= range.start && e.date <= range.end));

  // "All clear" only once this month has documents and nothing is open.
  const reading = cDocs.some((d) => d.status === "Uploading" || d.status === "Processing" || d.status === "Queued");
  const monthHasData = bankSide.length + bookSide.length > 0 || cDocs.some((d) => d.register && (!range || (d.date >= range.start && d.date <= range.end)));
  const status = cDocs.length === 0 && !reading
    ? { label: "Not started", tone: "neutral" as const }
    : !monthHasData
    ? reading
      ? { label: "Reading documents", tone: "info" as const }
      : { label: "Waiting for documents", tone: "neutral" as const }
    : cEx.length > 0
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
          <ReconGuide clientId={client.id} onUpload={() => setTab("documents")} onTab={setTab} />
          {isReadyForMis(client.id, period) && cEx.length === 0 && cReview.length === 0 && !cReports.some((r) => r.period === period) && (
            <Card style={{ marginBottom: 18, background: "rgba(31,90,70,0.07)", borderColor: "rgba(31,90,70,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{period} is ready for its MIS</div>
                  <div style={{ fontSize: 13, color: V.body, marginTop: 3 }}>
                    The agents reconciled the month and nothing is waiting in Review or Exceptions.
                  </div>
                </div>
                <button className="v2-btn v2-btn-primary" onClick={() => { generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`)); setTab("mis"); }}>
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
              <button className="v2-btn v2-btn-primary" disabled={reconRunning} data-working={reconRunning} onClick={startRecon}>
                {reconRunning ? <><AgentGlyph agent="recon" state="running" size={20} /><ShimmerText text="Recon is matching…" tone="light" /></> : "Run recon"}
              </button>
              <button className="v2-btn v2-btn-ghost" disabled={narrateRunning} data-working={narrateRunning} onClick={() => { generateReport(client.id, period, "Monthly MIS", () => toast.success(`${period} MIS ready`)); }}>
                {narrateRunning ? <><AgentGlyph agent="narrate" state="running" size={20} /><ShimmerText text="Narrate is preparing…" agent="narrate" /></> : "Generate MIS"}
              </button>
              <Link className="v2-btn v2-btn-ghost" to="/v2/documents">Upload documents</Link>
            </div>
            <div style={{ fontSize: 12.5, color: V.muted, marginTop: 14 }}>
              Last MIS: {client.lastMis ? formatDate(client.lastMis) : "Not generated yet"}
            </div>
          </Card>
        </motion.div>
      )}

      {tab === "documents" && <DocumentsPage clientId={client.id} focusDocId={focusDoc} />}

      {tab === "review" && <ReviewPage clientId={client.id} />}

      {tab === "exceptions" && <ExceptionsPage clientId={client.id} focusTxnId={matchTxn ?? undefined} onFocused={() => setMatchTxn(null)} />}

      {tab === "recon" && (
        <>
          <ReconGuide clientId={client.id} onUpload={() => setTab("documents")} onTab={setTab} />
          <div className="v2-grid-cards" style={{ marginBottom: 18 }}>
            <Stat label="Bank transactions" value={<AnimatedCounter value={bankSide.length} />} hint={`Dated in ${period}`} />
            <Stat label="Book transactions" value={<AnimatedCounter value={bookSide.length} />} hint={`Dated in ${period}`} />
            <Stat label="Matched" value={<AnimatedCounter value={matchedBank} />} tone="good" hint={result ? `Last run ${formatDate(result.at)}` : matchedBank ? `Matched in ${period}` : "Run recon to match"} />
            <Stat label="Unmatched" value={<AnimatedCounter value={bankSide.length - matchedBank - ignoredBank} />} tone={bankSide.length - matchedBank - ignoredBank ? "bad" : "neutral"} hint={`${periodEx.length} open exception${periodEx.length === 1 ? "" : "s"} in ${period}`} onClick={() => setTab("exceptions")} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="v2-btn v2-btn-primary"
              disabled={reconRunning}
              data-working={reconRunning}
              onClick={startRecon}
            >
              {reconRunning ? <><AgentGlyph agent="recon" state="running" size={20} /><ShimmerText text="Recon agent is working" tone="light" /></> : `Run recon for ${period}`}
            </button>
            <button className="v2-btn v2-btn-ghost" onClick={() => setTab("exceptions")}>View exceptions</button>
            <AgentStatusBadge agent="recon" active={reconRunning} label={reconRunning ? "Matching transactions" : "Exact, fuzzy, then rules"} />
          </div>
          {bankSide.length === 0 && bookSide.length === 0 ? (
            <EmptyState title={`Nothing dated in ${period} yet`} description="Upload the bank statement and the Tally export or ledger for this month, then run recon." action={<button className="v2-btn v2-btn-primary" onClick={() => setTab("documents")}>Upload documents</button>} />
          ) : (
            <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="Show">
              {([[true, `Needs matching · ${inPeriod.filter((r) => r.matchStatus !== "matched" && r.matchStatus !== "ignored").length}`], [false, `All lines · ${inPeriod.length}`]] as const).map(([v, l]) => (
                <button key={String(v)} className={`v2-btn v2-btn-sm ${onlyOpen === v ? "v2-btn-primary" : "v2-btn-ghost"}`} aria-pressed={onlyOpen === v} onClick={() => setOnlyOpen(v)}>{l}</button>
              ))}
              <span style={{ fontSize: 12.5, color: V.muted }}>Press Match on a line to pick its other side, add a note if amounts differ, and it counts in the MIS.</span>
            </div>
            <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(min(420px, 100%), 1fr))" }}>
              {([["Bank side", bankSide], ["Books side", bookSide]] as const).map(([label, all]) => { const rows = onlyOpen ? all.filter((r) => r.matchStatus !== "matched" && r.matchStatus !== "ignored") : all; return (
                <Card key={label} style={{ padding: 0 }} className="v2-scroll">
                  <div style={{ padding: "14px 16px 0", fontWeight: 600 }}>{label} <span style={{ color: V.muted, fontWeight: 400 }}>· {rows.length}</span></div>
                  <table className="v2-table v2-table-stack">
                    <thead><tr><th>Date</th><th>Particulars</th><th>Amount</th><th>Status</th><th className="v2-sticky-end" /></tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={5} style={{ color: V.muted, textAlign: "center", padding: 22 }}>{all.length && onlyOpen ? "Every line here is matched or decided." : label === "Bank side" ? "No bank statement lines yet." : "No book entries yet. Upload the Tally export or ledger."}</td></tr>}
                      {rows.map((r, i) => (
                        <tr key={r.id ?? i}>
                          <td className="num">{formatDate(r.date)}</td>
                          <td>{r.particulars}</td>
                          <td className="num" style={{ color: r.amount < 0 ? V.maroon : V.green }}>{formatINR(r.amount)}</td>
                          <td><Badge tone={r.matchStatus === "matched" ? "good" : r.matchStatus === "exception" ? "bad" : r.matchStatus === "ignored" ? "neutral" : "warn"}>{STATUS_LABEL[r.matchStatus ?? "unmatched"] ?? r.matchStatus}</Badge></td>
                          <td className="v2-sticky-end" style={{ textAlign: "right" }}>
                            {r.id && r.matchStatus !== "matched" && r.matchStatus !== "ignored" && (
                              r.matchStatus === "exception" || exceptions.some((e) => e.status === "open" && e.txnId === r.id) ? (
                                <button className="v2-btn v2-btn-quiet" onClick={() => matchLine(r.id!)} aria-label={`Match ${r.particulars}`}><Link2 size={14} /> Match</button>
                              ) : (
                                <button className="v2-btn v2-btn-quiet" onClick={startRecon} disabled={reconRunning} title="Recon has not looked at this line yet">Run recon</button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ); })}
            </div>
            </>
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
