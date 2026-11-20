import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { V } from "../../ui";
import { confidenceView, type Handoff } from "../../lib/agentTrust";

/**
 * The shared pieces of a working screen, in one place so tables, side-by-side windows and forms look and behave the same everywhere:
 *   StatStrip     a title's numbers, large and unboxed
 *   TableToolbar  search on the left; quick filter, columns and filters on the right
 *   Pager         page size, "Showing a to b of n entries", page numbers
 *   StatusPill    a soft pill for a state in a table
 *   Compare       two columns side by side with the difference between them said once
 *   SidePanel     a panel that slides over the right, with the page still visible behind it
 *   FormSection / Field / PanelFooter   the form inside it: accent bar, labelled fields, sticky Cancel and primary action
 */
export const KIT_CSS = `
.kt-strip { display:flex; gap:44px; flex-wrap:wrap; padding:4px 2px 2px; }
.kt-strip div { min-width:96px; } .kt-strip small { display:block; font-size:12.5px; color:${V.muted}; font-weight:500; }
.kt-strip b { display:block; margin-top:2px; font-size:30px; line-height:1.1; font-weight:500; letter-spacing:-.03em; color:${V.ink}; font-variant-numeric:tabular-nums; }
.kt-strip b.bad { color:${V.maroon}; } .kt-strip b.good { color:${V.green}; }
.kt-card { border-radius:22px; border:1px solid ${V.line}; background:${V.card}; box-shadow: var(--v2-card-shadow); overflow:hidden; }
.kt-bar { display:flex; align-items:center; gap:12px; padding:14px 18px; flex-wrap:wrap; }
.kt-search { display:flex; align-items:center; gap:8px; height:38px; padding:0 12px; border-radius:12px; border:1px solid ${V.line}; background:${V.gray}; min-width:240px; flex:1 1 240px; max-width:340px; }
.kt-search input { border:0; outline:0; background:transparent; font:inherit; font-size:13.5px; color:${V.ink}; width:100%; }
.kt-tools { margin-left:auto; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.kt-tool { display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 12px; border-radius:11px; border:0; background:transparent; font:inherit; font-size:13px; font-weight:550; color:${V.body}; cursor:pointer; }
.kt-tool:hover, .kt-tool[data-on="1"] { background:${V.cream}; color:${V.maroon}; }
.kt-tool select { border:0; background:transparent; font:inherit; font-size:13px; font-weight:550; color:inherit; cursor:pointer; outline:0; }
.kt-table { width:100%; border-collapse:collapse; }
.kt-table th { text-align:left; font-size:12px; font-weight:600; color:${V.muted}; padding:11px 16px; background:${V.gray}; border-top:1px solid ${V.line}; border-bottom:1px solid ${V.line}; white-space:nowrap; }
.kt-table td { padding:13px 16px; font-size:13.5px; color:${V.ink}; border-bottom:1px solid ${V.line}; font-variant-numeric:tabular-nums; }
.kt-table tbody tr { cursor:pointer; transition: background .15s ease; } .kt-table tbody tr:hover { background:${V.gray}; }
.kt-table tbody tr[aria-selected="true"] { background:rgba(217,43,43,.06); }
.kt-table .r { text-align:right; } .kt-table tbody tr:last-child td { border-bottom:0; }
.kt-foot { display:flex; align-items:center; gap:16px; padding:12px 18px; border-top:1px solid ${V.line}; font-size:12.5px; color:${V.muted}; flex-wrap:wrap; }
.kt-pages { margin-left:auto; display:flex; gap:4px; align-items:center; }
.kt-pg { min-width:30px; height:30px; border-radius:9px; border:0; background:transparent; font:inherit; font-size:12.5px; font-weight:600; color:${V.body}; cursor:pointer; display:grid; place-items:center; }
.kt-pg[data-on="1"] { background:${V.cream}; color:${V.maroon}; } .kt-pg:disabled { opacity:.4; cursor:default; }
.kt-pill { white-space:nowrap; display:inline-flex; align-items:center; height:22px; padding:0 9px; border-radius:999px; font-size:11.5px; font-weight:650; }
.kt-pill.good { background:var(--v2-good-bg); color:${V.green}; } .kt-pill.bad { background:rgba(217,43,43,.14); color:${V.maroon}; } .kt-pill.warn { background:${V.warnBg}; color:${V.warnFg}; } .kt-pill.neutral { background:${V.gray}; color:${V.body}; } .kt-pill.info { background:${V.blue}; color:${V.brandDeep}; }
.kt-bal { border-radius:20px; border:1px solid ${V.line}; background:${V.card}; box-shadow: var(--v2-card-shadow); overflow:hidden; cursor:pointer; text-align:left; font:inherit; padding:0; transition: transform .2s ease, box-shadow .2s ease; }
.kt-bal:hover { transform: translateY(-2px); } .kt-bal[aria-pressed="true"] { outline:2px solid rgba(217,43,43,.35); }
.kt-bal > header { display:flex; align-items:center; gap:12px; padding:16px 18px; }
.kt-bal > header i { width:34px; height:34px; border-radius:11px; background:${V.cream}; color:${V.maroon}; display:grid; place-items:center; font-style:normal; font-weight:700; font-size:12px; letter-spacing:.02em; }
.kt-bal > header b { display:block; font-size:16px; font-weight:600; letter-spacing:-.01em; color:${V.ink}; } .kt-bal > header small { font-size:12.5px; color:${V.muted}; }
.kt-bal > header .kt-pill { margin-left:auto; }
.kt-bal > div { display:grid; grid-template-columns:1fr 1fr; border-top:1px solid ${V.line}; background:${V.gray}; }
.kt-bal > div section { padding:14px 18px 16px; } .kt-bal > div section + section { border-left:1px solid ${V.line}; }
.kt-bal small.l { display:block; font-size:12px; color:${V.muted}; } .kt-bal b.v { display:block; margin-top:3px; font-size:22px; font-weight:500; letter-spacing:-.02em; color:${V.ink}; font-variant-numeric:tabular-nums; }
.kt-cmp { display:grid; grid-template-columns: 1fr 1fr; border-radius:18px; border:1px solid ${V.line}; overflow:hidden; background:${V.card}; }
.kt-cmp > section { padding:16px 18px; } .kt-cmp > section + section { border-left:1px solid ${V.line}; background:${V.gray}; }
.kt-cmp h5 { margin:0 0 10px; font-size:11.5px; letter-spacing:.1em; text-transform:uppercase; color:${V.muted}; font-weight:700; }
.kt-line { display:flex; justify-content:space-between; gap:12px; padding:7px 0; font-size:13px; border-bottom:1px dashed ${V.line}; font-variant-numeric:tabular-nums; } .kt-line:last-child { border-bottom:0; }
.kt-line span:first-child { color:${V.body}; } .kt-line b { font-weight:600; color:${V.ink}; }
.kt-diff { grid-column:1 / -1; display:flex; justify-content:space-between; align-items:center; padding:13px 18px; border-top:1px solid ${V.line}; font-size:13.5px; font-weight:650; }
.kt-diff.ok { background:var(--v2-good-bg); color:${V.green}; } .kt-diff.bad { background:rgba(217,43,43,.1); color:${V.maroon}; }
.kt-fs { background:${V.card}; border-radius:18px; border:1px solid ${V.line}; padding:6px 0 4px; overflow:hidden; }
.kt-fs > h4 { margin:0; display:flex; align-items:center; gap:10px; padding:14px 18px 6px; font-size:15px; font-weight:650; letter-spacing:-.01em; color:${V.ink}; }
.kt-fs > h4::before { content:""; width:4px; height:16px; border-radius:3px; background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); }
.kt-fs > div { padding:6px 18px 14px; display:grid; gap:14px; }
.kt-f label { display:block; font-size:13px; font-weight:550; color:${V.ink}; margin-bottom:6px; } .kt-f label i { color:${V.coral}; font-style:normal; margin-left:2px; }
.kt-f small { display:block; margin-top:5px; font-size:12px; color:${V.muted}; }
.kt-in { width:100%; height:42px; border-radius:11px; border:1px solid ${V.line}; background:${V.card}; padding:0 13px; font:inherit; font-size:13.5px; color:${V.ink}; }
.kt-in:focus { outline:2px solid rgba(217,43,43,.3); outline-offset:1px; }
textarea.kt-in { height:auto; padding:12px 13px; line-height:1.6; }
.kt-pf { position:sticky; bottom:0; display:grid; grid-template-columns: 1fr 2fr; gap:10px; padding:14px 0 4px; background:linear-gradient(180deg, transparent, ${V.bg} 28%); }
.kt-pf button { height:46px; border-radius:13px; font:inherit; font-size:14px; font-weight:650; cursor:pointer; }
.kt-pf .cancel { border:1px solid ${V.line}; background:${V.card}; color:${V.ink}; }
.kt-pf .go { border:0; color:#fff; background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); box-shadow:0 12px 24px -14px var(--v2-brand); } .kt-pf .go:disabled { opacity:.55; cursor:default; }
`;

