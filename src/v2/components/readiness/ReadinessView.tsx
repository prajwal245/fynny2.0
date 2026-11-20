import { useMemo, type ReactNode } from "react";
import { ArrowRight, Building2, Check, CircleDashed, FileSpreadsheet, Globe, Landmark, Lock, Minus, Send, Users, Wallet, type LucideIcon } from "lucide-react";
import { Segmented, V } from "../../ui";
import {
  CHECKS, HOLDER_LABEL, INPUTS, PACKS, allChecks, packProgress, whatItUnblocks,
  type CheckState, type Holder, type InputDef, type InputStates, type Pack,
} from "@/lib/practice/readiness/model";

const HOLDER_ICON: Record<Holder, LucideIcon> = { client: Building2, tally: FileSpreadsheet, bank: Landmark, gst_portal: Globe, it_portal: Globe, lender: Wallet, party: Users };

export const READINESS_CSS = `
.rd { display:grid; gap:18px; }
.rd-hero { display:grid; grid-template-columns: auto 1fr auto; gap:28px; align-items:center; padding:26px 28px; border-radius:24px; border:1px solid ${V.line};
  background: radial-gradient(120% 140% at 0% 0%, rgba(217,43,43,.10), transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(234,219,200,.55), transparent 60%), ${V.card};
  box-shadow: var(--v2-card-shadow); }
.rd-ring { position:relative; width:116px; height:116px; }
.rd-ring b { position:absolute; inset:0; display:grid; place-items:center; font-size:28px; font-weight:700; letter-spacing:-.03em; color:${V.ink}; }
.rd-ring small { position:absolute; left:0; right:0; bottom:27px; text-align:center; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:${V.muted}; font-weight:600; }
.rd-kicker { font-size:11.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; color:${V.maroon}; }
.rd-h { margin:6px 0 6px; font-size:24px; line-height:1.2; font-weight:650; letter-spacing:-.025em; color:${V.ink}; }
.rd-sub { margin:0; font-size:14px; color:${V.body}; line-height:1.55; max-width:56ch; }
.rd-stats { display:grid; grid-template-columns:repeat(3, minmax(92px,1fr)); gap:10px; }
.rd-stat { padding:14px 16px; border-radius:16px; background:rgba(255,255,255,.6); border:1px solid ${V.line}; backdrop-filter: blur(6px); text-align:left; }
.rd-stat b { display:block; font-size:26px; font-weight:700; letter-spacing:-.03em; line-height:1.1; }
.rd-stat span { font-size:12px; color:${V.muted}; font-weight:550; }
.rd-main { display:grid; grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); gap:18px; align-items:start; }
.rd-card { border-radius:20px; border:1px solid ${V.line}; background:${V.card}; box-shadow: var(--v2-card-shadow); overflow:hidden; }
.rd-card > header { display:flex; align-items:center; gap:10px; padding:16px 20px; border-bottom:1px solid ${V.line}; }
.rd-card > header h3 { margin:0; font-size:15px; font-weight:650; letter-spacing:-.01em; }
.rd-card > header .rd-n { margin-left:auto; font-size:12.5px; color:${V.muted}; font-weight:600; }
.rd-ico { width:30px; height:30px; border-radius:10px; display:grid; place-items:center; background:${V.cream}; color:${V.maroon}; flex:none; }
.rd-row { display:grid; grid-template-columns: 28px 1fr auto; gap:14px; padding:14px 20px; border-top:1px solid ${V.line}; align-items:start; }
.rd-row:first-of-type { border-top:0; }
.rd-row.compact { padding:9px 20px; align-items:center; }
.rd-row.compact .rd-dot { margin-top:0; width:22px; height:22px; }
.rd-meta { display:block; font-size:12px; font-weight:450; color:${V.muted}; margin-top:1px; }
.rd-dot { width:24px; height:24px; border-radius:999px; display:grid; place-items:center; margin-top:1px; }
.rd-dot.done { background:${V.green}; color:#fff; } .rd-dot.na { background:${V.gray}; color:${V.muted}; border:1px solid ${V.line}; }
.rd-dot.wait { border:2px dashed rgba(142,27,31,.45); color:${V.maroon}; }
.rd-t { font-size:14px; font-weight:600; color:${V.ink}; line-height:1.35; }
.rd-how { margin:3px 0 0; font-size:12.5px; color:${V.muted}; line-height:1.5; }
.rd-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.rd-chip { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 9px; border-radius:999px; font-size:11.5px; font-weight:600; background:${V.warnBg}; color:${V.warnFg}; }
.rd-chip.ok { background:var(--v2-good-bg); color:${V.green}; } .rd-chip.q { background:${V.gray}; color:${V.body}; }
.rd-act { display:flex; gap:6px; align-items:center; }
.rd-link { border:0; background:transparent; font:inherit; font-size:12.5px; font-weight:650; color:${V.maroon}; cursor:pointer; padding:6px 10px; border-radius:999px; }
.rd-link:hover { background:${V.cream}; } .rd-link.quiet { color:${V.muted}; font-weight:550; }
.rd-mod { padding:10px 20px 6px; font-size:11px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; color:${V.muted}; background:${V.gray}; border-top:1px solid ${V.line}; }
.rd-mod:first-of-type { border-top:0; }
.rd-chk { display:grid; grid-template-columns: 1fr auto; gap:12px; padding:12px 20px; border-top:1px solid ${V.line}; align-items:center; cursor:pointer; text-align:left; background:transparent; border-left:0; border-right:0; border-bottom:0; font:inherit; width:100%; }
.rd-chk:hover { background:${V.gray}; }
.rd-chk b { font-size:13.5px; font-weight:600; color:${V.ink}; display:block; }
.rd-chk small { font-size:12px; color:${V.muted}; }
.rd-pill { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 11px; border-radius:999px; font-size:12px; font-weight:650; white-space:nowrap; }
.rd-pill.passed { background:var(--v2-good-bg); color:${V.green}; } .rd-pill.failed { background:rgba(217,43,43,.14); color:${V.maroon}; }
.rd-pill.ready { background:${V.blue}; color:${V.brandDeep}; } .rd-pill.blocked { background:${V.warnBg}; color:${V.warnFg}; } .rd-pill.not_applicable { background:${V.gray}; color:${V.muted}; }
.rd-cta { border:0; cursor:pointer; font:inherit; font-size:14px; font-weight:650; color:#fff; padding:12px 20px; border-radius:999px; display:inline-flex; gap:8px; align-items:center;
  background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); box-shadow:0 12px 24px -14px var(--v2-brand); }
.rd-cta:hover { filter:brightness(1.05); }
@media (max-width: 1080px) { .rd-hero { grid-template-columns:1fr; } .rd-main { grid-template-columns:1fr; } }
`;

