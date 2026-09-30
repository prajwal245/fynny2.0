/**
 * Today: the partner's and junior's home. What the agents did, what needs a
 * person (each item with its one action), and how far setup has come. Every
 * line is derived from real workspace state.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, FileWarning, ListChecks, PhoneCall, PenLine, Sparkles, X } from "lucide-react";
import { Card, V } from "../ui";
import { AGENTS, type AgentKey } from "../agents";
import { useV2, type AgentRunRecord } from "../store";

export type NeedsItem = {
  key: string;
  rank: number;
  icon: React.ReactNode;
  tone: "bad" | "warn" | "info" | "good";
  title: string;
  detail: string;
  action: { label: string; to?: string; run?: () => void };
};

const TONE_BG: Record<NeedsItem["tone"], string> = {
  bad: "rgba(169,56,56,.10)",
  warn: "rgba(176,122,24,.12)",
  info: "rgba(74,143,191,.12)",
  good: "rgba(31,90,70,.12)",
};
const TONE_FG: Record<NeedsItem["tone"], string> = { bad: V.maroon, warn: "#8A5A00", info: "#1B4763", good: V.green };

export function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.trim().replace(/^(ca|cs|cma|dr|mr|mrs|ms)\.?\s+/i, "").split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Everything that is waiting on a person, most urgent first. */
export function useNeedsYou(): NeedsItem[] {
  const { clients, docs, review, exceptions, chases, reports, period, isReadyForMis, canSignOff, generateReport, isRunning, clientName } = useV2();
  const navigate = useNavigate();
  return useMemo(() => {
    const items: NeedsItem[] = [];
    for (const c of chases.filter((c) => c.status === "Escalated")) {
      items.push({
        key: `chase:${c.id}`,
        rank: 0,
        icon: <PhoneCall size={16} />,
        tone: "bad",
        title: `Call ${clientName(c.clientId)}`,
        detail: `${c.type}: two follow-ups went unanswered. The Chaser has stopped and handed it to you.`,
        action: { label: "Open chase", to: "/v2/chaser" },
      });
    }
    for (const d of docs.filter((d) => d.clientId && d.status === "Failed" && !d.retryAt)) {
      items.push({
        key: `doc:${d.id}`,
        rank: 1,
        icon: <FileWarning size={16} />,
        tone: "bad",
        title: `${d.name} needs attention`,
        detail: d.error ?? "The Extract agent could not read this file.",
        action: { label: "Fix", to: `/v2/clients/${d.clientId}?tab=documents` },
      });
    }
    for (const c of clients) {
      const ex = exceptions.filter((e) => e.clientId === c.id && e.status === "open").length;
      if (ex)
        items.push({
          key: `ex:${c.id}`,
          rank: 2,
          icon: <AlertTriangle size={16} />,
          tone: "warn",
          title: `Resolve ${ex} exception${ex === 1 ? "" : "s"} for ${c.name}`,
          detail: "Recon matched everything else. Each one has a reason code and suggested matches.",
          action: { label: "Resolve", to: `/v2/clients/${c.id}?tab=exceptions` },
        });
      const rv = review.filter((r) => r.clientId === c.id && r.status === "open").length;
      if (rv)
        items.push({
          key: `rv:${c.id}`,
          rank: 3,
          icon: <ListChecks size={16} />,
          tone: "info",
          title: `Confirm ${rv} line${rv === 1 ? "" : "s"} for ${c.name}`,
          detail: "The Extract agent was unsure about these. Your answer is remembered for next month.",
          action: { label: "Review", to: `/v2/clients/${c.id}?tab=review` },
        });
      const hasReport = reports.some((r) => r.clientId === c.id && r.period === period);
      if (isReadyForMis(c.id, period) && !hasReport && !ex && !rv) {
        const running = isRunning("narrate", c.id);
        items.push({
          key: `mis:${c.id}`,
          rank: 4,
          icon: <Sparkles size={16} />,
          tone: "good",
          title: `${c.name} is ready for its ${period} MIS`,
          detail: "Reconciled with nothing open. Narrate writes it from matched transactions only.",
          action: {
            label: running ? "Narrate is preparing…" : "Generate MIS",
            run: running
              ? undefined
              : () =>
                  generateReport(c.id, period, "Monthly MIS", (r) => {
                    toast.success(`${c.name}: ${period} MIS ready for sign-off`);
                    navigate({ to: "/v2/reports/$reportId", params: { reportId: r.id } });
                  }),
          },
        });
      }
    }
    if (canSignOff)
      for (const r of reports.filter((r) => !r.signedOff && !r.correction)) {
        items.push({
          key: `so:${r.id}`,
          rank: 5,
          icon: <PenLine size={16} />,
          tone: "info",
          title: `Sign off ${clientName(r.clientId)} · ${r.period}`,
          detail: "Open any number to see the transactions behind it, then accept or send it back.",
          action: { label: "Review MIS", to: `/v2/reports/${r.id}` },
        });
      }
    return items.sort((a, b) => a.rank - b.rank);
  }, [clients, docs, review, exceptions, chases, reports, period, isReadyForMis, canSignOff, generateReport, isRunning, clientName, navigate]);
}

