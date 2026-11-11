/**
 * The Portfolio: who needs a person first, and how far every client is through this month's close.
 *
 *   summary band      the month in four numbers, each one opens its queue
 *   stage mix         every client by stage; click a segment to filter
 *   tabs              All, Needs attention, Ready to sign off, Closed
 *   cards or list     one row per client with a single next step
 *
 * Everything shown comes from the same data as the rest of the app (see lib/portfolioView and lib/closeWorkflow).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  LayoutGrid,
  List,
  ListChecks,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { CloseProgress } from "./CloseProgress";
import type { CloseState } from "../store";
import {
  FUNNEL,
  SORT_LABEL,
  TABS,
  actionIsForYou,
  closedLine,
  filterRows,
  inTab,
  rowAction,
  sortRows,
  stageCounts,
  tabCounts,
  waitingChips,
  waitingText,
  type PortfolioRow,
  type SortMode,
  type StageKey,
  type TabKey,
} from "../lib/portfolioView";

/** One soft colour per stage, warm to cool as the month moves toward done. The same colours are used on the bar, the pills and the cards. */
const STAGE_STYLE: Record<StageKey, { from: string; to: string; ink: string }> =
  {
    Documents: { from: "#F3EADC", to: "#E9D8BF", ink: "#6B5230" },
    Review: { from: "#FCEBD9", to: "#F5D2A8", ink: "#7A3E0C" },
    Recon: { from: "#FBE6DC", to: "#F4C3B0", ink: "#8E3A24" },
    Exceptions: { from: "#F9D9D5", to: "#EE9D95", ink: "#8E1B1F" },
    MIS: { from: "#E3EFE8", to: "#BCD9C9", ink: "#2F6B4F" },
    Closed: { from: "#D5EBDD", to: "#9BCFB2", ink: "#1F5A46" },
  };

