/**
 * Today: the partner's and junior's home. What the agents did, what needs a
 * person (each item with its one action), and how far setup has come. Every
 * line is derived from real workspace state.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, MoreHorizontal, Check, CheckCircle2, FileWarning, ListChecks, PhoneCall, PenLine, Sparkles, X } from "lucide-react";
import { Card, V } from "../ui";
import { AGENTS, AgentGlyph, ShimmerText, type AgentKey } from "../agents";
import { useV2, type AgentRunRecord, monthOf } from "../store";
import { openExceptions } from "../lib/exceptions";
import { closeOptions, groupNeeds, tomorrow, visible, type Snoozed } from "../lib/needsView";

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
const TONE_FG: Record<NeedsItem["tone"], string> = { bad: V.maroon, warn: V.warnFg, info: V.brandDeep, good: V.green };

export function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  // The full name: the first word is the surname for many Indian names, so it is never cut down to one word.
  const full = name.trim().replace(/\s+/g, " ");
  return full ? `${part}, ${full}` : part;
}

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Re-renders every half minute so "3m ago" keeps counting without a refresh. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Everything that is waiting on a person, most urgent first. */
export function useNeedsYou(): NeedsItem[] {
  const { clients, docs, review, exceptions, chases, reports, period, isReadyForMis, partnerView, generateReport, isRunning, clientName } = useV2();
  // Sign-off tasks only for someone who can sign off and is working as a Partner.
  const canSignOff = partnerView;
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
        detail: `${c.type}: the follow-ups went unanswered. The Chaser has stopped and handed it to you.`,
        action: { label: "Open chase", to: "/app/chaser" },
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
        action: { label: "Fix", to: `/app/clients/${d.clientId}?tab=documents&doc=${d.id}` },
      });
    }
    // A correction a partner asked for is the team's job until someone marks it done.
    for (const r of reports.filter((r) => r.correction && !r.correction.resolvedAt && !r.signedOff)) {
      items.push({
        key: `corr:${r.id}`,
        rank: 0,
        icon: <FileWarning size={16} />,
        tone: "bad",
        title: `Correct the ${r.template} for ${clientName(r.clientId)}, ${r.period}`,
        detail: `${r.correction!.byName ? `${r.correction!.byName}: ` : ""}"${r.correction!.note}". Fix it, then mark it corrected on the report.`,
        action: { label: "Open report", to: `/app/reports/${r.id}` },
      });
    }
    for (const c of clients) {
      const all = openExceptions(exceptions).filter((e) => e.clientId === c.id);
      const ex = all.filter((e) => monthOf(e.date) === period).length;
      const earlier = all.length - ex;
      if (ex)
        items.push({
          key: `ex:${c.id}`,
          rank: 2,
          icon: <AlertTriangle size={16} />,
          tone: "warn",
          title: `Resolve ${ex} exception${ex === 1 ? "" : "s"} for ${c.name} in ${period}`,
          detail: `Recon matched everything else. Each one has a reason code and suggested matches.${earlier ? ` ${earlier} more from other months: choose All periods in the queue.` : ""}`,
          action: { label: "Resolve", to: `/app/clients/${c.id}?tab=exceptions` },
        });
      else if (earlier)
        items.push({
          key: `exo:${c.id}`,
          rank: 4,
          icon: <AlertTriangle size={16} />,
          tone: "warn",
          title: `${earlier} exception${earlier === 1 ? "" : "s"} from earlier months for ${c.name}`,
          detail: `Nothing open in ${period}. Choose All periods in the Exception Queue to see them.`,
          action: { label: "Open", to: `/app/clients/${c.id}?tab=exceptions` },
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
          action: { label: "Review", to: `/app/clients/${c.id}?tab=review` },
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
                    navigate({ to: "/app/reports/$reportId", params: { reportId: r.id } });
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
          action: { label: "Review MIS", to: `/app/reports/${r.id}` },
        });
      }
    return items.sort((a, b) => a.rank - b.rank);
  }, [clients, docs, review, exceptions, chases, reports, period, isReadyForMis, canSignOff, generateReport, isRunning, clientName, navigate]);
}

const SNOOZE_KEY = "fynhelp.v2.needs.snoozed";
const readSnoozed = (): Snoozed => {
  try { return JSON.parse(window.localStorage.getItem(SNOOZE_KEY) ?? "{}") as Snoozed; } catch { return {}; }
};

/**
 * What waits on a person, grouped by the kind of work and ordered for the role, with a way to close each item that fits its kind.
 * See lib/needsView for the rules.
 */
