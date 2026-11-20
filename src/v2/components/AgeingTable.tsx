import { useMemo, useState } from "react";
import { V, SortTh, useSort } from "../ui";
import type { AgeingReport, AgeingRow } from "@/lib/practice/review/ageingReport";
import { Compare, Kit, Pager, QuickFilter, SidePanel, StatStrip, StatusPill, TableToolbar } from "./kit/Kit";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Filter = "all" | "over90" | "onaccount" | "billwise" | "untied";
const FILTERS: { value: Filter; label: string }[] = [{ value: "all", label: "All parties" }, { value: "over90", label: "Over 90 days" }, { value: "onaccount", label: "With on-account" }, { value: "billwise", label: "Bill-wise in Tally" }, { value: "untied", label: "Does not tie" }];

/**
 * Ageing as a working table: numbers on top, search and a quick filter, sortable columns, paging, and a side window for the party that compares
 * the ledger with the Trial Balance and lists the open bills. The same layout is used for every large list in the product.
 */
export default function AgeingTable({ report, side, onSide, days, onDays, defaultOpen }: { defaultOpen?: number; report: AgeingReport; side: "debtor" | "creditor"; onSide: (s: "debtor" | "creditor") => void; days: string; onDays: (v: string) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [open, setOpen] = useState<AgeingRow | null>(defaultOpen === undefined ? null : report.rows[defaultOpen] ?? null);
  const rows = useMemo(() => report.rows.filter((r) => (!q || r.party.toLowerCase().includes(q.toLowerCase())) && (filter === "all" || (filter === "over90" ? r.buckets.d90plus > 0 : filter === "onaccount" ? r.onAccount > 0 : filter === "billwise" ? r.billWise : !r.tied))), [report, q, filter]);
  const { sorted, sort, toggle } = useSort(rows, { party: (r: AgeingRow) => r.party, closing: (r) => r.closing, c0: (r) => r.buckets.current, c1: (r) => r.buckets.d31_60, c2: (r) => r.buckets.d61_90, c3: (r) => r.buckets.d90plus, oa: (r) => r.onAccount });
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(page, pages);
  const view = sorted.slice((cur - 1) * size, cur * size);
  const T = report.totals;
  return (
    <div data-testid="ageing" style={{ display: "grid", gap: 14 }}>
      <Kit />
      <StatStrip items={[
        { label: side === "debtor" ? "Debtors" : "Creditors", value: report.rows.length },
        { label: "Closing", value: inr(T.closing) },
        { label: "Over 90 days", value: inr(T.d90plus), tone: T.d90plus > 0 ? "bad" : undefined },
        { label: "On account", value: inr(T.onAccount) },
        { label: "Tie to Trial Balance", value: report.untied.length ? `${report.rows.length - report.untied.length} of ${report.rows.length}` : "All", tone: report.untied.length ? "bad" : "good" },
      ]} />
      <div className="kt-card">
        <TableToolbar search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="Search parties…">
          <label className="kt-tool" style={{ gap: 6 }}>Credit days <input className="kt-in" style={{ width: 62, height: 30, padding: "0 8px" }} inputMode="numeric" value={days} onChange={(e) => onDays(e.target.value.replace(/\D/g, ""))} aria-label="Credit days" /></label>
          <QuickFilter value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={FILTERS} />
          <QuickFilter label="Debtors or creditors" value={side} onChange={onSide} options={[{ value: "debtor", label: "Debtors" }, { value: "creditor", label: "Creditors" }]} />
        </TableToolbar>
        <div className="v2-scroll">
          <table className="kt-table">
            <thead><tr><SortTh label="Party" k="party" sort={sort} toggle={toggle} /><SortTh label="Closing" k="closing" sort={sort} toggle={toggle} align="right" /><SortTh label="0–30" k="c0" sort={sort} toggle={toggle} align="right" /><SortTh label="31–60" k="c1" sort={sort} toggle={toggle} align="right" /><SortTh label="61–90" k="c2" sort={sort} toggle={toggle} align="right" /><SortTh label="Over 90" k="c3" sort={sort} toggle={toggle} align="right" /><SortTh label="On account" k="oa" sort={sort} toggle={toggle} align="right" /><th>Status</th></tr></thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.party} aria-selected={open?.party === r.party} onClick={() => setOpen(r)}>
                  <td style={{ fontWeight: 600 }}>{r.party}</td>
                  <td className="r">{inr(r.closing)}</td><td className="r">{inr(r.buckets.current)}</td><td className="r">{inr(r.buckets.d31_60)}</td><td className="r">{inr(r.buckets.d61_90)}</td>
                  <td className="r" style={{ color: r.buckets.d90plus > 0 ? V.maroon : undefined, fontWeight: r.buckets.d90plus > 0 ? 600 : undefined }}>{inr(r.buckets.d90plus)}</td>
                  <td className="r">{inr(r.onAccount)}</td>
                  <td>{!r.tied ? <StatusPill tone="bad">Does not tie</StatusPill> : r.billWise ? <StatusPill tone="warn">Bill-wise</StatusPill> : <StatusPill tone="good">Ties</StatusPill>}</td>
                </tr>
              ))}
              {view.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: V.muted, padding: 28 }}>No parties match.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={cur} pageSize={size} total={sorted.length} onPage={setPage} onPageSize={(n) => { setSize(n); setPage(1); }} />
      </div>
      <p style={{ fontSize: 12.5, color: V.body, margin: 0 }}>{report.dueBasis}</p>
      {report.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: 0 }}>{n}</p>)}

      <SidePanel open={!!open} onClose={() => setOpen(null)} title={open?.party ?? ""}>
        {open && (
          <>
            <Compare
              left={{ title: "Ageing (Day Book)", lines: [["Open bills", inr(open.closing + open.onAccount)], ["On account", inr(open.onAccount)], ["Closing", inr(open.closing)]] }}
              right={{ title: "Trial Balance", lines: [["Closing", inr(open.tbClosing)], ["Bill-wise in Tally", open.billWise ? "Yes" : "No"], ["Basis", open.method === "bill-wise" ? "Bill references" : "First in, first out"]] }}
              diff={{ label: open.tied ? "Ties to the Trial Balance" : "Difference", value: open.tied ? "✓" : inr(open.closing - open.tbClosing), ok: open.tied }}
            />
            <div className="kt-fs">
              <h4>Open bills, oldest first</h4>
              <div>
                {open.open.length === 0 ? <span style={{ fontSize: 13, color: V.muted }}>No open bills.</span> : open.open.slice(0, 25).map((b) => (
                  <div className="kt-line" key={`${b.ref}${b.date}`}><span>{b.ref} · {b.date === "1900-01-01" ? "opening" : b.date}</span><b>{inr(b.amount)} <span style={{ color: V.muted, fontWeight: 500 }}>· {b.age >= 9999 ? "dated before the year" : `${b.age} days`}</span></b></div>
                ))}
              </div>
            </div>
            {open.billWise && <p style={{ fontSize: 12.5, color: V.warnFg, margin: 0 }}>This party is kept bill-wise in Tally, so its real open bills may differ from first in, first out. Check them against Tally's bill-wise outstanding.</p>}
          </>
        )}
      </SidePanel>
    </div>
  );
}