const PW_STYLES = `
.pw { display:grid; gap:18px; min-width:0; }
.pw button { font-family:inherit; }
.pw-hero { border-radius:24px; padding:22px 24px 20px; color:#FAF7F2; background:radial-gradient(120% 140% at 100% 0%, rgba(217,43,43,.38) 0%, transparent 55%), linear-gradient(135deg,#2A1816 0%,#43201D 55%,#5E1E20 100%); box-shadow:0 18px 40px -26px rgba(60,20,16,.7); }
.pw .pw-hero h2 { font-size:22px; font-weight:600; letter-spacing:-.015em; margin:0; color:#FAF7F2; }
.pw .pw-hero p { margin:4px 0 0; font-size:14px; color:rgba(250,247,242,.74); }
.pw-hero-top { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.pw-ring { --p:0; position:relative; width:68px; height:68px; flex:none; border-radius:999px; display:grid; place-items:center; background:conic-gradient(#8FD6B0 calc(var(--p) * 1%), rgba(255,255,255,.14) 0); }
.pw-ring::before { content:""; position:absolute; inset:6px; border-radius:999px; background:#3A1D1B; }
.pw-ring span { position:relative; text-align:center; line-height:1.1; }
.pw-ring b { display:block; font-size:19px; font-weight:600; font-variant-numeric:tabular-nums; }
.pw-ring em { display:block; font-style:normal; font-size:11px; color:rgba(250,247,242,.7); }
.pw-mixhead { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 16px; margin-top:22px; font-size:14px; font-weight:600; }
.pw-mixhead span:last-child { font-weight:400; font-size:12.5px; }
.pw-hero .pw-mix { background:rgba(255,255,255,.07); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); margin-top:10px; }
.pw-hero .pw-seg[aria-pressed="true"] { box-shadow:0 0 0 2px #FAF7F2; }
.pw-hero .pw-pill { background:rgba(255,255,255,.07); color:#FAF7F2; box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); }
.pw-hero .pw-pill:hover { background:rgba(255,255,255,.13); }
.pw-hero .pw-pill[aria-pressed="true"] { box-shadow:inset 0 0 0 1.5px #FAF7F2; }
.pw-hero .pw-pill em { color:rgba(250,247,242,.6); }
.pw-hero .pw-pill:focus-visible, .pw-hero .pw-seg:focus-visible { outline-color:#FAF7F2; }
.pw-tiles { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:18px; }
.pw-tile { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:center; padding:14px 16px; border-radius:16px; background:rgba(255,255,255,.07); box-shadow:inset 0 0 0 1px rgba(255,255,255,.10); color:inherit; text-decoration:none; text-align:left; cursor:pointer; border:0; transition:background .16s ease, transform .12s ease; }
.pw-tile:hover { background:rgba(255,255,255,.13); transform:translateY(-1px); }
.pw-tile:focus-visible { outline:2px solid #FAF7F2; outline-offset:2px; }
.pw-tile-ic { width:38px; height:38px; border-radius:12px; display:grid; place-items:center; background:rgba(255,255,255,.12); }
.pw-tile-t b { display:block; font-size:26px; font-weight:600; line-height:1.1; font-variant-numeric:tabular-nums; }
.pw-tile-t em { display:block; font-style:normal; font-size:12.5px; color:rgba(250,247,242,.72); margin-top:2px; }
.pw-card-box { border-radius:22px; background:var(--v2-card); border:1px solid var(--v2-line); box-shadow:var(--v2-card-shadow); padding:20px 22px; }
.pw-title { font-size:17px; font-weight:600; margin:0; }
.pw-sub { font-size:13px; color:var(--v2-muted); margin:3px 0 0; }
.pw-mix { display:flex; gap:6px; height:52px; margin-top:16px; padding:6px; border-radius:18px; background:var(--v2-gray); }
.pw-seg { all:unset; box-sizing:border-box; cursor:pointer; border-radius:13px; display:grid; place-items:center; font-size:14px; font-weight:600; font-variant-numeric:tabular-nums; transition:transform .12s ease, box-shadow .16s ease, opacity .16s ease; min-width:0; }
.pw-seg:hover { transform:translateY(-1px); }
.pw-seg:focus-visible { outline:2px solid var(--v2-brand); outline-offset:2px; }
.pw-seg[aria-pressed="true"] { box-shadow:0 0 0 2px var(--v2-ink); }
.pw-mix[data-filtered="true"] .pw-seg[aria-pressed="false"] { opacity:.45; }
.pw-pills { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.pw-pill { all:unset; box-sizing:border-box; cursor:pointer; display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:999px; background:var(--v2-card); box-shadow:inset 0 0 0 1px var(--v2-line); font-size:13.5px; transition:background .16s ease; }
.pw-pill:hover { background:var(--v2-gray); }
.pw-pill:focus-visible { outline:2px solid var(--v2-brand); outline-offset:2px; }
.pw-pill[aria-pressed="true"] { box-shadow:inset 0 0 0 1.5px var(--v2-ink); font-weight:600; }
.pw-pill i { width:10px; height:10px; border-radius:999px; flex:none; }
.pw-pill em { font-style:normal; color:var(--v2-muted); font-variant-numeric:tabular-nums; margin-left:4px; }
.pw-tabs { display:flex; gap:22px; border-bottom:1px solid var(--v2-line); overflow-x:auto; scrollbar-width:none; }
.pw-tab { all:unset; box-sizing:border-box; cursor:pointer; padding:10px 0 12px; font-size:14.5px; color:var(--v2-muted); display:inline-flex; align-items:center; gap:8px; border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
.pw-tab:hover { color:var(--v2-ink); }
.pw-tab:focus-visible { outline:2px solid var(--v2-brand); outline-offset:2px; border-radius:6px; }
.pw-tab[aria-selected="true"] { color:var(--v2-ink); font-weight:600; border-bottom-color:var(--v2-ink); }
.pw-count { min-width:22px; height:22px; padding:0 7px; border-radius:999px; display:inline-grid; place-items:center; font-size:12px; font-weight:600; background:var(--v2-gray); color:var(--v2-body); font-variant-numeric:tabular-nums; }
.pw-tab[aria-selected="true"] .pw-count { background:var(--v2-ink); color:var(--v2-bg); }
.pw-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.pw-bar .grow { flex:1 1 auto; font-size:13.5px; color:var(--v2-muted); }
.pw-search { display:flex; align-items:center; gap:8px; padding:0 12px; height:38px; border-radius:12px; background:var(--v2-input); box-shadow:inset 0 0 0 1px var(--v2-line); min-width:200px; }
.pw-search:focus-within { box-shadow:inset 0 0 0 1.5px var(--v2-brand); }
.pw .pw-search input { all:unset; box-sizing:border-box; flex:1; min-width:0; height:100%; font-size:14px; color:var(--v2-ink); background:transparent !important; box-shadow:none !important; border:0 !important; padding:0 !important; }
.pw-select { height:38px; border-radius:12px; border:0; padding:0 12px; font-size:13.5px; color:var(--v2-ink); background:var(--v2-input); box-shadow:inset 0 0 0 1px var(--v2-line); cursor:pointer; }
.pw-toggle { display:inline-flex; padding:3px; border-radius:12px; background:var(--v2-gray); }
.pw-toggle button { all:unset; box-sizing:border-box; cursor:pointer; width:34px; height:32px; border-radius:9px; display:grid; place-items:center; color:var(--v2-muted); }
.pw-toggle button[aria-pressed="true"] { background:var(--v2-card); color:var(--v2-ink); box-shadow:0 1px 2px rgba(20,18,16,.12); }
.pw-toggle button:focus-visible { outline:2px solid var(--v2-brand); outline-offset:1px; }
.pw-chip { display:inline-flex; align-items:center; gap:8px; padding:6px 8px 6px 12px; border-radius:10px; font-size:13px; background:color-mix(in srgb, var(--v2-brand) 9%, transparent); color:var(--v2-brandDeep); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v2-brand) 25%, transparent); }
.pw-chip button { all:unset; cursor:pointer; display:grid; place-items:center; width:20px; height:20px; border-radius:6px; }
.pw-chip button:hover { background:color-mix(in srgb, var(--v2-brand) 16%, transparent); }
.pw-link { all:unset; cursor:pointer; font-size:13px; font-weight:600; color:var(--v2-brandDeep); }
.pw-link:focus-visible { outline:2px solid var(--v2-brand); outline-offset:2px; border-radius:4px; }
.pw-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:14px; }
.pw-cardc { min-width:0; position:relative; display:grid; gap:14px; padding:18px; border-radius:22px; background:var(--v2-card); border:1px solid var(--v2-line); box-shadow:var(--v2-card-shadow); transition:transform .16s ease, box-shadow .2s ease; }
.pw-cardc:hover { transform:translateY(-2px); }
.pw-head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:12px; align-items:center; }
.pw-av { width:40px; height:40px; border-radius:13px; display:grid; place-items:center; font-size:14px; font-weight:600; }
.pw-name { font-size:15.5px; font-weight:600; color:var(--v2-ink); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; }
.pw-name::after { content:""; position:absolute; inset:0; border-radius:inherit; }
.pw-name:focus-visible { outline:none; }
.pw-name:focus-visible::after { outline:2px solid var(--v2-brand); outline-offset:2px; }
.pw-ent { font-size:12.5px; color:var(--v2-muted); }
.pw-stage { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; white-space:nowrap; }
.pw-stage i { width:6px; height:6px; border-radius:999px; background:currentColor; }
.pw-next { font-size:13.5px; line-height:1.45; color:var(--v2-body); display:grid; grid-template-columns:3px minmax(0,1fr); gap:10px; }
.pw-next::before { content:""; border-radius:999px; background:linear-gradient(180deg,var(--v2-brand),var(--v2-brandDeep)); }
.pw-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; text-align:left; }
.pw-stats b { display:block; font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }
.pw-stats b[data-zero="true"] { color:var(--v2-muted); font-weight:500; opacity:.7; }
.pw-stats span { font-size:12px; color:var(--v2-muted); }
.pw-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; }
.pw-foot .pw-act { flex:1 1 auto; justify-content:center; }
.pw-step { font-size:13px; color:var(--v2-body); margin-top:-6px; line-height:1.4; }
.pw-act { position:relative; z-index:1; display:inline-flex; align-items:center; gap:7px; padding:8px 14px; border-radius:11px; font-size:13px; font-weight:600; text-decoration:none; white-space:nowrap; max-width:100%; transition:transform .12s ease, background .16s ease; }
.pw-act span { overflow:hidden; text-overflow:ellipsis; }
.pw-act:hover { transform:translateY(-1px); }
.pw-act:focus-visible { outline:2px solid var(--v2-brand); outline-offset:2px; }
.pw-act[data-kind="primary"] { background:var(--v2-brand); color:#fff; box-shadow:0 1px 0 rgba(255,255,255,.2) inset, 0 8px 16px -10px rgba(217,43,43,.65); }
.pw-act[data-kind="ghost"] { background:var(--v2-card); color:var(--v2-ink); box-shadow:inset 0 0 0 1px var(--v2-line), 0 1px 2px rgba(20,18,16,.05); }
.pw-table { border-radius:22px; background:var(--v2-card); border:1px solid var(--v2-line); box-shadow:var(--v2-card-shadow); overflow:hidden; }
.pw-th, .pw-tr { display:grid; grid-template-columns:minmax(0,1.6fr) 150px minmax(120px,1fr) minmax(0,1.3fr) minmax(0,1.4fr); gap:14px; align-items:center; padding:0 18px; }
.pw-th { height:44px; font-size:12.5px; color:var(--v2-muted); background:var(--v2-gray); }
.pw-tr { position:relative; min-height:72px; padding-top:10px; padding-bottom:10px; border-top:1px solid var(--v2-line); transition:background .14s ease; }
.pw-tr:hover { background:var(--v2-gray); }
.pw-who { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:center; min-width:0; }
.pw-chips { display:flex; flex-wrap:wrap; gap:6px; }
.pw-w { display:inline-flex; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; }
.pw-w[data-tone="bad"] { background:rgba(217,43,43,.10); color:var(--v2-brandDeep); }
.pw-w[data-tone="warn"] { background:var(--v2-warnBg); color:var(--v2-warnFg); }
.pw-w[data-tone="info"] { background:var(--v2-gray); color:var(--v2-body); }
.pw-none { font-size:13px; color:var(--v2-muted); }
.pw-end { display:flex; justify-content:flex-end; min-width:0; }
.pw-empty { text-align:center; padding:34px 18px; border-radius:22px; border:1px dashed var(--v2-dash); color:var(--v2-body); }
.pw-empty b { display:block; font-size:15.5px; color:var(--v2-ink); margin-bottom:4px; }
@media (max-width:1000px){
  .pw-tiles { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .pw-th { display:none; }
  .pw-tr { grid-template-columns:minmax(0,1fr) auto; row-gap:10px; padding-top:14px; padding-bottom:14px; }
  .pw-tr > :nth-child(3), .pw-tr > :nth-child(4) { grid-column:1 / -1; }
  .pw-tr > :nth-child(5) { grid-column:1 / -1; justify-content:flex-start; }
}
@media (max-width:560px){ .pw-search { min-width:0; flex:1 1 100%; } .pw-hero { padding:18px; } }
@keyframes pw-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
.pw > * { animation:pw-in .42s cubic-bezier(.2,.7,.2,1) both; }
.pw > :nth-child(2) { animation-delay:.04s; }
.pw > :nth-child(3) { animation-delay:.08s; }
.pw > :nth-child(4) { animation-delay:.12s; }
.pw-grid > *, .pw-table > * { animation:pw-in .4s cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion:reduce){ .pw > *, .pw-grid > *, .pw-table > * { animation:none !important; } .pw *, .pw *::before { transition:none !important; } }
`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const VIEW_KEY = "fynhelp.v2.portfolio.view";
const SORT_KEY = "fynhelp.v2.portfolio.sort";