const STATUS_LABEL = { passed: "Passed", failed: "Failed", ready: "Ready to run", blocked: "Blocked", not_applicable: "Not applicable" } as const;

function Ring({ percent }: { percent: number }) {
  const r = 50, c = 2 * Math.PI * r;
  return (
    <div className="rd-ring" role="img" aria-label={`${percent} percent of the data is in`}>
      <svg viewBox="0 0 116 116" width="116" height="116">
        <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(20,18,16,.08)" strokeWidth="10" />
        <circle cx="58" cy="58" r={r} fill="none" stroke="url(#rdg)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(percent / 100) * c} ${c}`} transform="rotate(-90 58 58)" />
        <defs><linearGradient id="rdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E4302A" /><stop offset="1" stopColor="#8E1B1F" /></linearGradient></defs>
      </svg>
      <b>{percent}%</b>
    </div>
  );
}

export interface ReadinessViewProps {
  client: string;
  pack: Pack;
  onPack: (p: Pack) => void;
  inputs: InputStates;
  /** Results of checks that have run, by check id. Ignored while an input is missing. */
  results?: Record<string, "passed" | "failed" | null | undefined>;
  onMark: (key: string, status: "received" | "not_applicable" | "missing") => void;
  onRequest: () => void;
  onOpenCheck?: (opensIn: string) => void;
  /** What the request would ask the client for, so the button can say how many. */
  clientCount: number;
  teamCount: number;
  sqlMissing?: boolean;
  footer?: ReactNode;
}

