/**
 * Resource & Product Guide: how FynHelp's agents, CA workflows and
 * reconciliation pipelines work, as scannable cards and clickable diagrams.
 * Content lives in ./workflows.ts and mirrors the running product.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { ArrowRight, Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import { CATEGORIES, KIND_LABEL, WORKFLOWS, type Category, type FlowNode, type NodeKind, type Workflow } from "./workflows";

const RED = "linear-gradient(90deg, #FF3B30 0%, #E53935 50%, #990000 100%)";
const C = {
  bg: "#FBF7F4",
  card: "#FFFFFF",
  ink: "#1B0F0D",
  body: "rgba(27,15,13,.72)",
  muted: "rgba(27,15,13,.50)",
  line: "rgba(138,30,24,.12)",
  dark: "#16100F",
  darkLine: "rgba(255,255,255,.10)",
  red: "#E53935",
  deep: "#990000",
  cream: "#FCEEE4",
};

const KIND_STYLE: Record<NodeKind, { fill: string; stroke: string; text: string }> = {
  source: { fill: "#FFFFFF", stroke: "rgba(27,15,13,.25)", text: C.ink },
  ai: { fill: "#FDEBEA", stroke: "#E53935", text: "#7A1712" },
  rule: { fill: "#F6F1EC", stroke: "rgba(27,15,13,.35)", text: C.ink },
  decision: { fill: "#FFF6E5", stroke: "#B7791F", text: "#6B3E06" },
  human: { fill: "#EEF2FF", stroke: "#4F5BD5", text: "#26307A" },
  output: { fill: "#EAF5EF", stroke: "#2F6B4F", text: "#1D4732" },
};

const STYLES = `
.fh-guide { min-height:100vh; background:${C.bg}; color:${C.ink}; font-family:var(--font-geist-sans); -webkit-font-smoothing:antialiased; }
.fh-guide * { box-sizing:border-box; }
.fh-guide .mono { font-family:var(--font-geist-mono); font-variant-numeric:tabular-nums; }
.fh-guide .num { font-variant-numeric:tabular-nums; }
.fh-guide a { color:inherit; }
.fh-wrap { max-width:1240px; margin:0 auto; padding:0 20px; }
.fh-tabs { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
.fh-tab { white-space:nowrap; border:1px solid ${C.line}; background:${C.card}; color:${C.body}; border-radius:999px; padding:8px 14px; font:inherit; font-size:13.5px; font-weight:500; cursor:pointer; transition:all .18s ease; }
.fh-tab:hover { color:${C.ink}; border-color:rgba(138,30,24,.3); }
.fh-tab[aria-selected="true"] { background:${C.dark}; color:#fff; border-color:${C.dark}; }
.fh-search { display:flex; align-items:center; gap:10px; background:${C.card}; border:1px solid ${C.line}; border-radius:14px; padding:0 12px; height:46px; transition:box-shadow .18s ease, border-color .18s ease; }
.fh-search:focus-within { border-color:${C.red}; box-shadow:0 0 0 4px rgba(229,57,53,.12); }
.fh-search input { flex:1; border:0; outline:0; font:inherit; font-size:15px; background:transparent; color:${C.ink}; min-width:0; }
.fh-kbd { font-family:var(--font-geist-mono); font-size:11px; color:${C.muted}; border:1px solid ${C.line}; border-bottom-width:2px; border-radius:6px; padding:1px 6px; }
.fh-grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill, minmax(min(360px, 100%), 1fr)); }
.fh-card { position:relative; background:${C.dark}; color:#fff; border-radius:18px; padding:20px; display:flex; flex-direction:column; gap:16px; overflow:hidden; border:1px solid ${C.darkLine}; transition:transform .2s ease, box-shadow .2s ease; }
.fh-card::before { content:""; position:absolute; inset:0 0 auto 0; height:3px; background:${RED}; opacity:.9; }
.fh-card:hover { transform:translateY(-2px); box-shadow:0 18px 40px -24px rgba(153,0,0,.55); }
.fh-badge { display:inline-flex; align-items:center; font-size:11.5px; font-weight:600; letter-spacing:.02em; border-radius:999px; padding:3px 9px; background:rgba(229,57,53,.16); color:#FFB4AE; }
.fh-pipe { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.fh-pnode { font-size:12px; font-weight:500; padding:6px 9px; border-radius:9px; background:rgba(255,255,255,.06); border:1px solid ${C.darkLine}; color:rgba(255,255,255,.88); transition:background .18s ease, border-color .18s ease; }
.fh-card:hover .fh-pnode:first-child { background:${RED}; border-color:transparent; color:#fff; }
.fh-specs { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }
.fh-spec { background:rgba(255,255,255,.04); border:1px solid ${C.darkLine}; border-radius:12px; padding:9px 10px; min-width:0; }
.fh-spec span { display:block; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:rgba(255,255,255,.5); margin-bottom:4px; }
.fh-spec b { font-weight:500; font-size:12.5px; color:#fff; line-height:1.35; display:block; }
.fh-cta { margin-top:auto; display:inline-flex; align-items:center; gap:8px; align-self:flex-start; background:transparent; border:0; color:#FF8A80; font:inherit; font-weight:600; font-size:14px; cursor:pointer; padding:4px 0; }
.fh-cta:hover { color:#fff; }
.fh-drawer-back { position:fixed; inset:0; background:rgba(22,16,15,.45); z-index:50; animation:fhfade .2s ease; }
.fh-drawer { position:fixed; top:0; right:0; bottom:0; width:min(1080px, 100%); background:${C.bg}; z-index:51; overflow-y:auto; box-shadow:-30px 0 60px -40px rgba(0,0,0,.6); animation:fhslide .26s cubic-bezier(.22,1,.36,1); }
@keyframes fhfade { from { opacity:0 } }
@keyframes fhslide { from { transform:translateX(40px); opacity:.4 } }
.fh-sec { background:${C.card}; border:1px solid ${C.line}; border-radius:18px; padding:18px; }
.fh-h { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:${C.muted}; font-weight:600; margin:0 0 12px; }
.fh-diagram { position:relative; background:${C.card}; border:1px solid ${C.line}; border-radius:18px; overflow:hidden; touch-action:none; cursor:grab; }
.fh-diagram:active { cursor:grabbing; }
.fh-zoom { position:absolute; right:10px; top:10px; display:flex; gap:4px; z-index:2; }
.fh-zoom button { width:32px; height:32px; display:grid; place-items:center; border-radius:10px; border:1px solid ${C.line}; background:${C.card}; color:${C.ink}; cursor:pointer; }
.fh-zoom button:hover { border-color:${C.red}; color:${C.red}; }
.fh-node { cursor:pointer; }
.fh-node rect { transition:filter .18s ease, stroke-width .18s ease; }
.fh-node:hover rect { filter:drop-shadow(0 6px 14px rgba(153,0,0,.22)); stroke-width:2; }
.fh-table { width:100%; border-collapse:collapse; font-family:var(--font-geist-mono); font-variant-numeric:tabular-nums; font-size:12.5px; }
.fh-table th { text-align:left; font-family:var(--font-geist-sans); font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:${C.muted}; font-weight:600; padding:8px 10px; border-bottom:1px solid ${C.line}; white-space:nowrap; }
.fh-table td { padding:8px 10px; border-bottom:1px solid ${C.line}; vertical-align:top; }
.fh-table tr:last-child td { border-bottom:0; }
.fh-scroll { overflow-x:auto; }
.fh-two { display:grid; gap:16px; grid-template-columns:repeat(auto-fit, minmax(min(420px, 100%), 1fr)); }
.fh-li { display:grid; grid-template-columns:18px minmax(0,1fr); gap:8px; font-size:14px; line-height:1.55; color:${C.body}; }
.fh-dot { width:7px; height:7px; border-radius:99px; background:${RED}; margin-top:8px; }
.fh-legend { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:${C.body}; }
.fh-legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:-1px; border:1px solid; }
@media (max-width:640px){ .fh-specs { grid-template-columns:1fr; } .fh-wrap { padding:0 16px; } }
@media (prefers-reduced-motion: reduce){ .fh-card, .fh-drawer, .fh-drawer-back { animation:none; transition:none; } }
`;

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<string, string>;

function matches(w: Workflow, q: string) {
  if (!q) return true;
  const hay = [w.title, w.summary, CAT_LABEL[w.category], ...w.keywords, ...w.pipeline, ...w.rules, ...w.inputs.map((i) => i.detail)].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export default function GuidePage() {
  const [cat, setCat] = useState<"all" | Category>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses search; Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenId(null);
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Deep link: /guide#recon opens that workflow.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && WORKFLOWS.some((w) => w.id === id)) setOpenId(id);
  }, []);
  useEffect(() => {
    const url = openId ? `#${openId}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
    document.body.style.overflow = openId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [openId]);

  const list = useMemo(() => WORKFLOWS.filter((w) => (cat === "all" || w.category === cat) && matches(w, q)), [cat, q]);
  const counts = useMemo(
    () => Object.fromEntries(CATEGORIES.map((c) => [c.key, WORKFLOWS.filter((w) => (c.key === "all" || w.category === c.key) && matches(w, q)).length])),
    [q],
  );
  const open = WORKFLOWS.find((w) => w.id === openId) ?? null;

  return (
    <div className="fh-guide">
      <style>{STYLES}</style>
      <header style={{ borderBottom: `1px solid ${C.line}`, background: "rgba(251,247,244,.9)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 20 }}>
        <div className="fh-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: 60 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", fontWeight: 700, letterSpacing: "-.02em" }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: RED, display: "inline-block" }} aria-hidden />
            FynHelp
            <span style={{ fontWeight: 500, color: C.muted }}>/ Resource &amp; Product Guide</span>
          </a>
          <a href="/v2" style={{ fontSize: 14, fontWeight: 600, textDecoration: "none", color: C.deep }}>Open the app →</a>
        </div>
      </header>

      <main className="fh-wrap" style={{ padding: "36px 20px 80px" }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: "inline-block", height: 3, width: 56, borderRadius: 3, background: RED, marginBottom: 14 }} />
          <h1 style={{ fontSize: "clamp(30px, 4.4vw, 46px)", lineHeight: 1.05, letterSpacing: "-.035em", margin: 0, fontWeight: 650 }}>Resource &amp; Product Guide</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: C.body, margin: "14px 0 0" }}>
            How FynHelp's agents read documents, reconcile bank and books, apply Indian GST, TDS and payroll rules, and hand everything uncertain to a person. Every threshold here is the one the product runs on.
          </p>
        </div>

        <div style={{ display: "grid", gap: 14, margin: "28px 0 22px" }}>
          <label className="fh-search">
            <Search size={18} color={C.muted} />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Search workflows, e.g. "TDS 194C", "2B vs Purchase", "HDFC Statement"'
              aria-label="Search the guide"
            />
            {q ? (
              <button onClick={() => setQ("")} aria-label="Clear search" style={{ border: 0, background: "transparent", cursor: "pointer", color: C.muted, display: "grid" }}>
                <X size={16} />
              </button>
            ) : (
              <span className="fh-kbd">⌘K</span>
            )}
          </label>
          <div className="fh-tabs" role="tablist" aria-label="Categories">
            {CATEGORIES.map((c) => (
              <button key={c.key} role="tab" aria-selected={cat === c.key} className="fh-tab" onClick={() => setCat(c.key)}>
                {c.label} <span className="num" style={{ opacity: 0.6, marginLeft: 4 }}>{counts[c.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="fh-sec" style={{ textAlign: "center", padding: 40, color: C.body }}>
            Nothing matches "{q}". Try a tax section (194J), a bank (HDFC) or a step (exception, gross up).
          </div>
        ) : (
          <div className="fh-grid">
            {list.map((w) => (
              <article key={w.id} className="fh-card" data-testid={`guide-card-${w.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <h2 style={{ fontSize: 18, lineHeight: 1.25, letterSpacing: "-.02em", margin: 0, fontWeight: 600 }}>{w.title}</h2>
                  <span className="fh-badge" style={{ flexShrink: 0 }}>{CAT_LABEL[w.category].replace(" Workflows", "").replace("Bank & Ledger ", "")}</span>
                </div>
                <div className="fh-pipe" aria-label="Pipeline">
                  {w.pipeline.map((p, i) => (
                    <span key={p} style={{ display: "contents" }}>
                      <span className="fh-pnode">{p}</span>
                      {i < w.pipeline.length - 1 && <ArrowRight size={13} color="rgba(255,255,255,.4)" />}
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "rgba(255,255,255,.7)" }}>{w.summary}</p>
                <div className="fh-specs">
                  <div className="fh-spec"><span>Logic</span><b>{w.logic}</b></div>
                  <div className="fh-spec"><span>Trust gate</span><b className="mono" style={{ fontSize: 11.5 }}>{w.confidence}</b></div>
                  <div className="fh-spec"><span>Time</span><b className="mono" style={{ fontSize: 11.5 }}>{w.timing}</b></div>
                </div>
                <button className="fh-cta" onClick={() => setOpenId(w.id)}>
                  Explore Flow &amp; Documentation <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
        )}

        <p style={{ fontSize: 13, color: C.muted, marginTop: 28 }}>
          Timings marked measured come from FynHelp's own retest packs. Rules follow Indian GST, TDS (Income-tax Act, 2025, read with the familiar 1961 section codes) and EPF/ESI practice; checks flag issues for a person and never change your data.
        </p>
      </main>

      {open && <Detail w={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Detail({ w, onClose }: { w: Workflow; onClose: () => void }) {
  const [node, setNode] = useState<FlowNode | null>(w.nodes.find((n) => n.kind === "ai" || n.kind === "decision") ?? w.nodes[0]);
  useEffect(() => setNode(w.nodes.find((n) => n.kind === "ai" || n.kind === "decision") ?? w.nodes[0]), [w]);
  return (
    <>
      <div className="fh-drawer-back" onClick={onClose} />
      <aside className="fh-drawer" role="dialog" aria-modal="true" aria-label={w.title} data-testid="guide-detail">
        <div style={{ height: 3, background: RED }} />
        <div style={{ padding: "22px 24px 60px", display: "grid", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.red, letterSpacing: ".04em" }}>{CAT_LABEL[w.category]}</div>
              <h2 style={{ fontSize: "clamp(22px, 3vw, 30px)", letterSpacing: "-.03em", margin: "4px 0 6px", fontWeight: 650, lineHeight: 1.1 }}>{w.title}</h2>
              <p style={{ margin: 0, color: C.body, fontSize: 15, lineHeight: 1.55, maxWidth: 760 }}>{w.summary}</p>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${C.line}`, background: C.card, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
            {([["Logic", w.logic], ["Trust gate", w.confidence], ["Time", w.timing]] as const).map(([k, v]) => (
              <div key={k} className="fh-sec" style={{ padding: 14 }}>
                <div className="fh-h" style={{ marginBottom: 6 }}>{k}</div>
                <div className={k === "Logic" ? "" : "mono"} style={{ fontSize: 14, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
            <Diagram w={w} selected={node?.id ?? null} onSelect={setNode} />
            {node && (
              <div className="fh-sec" data-testid="guide-node-note" style={{ borderLeft: "3px solid transparent", borderImage: `${RED} 1` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: KIND_STYLE[node.kind].fill, color: KIND_STYLE[node.kind].text, border: `1px solid ${KIND_STYLE[node.kind].stroke}` }}>{KIND_LABEL[node.kind]}</span>
                  <b style={{ fontSize: 15 }}>{node.label}</b>
                </div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.body }}>{node.note}</p>
              </div>
            )}
            <div className="fh-legend" aria-label="Legend">
              {(Object.keys(KIND_LABEL) as NodeKind[]).map((k) => (
                <span key={k}><i style={{ background: KIND_STYLE[k].fill, borderColor: KIND_STYLE[k].stroke }} />{KIND_LABEL[k]}</span>
              ))}
              <span><i style={{ background: "transparent", borderColor: C.red, borderStyle: "dashed" }} />Exception path</span>
            </div>
          </div>

          <div className="fh-two">
            <section className="fh-sec">
              <h3 className="fh-h">Inputs &amp; specs</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {w.inputs.map((i) => (
                  <div key={i.label}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{i.label}</div>
                    <div style={{ fontSize: 14, color: C.body, lineHeight: 1.55 }}>{i.detail}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="fh-sec">
              <h3 className="fh-h">Agent heuristics &amp; rules</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {w.rules.map((r) => (
                  <div key={r} className="fh-li"><span className="fh-dot" />{r}</div>
                ))}
              </div>
            </section>
          </div>

          <section className="fh-sec">
            <h3 className="fh-h">Exception paths: when a person decides</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {w.exceptions.map((e) => (
                <div key={e.trigger} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 28px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
                  <div style={{ background: "#FFF6E5", border: "1px solid #E7C27D", borderRadius: 12, padding: "10px 12px", fontSize: 13.5 }}>{e.trigger}</div>
                  <ArrowRight size={18} color={C.red} style={{ justifySelf: "center" }} />
                  <div style={{ background: "#EEF2FF", border: "1px solid #B9C0F0", borderRadius: 12, padding: "10px 12px", fontSize: 13.5 }}>{e.outcome}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="fh-sec">
            <h3 className="fh-h">Data transformation preview</h3>
            <div className="fh-two">
              <Preview title="Before · raw input" data={w.before} tone="raw" />
              <Preview title="After · cleaned / reconciled" data={w.after} tone="clean" />
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function Preview({ title, data, tone }: { title: string; data: Workflow["before"]; tone: "raw" | "clean" }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", background: tone === "raw" ? "#FAF8F6" : C.card }}>
      <div style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600, color: tone === "raw" ? C.muted : "#1D4732", borderBottom: `1px solid ${C.line}`, background: tone === "raw" ? "transparent" : "#EAF5EF" }}>{title}</div>
      <div className="fh-scroll">
        <table className="fh-table">
          <thead>
            <tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j} style={{ whiteSpace: r.length === 1 ? "normal" : "nowrap", wordBreak: r.length === 1 ? "break-all" : undefined }}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const NW = 168;
const NH = 52;

/** An SVG flowchart with zoom and pan; nodes are clickable. */
function Diagram({ w, selected, onSelect }: { w: Workflow; selected: string | null; onSelect: (n: FlowNode) => void }) {
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [w]);
  const width = Math.max(...w.nodes.map((n) => n.x)) + NW + 30;
  const height = Math.max(...w.nodes.map((n) => n.y)) + NH + 30;
  const byId = Object.fromEntries(w.nodes.map((n) => [n.id, n]));
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(2.4, Math.max(0.5, v.k * f)) }));

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  const edgePath = (a: FlowNode, b: FlowNode) => {
    const x1 = a.x + NW;
    const y1 = a.y + NH / 2;
    const x2 = b.x;
    const y2 = b.y + NH / 2;
    const mx = (x1 + x2) / 2;
    return { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 6},${y2}`, lx: mx, ly: (y1 + y2) / 2 };
  };

  const btn: CSSProperties = {};
  return (
    <div
      className="fh-diagram"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 0.9);
      }}
      data-testid="guide-diagram"
    >
      <div className="fh-zoom">
        <button style={btn} onClick={() => zoom(1.2)} aria-label="Zoom in"><Plus size={16} /></button>
        <button style={btn} onClick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Minus size={16} /></button>
        <button style={btn} onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Reset view"><RotateCcw size={15} /></button>
      </div>
      <div style={{ overflow: "hidden" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 640, height: "auto", display: "block", userSelect: "none" }} role="img" aria-label={`${w.title} flowchart`}>
          <defs>
            <linearGradient id="fhred" x1="0" x2="1">
              <stop offset="0%" stopColor="#FF3B30" />
              <stop offset="50%" stopColor="#E53935" />
              <stop offset="100%" stopColor="#990000" />
            </linearGradient>
            <marker id="fharrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="rgba(27,15,13,.45)" />
            </marker>
            <marker id="fharrowx" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#E53935" />
            </marker>
          </defs>
          <g transform={`translate(${view.x / view.k}, ${view.y / view.k}) scale(${view.k})`} style={{ transformOrigin: "0 0", transition: drag.current?.moved ? "none" : "transform .2s ease" }}>
            {w.edges.map((e, i) => {
              const a = byId[e.from];
              const b = byId[e.to];
              if (!a || !b) return null;
              const p = edgePath(a, b);
              return (
                <g key={i}>
                  <path d={p.d} fill="none" stroke={e.exception ? "#E53935" : "rgba(27,15,13,.35)"} strokeWidth={1.6} strokeDasharray={e.exception ? "5 4" : undefined} markerEnd={`url(#${e.exception ? "fharrowx" : "fharrow"})`} />
                  {e.label && (
                    <g>
                      <rect x={p.lx - e.label.length * 3.4 - 6} y={p.ly - 10} width={e.label.length * 6.8 + 12} height={20} rx={6} fill="#fff" stroke={e.exception ? "#F3B0AC" : "rgba(27,15,13,.12)"} />
                      <text x={p.lx} y={p.ly + 4} textAnchor="middle" fontSize={11} fontFamily="var(--font-geist-mono)" fill={e.exception ? "#B42424" : "rgba(27,15,13,.7)"}>{e.label}</text>
                    </g>
                  )}
                </g>
              );
            })}
            {w.nodes.map((n) => {
              const s = KIND_STYLE[n.kind];
              const active = selected === n.id;
              return (
                <g
                  key={n.id}
                  className="fh-node"
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.label}: ${KIND_LABEL[n.kind]}`}
                  onClick={() => {
                    if (!drag.current?.moved) onSelect(n);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelect(n);
                  }}
                >
                  <rect x={n.x} y={n.y} width={NW} height={NH} rx={n.kind === "decision" ? 26 : 12} fill={active ? "url(#fhred)" : s.fill} stroke={active ? "#990000" : s.stroke} strokeWidth={active ? 2 : 1.2} />
                  <text x={n.x + NW / 2} y={n.y + 22} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={active ? "#fff" : s.text} fontFamily="var(--font-geist-sans)">
                    {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
                  </text>
                  <text x={n.x + NW / 2} y={n.y + 38} textAnchor="middle" fontSize={10} fill={active ? "rgba(255,255,255,.85)" : "rgba(27,15,13,.5)"} fontFamily="var(--font-geist-sans)">
                    {KIND_LABEL[n.kind]}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div style={{ padding: "8px 12px", fontSize: 12, color: C.muted, borderTop: `1px solid ${C.line}` }}>
        Click a step for its rule · drag to pan · Ctrl/⌘ + scroll or the buttons to zoom
      </div>
    </div>
  );
}