export function Kit() {
  return <style>{KIT_CSS}</style>;
}

export function StatStrip({ items }: { items: { label: string; value: ReactNode; tone?: "bad" | "good" }[] }) {
  return <div className="kt-strip">{items.map((i) => <div key={i.label}><small>{i.label}</small><b className={i.tone}>{i.value}</b></div>)}</div>;
}

export function TableToolbar({ search, onSearch, placeholder = "Search here…", children }: { search: string; onSearch: (v: string) => void; placeholder?: string; children?: ReactNode }) {
  return (
    <div className="kt-bar">
      <label className="kt-search"><Search size={15} color="var(--v2-muted)" /><input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
      <div className="kt-tools">{children}</div>
    </div>
  );
}

/** A quick filter as a select that looks like a toolbar button. The first option is "no filter". */
export function QuickFilter<T extends string>({ value, onChange, options, label = "Quick filter" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    <label className="kt-tool" data-on={value !== options[0]?.value ? "1" : undefined}>
      <Filter size={14} />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </label>
  );
}

export function ToolButton({ icon, children, on, onClick }: { icon?: ReactNode; children: ReactNode; on?: boolean; onClick?: () => void }) {
  return <button type="button" className="kt-tool" data-on={on ? "1" : undefined} onClick={onClick}>{icon ?? <SlidersHorizontal size={14} />}{children}</button>;
}