export default function ReadinessView(p: ReadinessViewProps) {
  const checks = useMemo(() => allChecks(p.inputs, p.results ?? {}), [p.inputs, p.results]);
  const progress = packProgress(p.inputs);
  const overall = Math.round(progress.reduce((a, x) => a + x.percent, 0) / progress.length);
  const cur = progress.find((x) => x.pack === p.pack)!;
  const ready = checks.filter((c) => c.status === "ready" || c.status === "passed" || c.status === "failed").length;
  const blocked = checks.filter((c) => c.status === "blocked").length;
  const items = INPUTS.filter((i) => i.pack === p.pack);
  const holders = [...new Set(items.map((i) => i.holder))];
  const byModule = useMemo(() => { const m = new Map<string, CheckState[]>(); for (const c of checks) (m.get(c.def.module) ?? m.set(c.def.module, []).get(c.def.module)!).push(c); return [...m]; }, [checks]);
  const waitingOnClient = p.clientCount, waitingOnTeam = p.teamCount;

  return (
    <div className="rd" data-testid="readiness">
      <style>{READINESS_CSS}</style>

      <section className="rd-hero">
        <Ring percent={overall} />
        <div>
          <div className="rd-kicker">{p.client} · Data needed</div>
          <h2 className="rd-h">{blocked === 0 ? "Everything the reviews need is in." : `${blocked} of ${CHECKS.length} checks are waiting for data.`}</h2>
          <p className="rd-sub">
            {blocked === 0 ? "Every check can run. Your job now is to review the findings." : `${waitingOnClient ? `${waitingOnClient} item${waitingOnClient === 1 ? "" : "s"} to ask the client for` : "Nothing to ask the client for"}${waitingOnTeam ? `, ${waitingOnTeam} for your team to download` : ""}. A check never shows as passed until its data is here.`}
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="rd-cta" onClick={p.onRequest} disabled={waitingOnClient + waitingOnTeam === 0} data-testid="rd-request"><Send size={16} /> Request what is missing</button>
            <span style={{ fontSize: 12.5, color: V.muted }}>One message, one upload link.</span>
          </div>
        </div>
        <div className="rd-stats">
          <div className="rd-stat"><b style={{ color: V.green }}>{ready}</b><span>Can run</span></div>
          <div className="rd-stat"><b style={{ color: V.warnFg }}>{blocked}</b><span>Blocked</span></div>
          <div className="rd-stat"><b>{checks.filter((c) => c.status === "failed").length}</b><span>Need a look</span></div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Segmented label="Pack" value={p.pack} onChange={p.onPack} options={PACKS.map((x) => ({ value: x.key, label: x.label, count: progress.find((g) => g.pack === x.key)!.missing }))} />
        <span style={{ fontSize: 13, color: V.muted }}>{PACKS.find((x) => x.key === p.pack)!.when}. <b style={{ color: V.ink }}>{cur.received}</b> of {cur.total - cur.notApplicable} in.</span>
      </div>
      {p.sqlMissing && <div role="status" style={{ padding: "10px 14px", borderRadius: 12, background: V.warnBg, color: V.warnFg, fontSize: 13 }}>Marking items needs one SQL file to be run once: supabase/migrations/20261121100000_input_status.sql. Items read from documents already show.</div>}

      <div className="rd-main">
        <div style={{ display: "grid", gap: 18 }}>
          {holders.map((h) => {
            const Icon = HOLDER_ICON[h];
            const list = items.filter((i) => i.holder === h);
            const missing = list.filter((i) => !["received", "not_applicable"].includes(p.inputs[i.key]?.status ?? "")).length;
            return (
              <section className="rd-card" key={h}>
                <header><span className="rd-ico"><Icon size={16} /></span><h3>{HOLDER_LABEL[h]}</h3><span className="rd-n">{missing === 0 ? "All in" : `${missing} to get`}</span></header>
                {list.map((i) => <ItemRow key={i.key} def={i} inputs={p.inputs} onMark={p.onMark} />)}
              </section>
            );
          })}
        </div>

        <aside className="rd-card" style={{ position: "sticky", top: 12 }}>
          <header><span className="rd-ico"><Lock size={15} /></span><h3>Checks</h3><span className="rd-n">{ready} can run · {blocked} blocked</span></header>
          {byModule.map(([mod, list]) => (
            <div key={mod}>
              <div className="rd-mod">{mod}</div>
              {list.map((c) => (
                <button key={c.def.id} className="rd-chk" onClick={() => p.onOpenCheck?.(c.def.opensIn)}>
                  <span>
                    <b>{c.def.label}</b>
                    {c.status === "blocked" && <small>Waiting for {c.waitingFor.slice(0, 2).map((i) => i.label.split(",")[0]).join(" and ")}{c.waitingFor.length > 2 ? ` +${c.waitingFor.length - 2}` : ""}</small>}
                  </span>
                  <span className={`rd-pill ${c.status}`}>{c.status === "blocked" ? <Lock size={12} /> : c.status === "passed" ? <Check size={13} /> : null}{STATUS_LABEL[c.status]}{c.status === "ready" && <ArrowRight size={12} />}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
      </div>
      {p.footer}
    </div>
  );
}

function ItemRow({ def, inputs, onMark }: { def: InputDef; inputs: InputStates; onMark: ReadinessViewProps["onMark"] }) {
  const s = inputs[def.key];
  const status = s?.status ?? "missing";
  const unblocks = status === "missing" ? whatItUnblocks(def.key, inputs) : [];
  const stillNeeds = status === "missing" ? CHECKS.filter((c) => c.needs.includes(def.key)).length : 0;
  if (status !== "missing")
    return (
      <div className="rd-row compact">
        <span className={`rd-dot ${status === "received" ? "done" : "na"}`} aria-hidden="true">{status === "received" ? <Check size={13} strokeWidth={3} /> : <Minus size={13} />}</span>
        <div className="rd-t" style={{ fontWeight: 550 }}>{def.label}<span className="rd-meta">{status === "received" ? (s?.source === "connector" ? `Synced from ${s.note ?? "the books"}` : s?.source === "detected" ? "Read from a document" : "Marked received") : `Not applicable: ${s?.note ?? "no reason recorded"}`}{s?.at ? ` · ${new Date(s.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</span></div>
        <div className="rd-act"><button className="rd-link quiet" onClick={() => onMark(def.key, "missing")}>Undo</button></div>
      </div>
    );
  return (
    <div className="rd-row">
      <span className="rd-dot wait" aria-hidden="true"><CircleDashed size={14} /></span>
      <div>
        <div className="rd-t">{def.label}</div>
        <p className="rd-how">{def.how}</p>
        <div className="rd-chips">
          {def.conditional && <span className="rd-chip q">{def.conditional}</span>}
          {stillNeeds > 0 && <span className="rd-chip"><Lock size={11} /> {unblocks.length ? `Unblocks ${unblocks.length} check${unblocks.length === 1 ? "" : "s"} once it is in` : `Needed by ${stillNeeds} check${stillNeeds === 1 ? "" : "s"}`}</span>}
        </div>
      </div>
      <div className="rd-act">
        <button className="rd-link" onClick={() => onMark(def.key, "received")}>Mark received</button>
        <button className="rd-link quiet" onClick={() => onMark(def.key, "not_applicable")}>Not applicable</button>
      </div>
    </div>
  );
}