function useRemembered<T extends string>(
  key: string,
  initial: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key) as T | null;
      if (saved && allowed.includes(saved)) setV(saved);
    } catch {
      /* private mode: keep the default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [
    v,
    (next: T) => {
      setV(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* private mode */
      }
    },
  ];
}

function StagePill({ stage }: { stage: StageKey }) {
  const c = STAGE_STYLE[stage];
  return (
    <span
      className="pw-stage"
      style={{
        background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
        color: c.ink,
      }}
    >
      <i aria-hidden="true" />
      {stage}
    </span>
  );
}

function ActionLink({ r }: { r: PortfolioRow }) {
  const a = rowAction(r);
  return (
    <Link
      to={`/app/clients/${r.id}` as never}
      search={{ tab: a.tab } as never}
      className="pw-act"
      data-kind={actionIsForYou(r) ? "primary" : "ghost"}
      title={a.label}
    >
      <span>{a.label}</span>
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

function ClientCard({ r, close }: { r: PortfolioRow; close?: CloseState }) {
  const c = STAGE_STYLE[r.stage];
  const next =
    r.stage === "Closed"
      ? "Closed and signed off. Every figure links to its source."
      : r.next.why;
  return (
    <article className="pw-cardc" data-testid="portfolio-card">
      <div className="pw-head">
        <span
          className="pw-av"
          style={{
            background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
            color: c.ink,
          }}
          aria-hidden="true"
        >
          {initials(r.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <Link to={`/app/clients/${r.id}` as never} className="pw-name">
            {r.name}
          </Link>
          <div className="pw-ent">{r.entityType}</div>
        </div>
        <StagePill stage={r.stage} />
      </div>
      <div className="pw-next">{next}</div>
      <div className="pw-stats">
        <div>
          <b data-zero={r.exceptions === 0}>{r.exceptions}</b>
          <span>{r.exceptions === 1 ? "exception" : "exceptions"}</span>
        </div>
        <div>
          <b data-zero={r.review === 0}>{r.review}</b>
          <span>to review</span>
        </div>
        <div>
          <b data-zero={r.chases === 0}>{r.chases}</b>
          <span>{r.chases === 1 ? "chase" : "chases"}</span>
        </div>
      </div>
      {close ? <CloseProgress state={close} compact /> : null}
      <div className="pw-step" title={r.stepTitle}>
        {r.stepTitle}
      </div>
      <div className="pw-foot">
        <ActionLink r={r} />
      </div>
    </article>
  );
}

function ClientRow({ r, close }: { r: PortfolioRow; close?: CloseState }) {
  const c = STAGE_STYLE[r.stage];
  const chips = waitingChips(r);
  return (
    <div className="pw-tr" data-testid="portfolio-row">
      <div className="pw-who">
        <span
          className="pw-av"
          style={{
            background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
            color: c.ink,
          }}
          aria-hidden="true"
        >
          {initials(r.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <Link to={`/app/clients/${r.id}` as never} className="pw-name">
            {r.name}
          </Link>
          <div className="pw-ent">{r.entityType}</div>
        </div>
      </div>
      <div>
        <StagePill stage={r.stage} />
      </div>
      <div>{close ? <CloseProgress state={close} compact /> : null}</div>
      <div className="pw-chips">
        {chips.length ? (
          chips.map((w) => (
            <span key={w.label} className="pw-w" data-tone={w.tone}>
              {w.label}
            </span>
          ))
        ) : (
          <span className="pw-none">{waitingText(r)}</span>
        )}
      </div>
      <div className="pw-end">
        <ActionLink r={r} />
      </div>
    </div>
  );
}

export function PortfolioOverview({
  rows,
  closes,
  period,
  totals,
}: {
  rows: PortfolioRow[];
  /** The full close state per client, for the progress bars. */
  closes: Record<string, CloseState>;
  period: string;
  totals: { exceptions: number; review: number; chases: number };
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [stage, setStage] = useState<StageKey | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useRemembered<SortMode>(SORT_KEY, "attention", [
    "attention",
    "progress",
    "name",
  ]);
  const [view, setView] = useRemembered<"cards" | "list">(
    VIEW_KEY,
    rows.length > 12 ? "list" : "cards",
    ["cards", "list"],
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => stageCounts(rows), [rows]);
  const tabs = useMemo(() => tabCounts(rows), [rows]);
  const shown = useMemo(
    () =>
      sortRows(
        filterRows(
          rows.filter((r) => inTab(r, tab)),
          { query, stage },
        ),
        sort,
      ),
    [rows, tab, query, stage, sort],
  );
  const closedCount = counts.Closed;
  const filtered = Boolean(stage) || Boolean(query.trim()) || tab !== "all";
  const reset = () => {
    setStage(null);
    setQuery("");
    setTab("all");
  };
  const pickStage = (s: StageKey) => setStage((cur) => (cur === s ? null : s));
  const visibleStages = FUNNEL.filter((s) => counts[s] > 0);

  // "/" jumps to the search box, like the rest of the app's shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        t &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) &&
        !t.isContentEditable
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tiles = [
    {
      key: "clients",
      label: "Clients",
      value: rows.length,
      hint: "active",
      icon: <Users size={18} />,
      onClick: reset,
    },
    {
      key: "ex",
      label: "Open exceptions",
      value: totals.exceptions,
      hint: "across clients",
      icon: <AlertTriangle size={18} />,
      to: "/app/exceptions",
    },
    {
      key: "rv",
      label: "Awaiting review",
      value: totals.review,
      hint: "unsure lines",
      icon: <ListChecks size={18} />,
      to: "/app/review",
    },
    {
      key: "ch",
      label: "Open chases",
      value: totals.chases,
      hint: "documents pending",
      icon: <Send size={18} />,
      to: "/app/chaser",
    },
  ];

  return (
    <section className="pw" aria-label="Portfolio">
      <style>{PW_STYLES}</style>

      <div className="pw-hero">
        <div className="pw-hero-top">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ color: "#FAF7F2" }}>Close for {period}</h2>
            <p
              data-testid="portfolio-closed-line"
              style={{ color: "rgba(250,247,242,.74)" }}
            >
              {closedLine(rows, period)}
            </p>
          </div>
          <div
            className="pw-ring"
            role="img"
            aria-label={`${closedCount} of ${rows.length} clients closed`}
            style={{
              ["--p" as string]: rows.length
                ? Math.round((closedCount / rows.length) * 100)
                : 0,
            }}
          >
            <span>
              <b>{closedCount}</b>
              <em>of {rows.length}</em>
            </span>
          </div>
        </div>

        <div className="pw-tiles">
          {tiles.map((t) => {
            const inner = (
              <>
                <span className="pw-tile-ic" aria-hidden="true">
                  {t.icon}
                </span>
                <span className="pw-tile-t">
                  <b>{t.value}</b>
                  <em>{t.label}</em>
                </span>
              </>
            );
            return t.to ? (
              <Link
                key={t.key}
                to={t.to as never}
                className="pw-tile"
                aria-label={`${t.label}: ${t.value} ${t.hint}`}
              >
                {inner}
              </Link>
            ) : (
              <button
                key={t.key}
                type="button"
                className="pw-tile"
                onClick={t.onClick}
                aria-label={`${t.label}: ${t.value} ${t.hint}`}
              >
                {inner}
              </button>
            );
          })}
        </div>

        <div className="pw-mixhead">
          <span style={{ color: "#FAF7F2" }}>Where every client stands</span>
          <span style={{ color: "rgba(250,247,242,.6)" }}>
            {stage
              ? `Showing clients at ${stage}. Click it again to show all.`
              : "Click any segment to filter"}
          </span>
        </div>
        <div
          className="pw-mix"
          data-filtered={stage ? "true" : "false"}
          role="group"
          aria-label="Clients by stage"
        >
          {visibleStages.length ? (
            visibleStages.map((s) => (
              <button
                key={s}
                type="button"
                className="pw-seg"
                aria-pressed={stage === s}
                aria-label={`${s}: ${counts[s]} ${counts[s] === 1 ? "client" : "clients"}`}
                onClick={() => pickStage(s)}
                style={{
                  flex: `${counts[s]} 1 0`,
                  background: `linear-gradient(135deg, ${STAGE_STYLE[s].from}, ${STAGE_STYLE[s].to})`,
                  color: STAGE_STYLE[s].ink,
                }}
              >
                {counts[s]}
              </button>
            ))
          ) : (
            <span
              style={{
                margin: "auto",
                color: "rgba(250,247,242,.6)",
                fontSize: 13,
              }}
            >
              No clients yet
            </span>
          )}
        </div>
        <div className="pw-pills">
          {FUNNEL.map((s) => (
            <button
              key={s}
              type="button"
              className="pw-pill"
              aria-pressed={stage === s}
              onClick={() => pickStage(s)}
              disabled={counts[s] === 0 && stage !== s}
              style={
                counts[s] === 0
                  ? { opacity: 0.45, cursor: "default" }
                  : undefined
              }
            >
              <i style={{ background: STAGE_STYLE[s].to }} aria-hidden="true" />
              {s}
              <em>{counts[s]}</em>
            </button>
          ))}
        </div>
      </div>

      <div role="tablist" aria-label="Show clients" className="pw-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className="pw-tab"
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="pw-count">{tabs[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="pw-bar">
        <span className="grow" data-testid="portfolio-count">
          {shown.length} {shown.length === 1 ? "client" : "clients"}
        </span>
        {stage ? (
          <span className="pw-chip">
            Stage: {stage}
            <button
              type="button"
              aria-label="Remove the stage filter"
              onClick={() => setStage(null)}
            >
              <X size={13} />
            </button>
          </span>
        ) : null}
        {filtered ? (
          <button type="button" className="pw-link" onClick={reset}>
            Reset
          </button>
        ) : null}
        <label className="pw-search">
          <Search
            size={15}
            aria-hidden="true"
            style={{ color: "var(--v2-muted)" }}
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
          />
          <kbd
            style={{
              fontSize: 11,
              color: "var(--v2-muted)",
              border: "1px solid var(--v2-line)",
              borderRadius: 6,
              padding: "1px 6px",
            }}
            aria-hidden="true"
          >
            /
          </kbd>
        </label>
        <select
          className="pw-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort clients"
        >
          {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
            <option key={m} value={m}>
              {SORT_LABEL[m]}
            </option>
          ))}
        </select>
        <div className="pw-toggle" role="group" aria-label="Layout">
          <button
            type="button"
            aria-pressed={view === "cards"}
            aria-label="Cards"
            title="Cards"
            onClick={() => setView("cards")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            aria-label="List"
            title="List"
            onClick={() => setView("list")}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="pw-empty" data-testid="portfolio-empty">
          <b>No clients match</b>
          {filtered ? (
            <>
              Try another search or stage.{" "}
              <button type="button" className="pw-link" onClick={reset}>
                Show all clients
              </button>
            </>
          ) : (
            "Add a client and it appears here."
          )}
        </div>
      ) : view === "cards" ? (
        <div className="pw-grid">
          {shown.map((r) => (
            <ClientCard key={r.id} r={r} close={closes[r.id]} />
          ))}
        </div>
      ) : (
        <div className="pw-table" role="table" aria-label="Clients">
          <div className="pw-th" role="row">
            <span>Client</span>
            <span>Stage</span>
            <span>Close progress</span>
            <span>Waiting on</span>
            <span style={{ textAlign: "right" }}>Next step</span>
          </div>
          {shown.map((r) => (
            <ClientRow key={r.id} r={r} close={closes[r.id]} />
          ))}
        </div>
      )}
    </section>
  );
}