export function Pager({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50] }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; sizes?: number[] }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <div className="kt-foot">
      {onPageSize && (
        <label>Rows{" "}
          <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} style={{ border: `1px solid ${V.line}`, borderRadius: 8, padding: "3px 6px", background: V.card, color: V.ink, font: "inherit" }}>
            {sizes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      )}
      <span>Showing {from} to {to} of {total} entries</span>
      <nav className="kt-pages" aria-label="Pages">
        <button className="kt-pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
        {nums.map((n, i) => (
          <span key={n} style={{ display: "contents" }}>
            {i > 0 && n - nums[i - 1]! > 1 && <span style={{ padding: "0 2px" }}>…</span>}
            <button className="kt-pg" data-on={n === page ? "1" : undefined} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
          </span>
        ))}
        <button className="kt-pg" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
      </nav>
    </div>
  );
}

/** Confidence in words with the number beside it, and the reason it is not higher on hover. Never a bare percentage. */
export function ConfidenceBadge({ score, reason }: { score: number; reason?: string }) {
  const v = confidenceView(score);
  return <span className={`kt-pill ${v.tone}`} title={reason ? `${v.label} (${v.percent}%). ${reason}` : `${v.label} (${v.percent}%)`}>{v.label} · {v.percent}%</span>;
}