export function NeedsYou({ items, role = "Partner", onResolveChase }: { items: NeedsItem[]; role?: "Partner" | "Junior"; onResolveChase?: (chaseId: string) => void }) {
  const [snoozed, setSnoozed] = useState<Snoozed>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [showSnoozed, setShowSnoozed] = useState(false);
  useEffect(() => { setSnoozed(readSnoozed()); }, []);
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(null);
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, [menu]);
  const { shown, hidden } = visible(items, snoozed);
  const groups = groupNeeds(shown, role);
  const snooze = (key: string) => {
    const next = { ...snoozed, [key]: tomorrow() };
    setSnoozed(next);
    try { window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* the snooze just is not remembered */ }
    toast.success("It will be back tomorrow if it is still open.");
  };
  const unsnoozeAll = () => {
    setSnoozed({});
    try { window.localStorage.removeItem(SNOOZE_KEY); } catch { /* ignore */ }
  };
  const act = (it: NeedsItem, id: string) => {
    setMenu(null);
    if (id === "snooze") snooze(it.key);
    else if (id === "chase_resolved") { onResolveChase?.(it.key.split(":")[1]!); toast.success("Chase closed. Follow-ups stop."); }
  };
  const row = (it: NeedsItem) => (
    <motion.li key={it.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.25 }} className="today-item" data-need={it.key.split(":")[0]}>
      <span className="today-icon" style={{ background: TONE_BG[it.tone], color: TONE_FG[it.tone] }}>{it.icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{it.title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: V.body, marginTop: 2, lineHeight: 1.45 }}>{it.detail}</span>
      </span>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", position: "relative" }}>
        {it.action.to ? (
          <Link className="v2-btn v2-btn-ghost v2-btn-sm" to={it.action.to.split("?")[0] as never} search={Object.fromEntries(new URLSearchParams(it.action.to.split("?")[1] ?? "")) as never}>
            {it.action.label} <ArrowRight size={13} />
          </Link>
        ) : (
          <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={!it.action.run} data-busy={!it.action.run} onClick={it.action.run}>{it.action.label}</button>
        )}
        <button type="button" className="v2-icon-btn" aria-label={`More options for ${it.title}`} aria-haspopup="menu" aria-expanded={menu === it.key} onClick={(e) => { e.stopPropagation(); setMenu(menu === it.key ? null : it.key); }} style={{ width: 30, height: 30 }} data-testid="need-more">
          <MoreHorizontal size={16} strokeWidth={1.7} />
        </button>
        {menu === it.key && (
          <div role="menu" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 36, zIndex: 20, width: 270, borderRadius: 14, border: `1px solid ${V.line}`, background: "var(--v2-pop)", boxShadow: "0 24px 60px -24px rgba(20,18,16,.45)", padding: 6 }}>
            {closeOptions(it.key).map((o) => (
              <button key={o.id} role="menuitem" type="button" onClick={() => act(it, o.id)} style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", font: "inherit", padding: "9px 11px", borderRadius: 10, cursor: "pointer" }} className="today-menuitem">
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: V.ink }}>{o.label}</span>
                <span style={{ display: "block", fontSize: 12, color: V.muted, marginTop: 1 }}>{o.hint}</span>
              </button>
            ))}
          </div>
        )}
      </span>
    </motion.li>
  );
  return (
    <Card style={{ padding: 0 }} data-testid="needs-you">
      <div style={{ padding: "18px 20px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15.5 }}>Needs you</h3>
        <span style={{ fontSize: 12.5, color: V.muted }}>{shown.length ? `${shown.length} item${shown.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      {shown.length === 0 ? (
        <div style={{ padding: "8px 20px 22px", display: "flex", gap: 12, alignItems: "center", color: V.body, fontSize: 13.5 }}>
          <span style={{ width: 34, height: 34, borderRadius: 999, background: TONE_BG.good, color: V.green, display: "grid", placeItems: "center" }}>
            <CheckCircle2 size={17} />
          </span>
          {hidden.length ? `Nothing else needs you today. ${hidden.length} snoozed until tomorrow.` : "All clear. Your agents have everything they need; new items appear here the moment they need a person."}
        </div>
      ) : (
        groups.map((g) => {
          const cap = open[g.key] ? g.items.length : 3;
          return (
            <section key={g.key} data-group={g.key} aria-label={g.label}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 20px 4px" }}>
                <span style={{ fontSize: 11.5, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, color: V.muted }}>{g.label}</span>
                <span className="pw-count" style={{ minWidth: 20, height: 20, fontSize: 11.5 }}>{g.items.length}</span>
                <span style={{ fontSize: 12, color: V.muted }}>{g.blurb}</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: "0 8px" }}>
                <AnimatePresence initial={false}>{g.items.slice(0, cap).map(row)}</AnimatePresence>
              </ul>
              {g.items.length > 3 && (
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} style={{ border: 0, background: "transparent", font: "inherit", fontSize: 12.5, fontWeight: 650, color: V.maroon, cursor: "pointer", padding: "2px 20px 6px" }}>
                  {open[g.key] ? "Show fewer" : `Show ${g.items.length - 3} more`}
                </button>
              )}
            </section>
          );
        })
      )}
      {hidden.length > 0 && shown.length > 0 && (
        <div style={{ padding: "6px 20px 16px", fontSize: 12.5, color: V.muted }}>
          {hidden.length} snoozed until tomorrow. <button type="button" onClick={showSnoozed ? () => setShowSnoozed(false) : unsnoozeAll} style={{ border: 0, background: "transparent", font: "inherit", fontSize: 12.5, fontWeight: 650, color: V.maroon, cursor: "pointer", padding: 0 }}>Show them now</button>
        </div>
      )}
      <div style={{ height: 8 }} />
    </Card>
  );
}

const TRIGGER: Record<string, string> = { user: "by your team", pipeline: "automatically", schedule: "on schedule", retry: "retry", channel: "on arrival" };

export function AgentActivity({ runs, onClose }: { runs: AgentRunRecord[]; onClose?: () => void }) {
  const { clientName } = useV2();
  useNow();
  const recent = runs.slice(0, 7);
  return (
    <Card data-testid="agent-activity">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 15.5 }}>Agent activity</h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, color: V.muted }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title="Updates by itself">
            <span className="v2-dot" style={{ background: V.green }} /> Live
          </span>
          {onClose && (
            <button type="button" className="v2-icon-btn" onClick={onClose} aria-label="Hide agent activity" title="Hide agent activity" data-testid="activity-close" style={{ width: 28, height: 28 }}>
              <X size={14} />
            </button>
          )}
        </span>
      </div>
      {recent.length === 0 ? (
        <p style={{ fontSize: 13, color: V.muted, margin: 0 }}>Upload a document and each agent's work shows up here as it happens.</p>
      ) : (
        <ul className="today-feed" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          <AnimatePresence initial={false}>
            {recent.map((r) => {
              const a = AGENTS[(r.agent in AGENTS ? r.agent : "extract") as AgentKey];
              return (
                <motion.li
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 10 }}
                >
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
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

const AGENT_ORDER: AgentKey[] = ["extract", "recon", "narrate", "chaser"];

/**
 * The four agents at a glance. Quiet when idle (a dim dot and when they last worked); when one is working it
 * glows, shows what it is on, and settles back by itself when it finishes. Widths are fixed so nothing jumps.
 */
export function AgentStrip({ live, last }: { live: Record<AgentKey, { count: number; what?: string }>; last: Partial<Record<AgentKey, string>> }) {
  useNow();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }} aria-label="Agent status" role="status" aria-live="polite">
      {AGENT_ORDER.map((k) => {
        const a = AGENTS[k];
        const busy = live[k].count > 0;
        return (
          <motion.div
            key={k}
            animate={{ boxShadow: busy ? `0 0 0 1px ${a.dot}55, 0 10px 26px -14px ${a.dot}` : `0 0 0 1px var(--v2-line), 0 0 0 0 transparent` }}
            transition={{ duration: 0.4 }}
            style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 14px 6px 7px", borderRadius: 999, background: V.card, minWidth: 168 }}
          >
            <AgentGlyph agent={k} state={busy ? "running" : "idle"} size={26} />
            <span style={{ display: "grid", lineHeight: 1.25, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                {busy ? <ShimmerText text={`${a.name} working`} agent={k} duration={1.8} /> : a.name}
              </span>
              <span className="truncate" style={{ fontSize: 11, color: V.muted, maxWidth: 150 }}>
                {busy ? (live[k].what ?? a.verb) : last[k] ? `Last run ${ago(last[k] as string)}` : "Ready"}
              </span>
            </span>
          </motion.div>
        );
      })}
    </div>
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
    { label: "Add a client", done: clients.length > 0, to: "/app/clients" },
    { label: "Upload a bank statement", done: docs.some((d) => d.side !== "books" && d.status !== "Failed"), to: "/app/documents" },
    { label: "Upload the books (Tally or ledger)", done: docs.some((d) => d.side === "books" && d.status !== "Failed"), to: "/app/documents" },
    { label: "Reconcile a month", done: rows.some((r) => r.matchStatus === "matched"), to: clients[0] ? `/app/clients/${clients[0].id}?tab=recon` : "/app/clients" },
    { label: "Generate an MIS", done: reports.length > 0, to: "/app/reports" },
    { label: "Connect Gmail intake", done: Boolean(firm?.gmailConnected), to: "/app/settings" },
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
.today-grid[data-panel="closed"] { grid-template-columns:minmax(0,1fr); }
.today-main { display:grid; gap:18px; min-width:0; }
/* The side panel stays in view while the page scrolls, and scrolls inside itself when it is taller than the screen. */
.today-aside { position:sticky; top:82px; max-height:calc(100vh - 106px); overflow-y:auto; overscroll-behavior:contain; display:grid; gap:18px; align-content:start; min-width:0; scrollbar-width:thin; }
.today-feed { max-height:min(46vh, 420px); overflow-y:auto; padding-right:4px !important; scrollbar-width:thin; }
@media (max-width:1100px){ .today-grid { grid-template-columns:minmax(0,1fr); } .today-aside { position:static; max-height:none; overflow:visible; order:-1; } }
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