export function NeedsYou({ items }: { items: NeedsItem[] }) {
  return (
    <Card style={{ padding: 0 }} data-testid="needs-you">
      <div style={{ padding: "18px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15.5 }}>Needs you</h3>
        <span style={{ fontSize: 12.5, color: V.muted }}>{items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "8px 20px 22px", display: "flex", gap: 12, alignItems: "center", color: V.body, fontSize: 13.5 }}>
          <span style={{ width: 34, height: 34, borderRadius: 999, background: TONE_BG.good, color: V.green, display: "grid", placeItems: "center" }}>
            <CheckCircle2 size={17} />
          </span>
          All clear. Your agents have everything they need; new items appear here the moment they need a person.
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 8px 8px" }}>
          <AnimatePresence initial={false}>
            {items.slice(0, 8).map((it) => (
              <motion.li
                key={it.key}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.25 }}
                className="today-item"
                data-need={it.key.split(":")[0]}
              >
                <span className="today-icon" style={{ background: TONE_BG[it.tone], color: TONE_FG[it.tone] }}>{it.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{it.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: V.body, marginTop: 2, lineHeight: 1.45 }}>{it.detail}</span>
                </span>
                {it.action.to ? (
                  <Link className="v2-btn v2-btn-ghost v2-btn-sm" to={it.action.to}>{it.action.label} <ArrowRight size={13} /></Link>
                ) : (
                  <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={!it.action.run} data-busy={!it.action.run} onClick={it.action.run}>{it.action.label}</button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {items.length > 8 && <div style={{ padding: "0 20px 16px", fontSize: 12.5, color: V.muted }}>{items.length - 8} more across your clients</div>}
    </Card>
  );
}

const TRIGGER: Record<string, string> = { user: "by your team", pipeline: "automatically", schedule: "on schedule", retry: "retry", channel: "on arrival" };

export function AgentActivity({ runs }: { runs: AgentRunRecord[] }) {
  const { clientName } = useV2();
  const recent = runs.slice(0, 7);
  return (
    <Card data-testid="agent-activity">
      <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Agent activity</h3>
      {recent.length === 0 ? (
        <p style={{ fontSize: 13, color: V.muted, margin: 0 }}>Upload a document and each agent's work shows up here as it happens.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {recent.map((r) => {
            const a = AGENTS[(r.agent in AGENTS ? r.agent : "extract") as AgentKey];
            return (
              <li key={r.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 10 }}>
                <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: 999, background: r.status === "failed" ? V.maroon : a.dot }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, lineHeight: 1.45 }}>
                    <b>{a.name}</b> · {r.status === "failed" ? (r.error ?? r.summary) : r.summary}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: V.muted, marginTop: 2 }}>
                    {r.clientId ? `${clientName(r.clientId)} · ` : ""}
                    {TRIGGER[r.trigger] ?? r.trigger} · {ago(r.at)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const SETUP_KEY = "fynhelp.v2.setup.dismissed";

export function SetupChecklist() {
  const { clients, docs, reports, firm } = useV2();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(SETUP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const rows = docs.flatMap((d) => d.rows);
  const steps = [
    { label: "Add a client", done: clients.length > 0, to: "/v2/clients" },
    { label: "Upload a bank statement", done: docs.some((d) => d.side !== "books" && d.status !== "Failed"), to: "/v2/documents" },
    { label: "Upload the books (Tally or ledger)", done: docs.some((d) => d.side === "books" && d.status !== "Failed"), to: "/v2/documents" },
    { label: "Reconcile a month", done: rows.some((r) => r.matchStatus === "matched"), to: clients[0] ? `/v2/clients/${clients[0].id}?tab=recon` : "/v2/clients" },
    { label: "Generate an MIS", done: reports.length > 0, to: "/v2/reports" },
    { label: "Connect Gmail intake", done: Boolean(firm?.gmailConnected), to: "/v2/settings" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  return (
    <Card data-testid="setup-checklist">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h3 style={{ fontSize: 15.5 }}>Get set up</h3>
        <button
          className="v2-btn v2-btn-quiet v2-btn-sm"
          aria-label="Hide setup checklist"
          onClick={() => {
            try {
              localStorage.setItem(SETUP_KEY, "1");
            } catch {
              /* private mode */
            }
            setHidden(true);
          }}
        >
          <X size={13} />
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: V.muted, margin: "4px 0 12px" }}>{done} of {steps.length} done</div>
      <div className="v2-bar" style={{ marginBottom: 14 }}>
        <motion.i initial={false} animate={{ width: `${(done / steps.length) * 100}%` }} transition={{ duration: 0.4 }} style={{ background: V.green, animation: "none", marginLeft: 0 }} />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {steps.map((s) => (
          <li key={s.label}>
            <Link to={s.to} className="today-step" data-done={s.done}>
              <span className="today-check">{s.done ? <Check size={11} strokeWidth={3} /> : null}</span>
              <span>{s.label}</span>
              {!s.done && <ArrowRight size={13} style={{ marginLeft: "auto", color: V.muted }} />}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** One-line summary of what the agents did this week, from recorded runs. */
export function agentSummary(runs: AgentRunRecord[], needs: number) {
  const week = Date.now() - 7 * 86400000;
  const recent = runs.filter((r) => new Date(r.at).getTime() > week && r.status === "succeeded");
  const read = recent.filter((r) => r.agent === "extract").length;
  const recons = recent.filter((r) => r.agent === "recon").length;
  const mis = recent.filter((r) => r.agent === "narrate").length;
  const parts: string[] = [];
  if (read) parts.push(`read ${read} document${read === 1 ? "" : "s"}`);
  if (recons) parts.push(`reconciled ${recons} time${recons === 1 ? "" : "s"}`);
  if (mis) parts.push(`drafted ${mis} MIS`);
  const did = parts.length ? `This week your agents ${parts.join(", ")}.` : "Your agents are ready for the first documents.";
  const waits = needs ? ` ${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you.` : " Nothing needs you right now.";
  return did + waits;
}

export const TODAY_STYLES = `
.today-grid { display:grid; gap:18px; grid-template-columns:minmax(0,1fr) minmax(0,340px); align-items:start; }
@media (max-width:1100px){ .today-grid { grid-template-columns:minmax(0,1fr); } }
.today-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:center; padding:12px; border-radius:14px; }
.today-item:hover { background:${V.gray}; }
.today-icon { width:34px; height:34px; border-radius:11px; display:grid; place-items:center; }
@media (max-width:560px){ .today-item { grid-template-columns:auto minmax(0,1fr); } .today-item > :last-child { grid-column:2; justify-self:start; } }
.today-step { display:flex; align-items:center; gap:10px; padding:8px 8px; border-radius:10px; font-size:13px; color:${V.ink}; text-decoration:none; }
.today-step:hover { background:${V.gray}; }
.today-step[data-done="true"] { color:${V.muted}; text-decoration:line-through; }
.today-check { width:18px; height:18px; border-radius:999px; border:1.5px solid ${V.line}; display:grid; place-items:center; color:#fff; flex:0 0 auto; }
.today-step[data-done="true"] .today-check { background:${V.green}; border-color:${V.green}; }
.today-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; }
.today-kpis > div { padding:14px 18px; border-left:1px solid ${V.line}; }
.today-kpis > div:first-child { border-left:0; }
@media (max-width:640px){ .today-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .today-kpis > div:nth-child(3) { border-left:0; } }
`;