/** An agent handing something to a person: a visible state change saying what was done, why it stops here, and who has it now. */
export function HandoffNote({ handoff, action }: { handoff: Handoff; action?: ReactNode }) {
  return (
    <div role="status" data-testid="handoff" style={{ borderRadius: 16, border: "1px solid rgba(217,43,43,.28)", background: "rgba(217,43,43,.06)", padding: "14px 16px", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: V.coral }} />
        <b style={{ fontSize: 13.5, color: V.maroon }}>{handoff.title}</b>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13, lineHeight: 1.5, color: V.body }}>
        <span style={{ color: V.muted, fontWeight: 600 }}>Done</span><span>{handoff.did}</span>
        <span style={{ color: V.muted, fontWeight: 600 }}>Why it stopped</span><span>{handoff.why}</span>
        <span style={{ color: V.muted, fontWeight: 600 }}>Now</span><span>{handoff.now}</span>
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ tone = "neutral", children }: { tone?: "good" | "bad" | "warn" | "neutral" | "info"; children: ReactNode }) {
  return <span className={`kt-pill ${tone}`}>{children}</span>;
}

/** One account or head with its two balances side by side (the portal and Tally, the bank and the books), as in the reference's account cards. */
export function BalanceCard({ mark, title, sub, left, right, pill, selected, onClick }: { mark: string; title: string; sub?: string; left: { label: string; value: ReactNode }; right: { label: string; value: ReactNode }; pill?: ReactNode; selected?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="kt-bal" aria-pressed={selected} onClick={onClick}>
      <header><i aria-hidden="true">{mark}</i><span><b>{title}</b>{sub && <small>{sub}</small>}</span>{pill}</header>
      <div><section><small className="l">{left.label}</small><b className="v">{left.value}</b></section><section><small className="l">{right.label}</small><b className="v">{right.value}</b></section></div>
    </button>
  );
}

type Side = { title: string; lines: [string, ReactNode][] };
/** Two sides of one fact (a ledger and its source, 26AS and the books) with the difference between them said once. */
export function Compare({ left, right, diff }: { left: Side; right: Side; diff?: { label: string; value: ReactNode; ok: boolean } }) {
  const side = (s: Side) => <section><h5>{s.title}</h5>{s.lines.map(([k, v]) => <div className="kt-line" key={k}><span>{k}</span><b>{v}</b></div>)}</section>;
  return <div className="kt-cmp">{side(left)}{side(right)}{diff && <div className={`kt-diff ${diff.ok ? "ok" : "bad"}`}><span>{diff.label}</span><span>{diff.value}</span></div>}</div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="kt-fs"><h4>{title}</h4><div>{children}</div></section>;
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return <div className="kt-f"><label>{label}{required && <i aria-hidden="true">*</i>}</label>{children}{hint && <small>{hint}</small>}</div>;
}

export function PanelFooter({ onCancel, onPrimary, primary, busy, disabled }: { onCancel: () => void; onPrimary: () => void; primary: ReactNode; busy?: boolean; disabled?: boolean }) {
  return (
    <div className="kt-pf">
      <button type="button" className="cancel" onClick={onCancel}>Cancel</button>
      <button type="button" className="go" onClick={onPrimary} disabled={busy || disabled}>{primary}</button>
    </div>
  );
}

/** A panel that slides over the right of the page with the page still visible behind it, like the reference's New Account form. */
export function SidePanel({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--v2-overlay)", backdropFilter: "blur(2px)" }} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-label={title} style={{ position: "absolute", top: 12, right: 12, bottom: 12, width: `min(${width}px, calc(100vw - 24px))`, background: V.bg, borderRadius: 24, border: `1px solid ${V.line}`, boxShadow: "0 30px 80px -30px rgba(20,18,16,.5)", display: "flex", flexDirection: "column", outline: 0 }}>
        <style>{KIT_CSS}</style>
        <header style={{ display: "flex", alignItems: "center", padding: "18px 22px 8px" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: "-.02em" }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: 0, background: "transparent", cursor: "pointer", color: "var(--v2-muted)", padding: 6, borderRadius: 8 }}><X size={18} /></button>
        </header>
        <div style={{ overflow: "auto", padding: "8px 22px 18px", display: "grid", gridAutoRows: "max-content", gap: 14, alignContent: "start", flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
