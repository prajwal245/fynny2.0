import { useMemo, useState } from "react";
import { V, SortTh, useSort } from "../ui";
import type { As26, As26Check, BooksTds, DeductorMatch, TdsCompare } from "@/lib/practice/tax/tds";
import { Compare, Kit, Pager, QuickFilter, SidePanel, StatStrip, StatusPill, TableToolbar } from "./kit/Kit";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Filter = "all" | "differs" | "higher" | "nomatch";

/** TDS against 26AS: the section totals as numbers, deductors as a table, and a side window per deductor with 26AS and the books side by side. */
export default function TdsTable({ as26, checks, cmp, matches, unassigned, books, defaultOpen }: { defaultOpen?: number; as26: As26; checks: As26Check[]; cmp: TdsCompare; matches: DeductorMatch[]; unassigned: { party: string; amount: number }[]; books: BooksTds }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<DeductorMatch | null>(defaultOpen === undefined ? null : matches[defaultOpen] ?? null);
  const rows = useMemo(() => matches.filter((m) => (!q || m.deductor.name.toLowerCase().includes(q.toLowerCase()) || m.deductor.tan.toLowerCase().includes(q.toLowerCase())) && (filter === "all" || (filter === "differs" ? Math.abs(m.diff) > 1 : filter === "higher" ? m.diff > 1 : m.parties.length === 0))), [matches, q, filter]);
  const { sorted, sort, toggle } = useSort(rows, { name: (m: DeductorMatch) => m.deductor.name, as26: (m) => m.deductor.tax, books: (m) => m.books, diff: (m) => m.diff });
  const size = 10, cur = Math.min(page, Math.max(1, Math.ceil(sorted.length / size)));
  const view = sorted.slice((cur - 1) * size, cur * size);
  const higher = cmp.rows.filter((r) => r.status === "books_higher").reduce((n, r) => n + r.diff, 0);
  return (
    <div data-testid="tds-check" style={{ display: "grid", gap: 14 }}>
      <Kit />
      <StatStrip items={[
        { label: "Tax on 26AS", value: inr(cmp.as26Total) },
        { label: "TDS taken in books", value: inr(cmp.booksTotal) },
        { label: "Books above 26AS", value: inr(higher), tone: higher > 0 ? "bad" : "good" },
        { label: "Deductors", value: as26.deductors.length },
      ]} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {checks.map((c) => <StatusPill key={c.id} tone={c.ok ? "good" : "bad"}>{c.label}</StatusPill>)}
        {cmp.rows.map((r) => <StatusPill key={r.section} tone={r.status === "agree" ? "good" : r.status === "books_higher" ? "bad" : "warn"}>{r.section}: {r.status === "agree" ? "agrees" : r.status === "books_higher" ? `books higher ${inr(r.diff)}` : `books lower ${inr(-r.diff)}`}</StatusPill>)}
      </div>
      <div className="kt-card">
        <TableToolbar search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="Search deductor or TAN…">
          <QuickFilter value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: "all", label: "All deductors" }, { value: "differs", label: "Differs" }, { value: "higher", label: "Books higher" }, { value: "nomatch", label: "No party matched" }]} />
        </TableToolbar>
        <div className="v2-scroll">
          <table className="kt-table">
            <thead><tr><SortTh label="Deductor" k="name" sort={sort} toggle={toggle} /><SortTh label="26AS tax" k="as26" sort={sort} toggle={toggle} align="right" /><SortTh label="Books" k="books" sort={sort} toggle={toggle} align="right" /><SortTh label="Difference" k="diff" sort={sort} toggle={toggle} align="right" /><th>Status</th></tr></thead>
            <tbody>
              {view.map((m) => (
                <tr key={m.deductor.tan} aria-selected={open?.deductor.tan === m.deductor.tan} onClick={() => setOpen(m)}>
                  <td><span style={{ fontWeight: 600 }}>{m.deductor.name}</span><br /><span style={{ fontSize: 12, color: V.muted }}>{m.deductor.tan}</span></td>
                  <td className="r">{inr(m.deductor.tax)}</td><td className="r">{inr(m.books)}</td>
                  <td className="r" style={{ fontWeight: 600, color: Math.abs(m.diff) <= 1 ? V.green : V.maroon }}>{Math.abs(m.diff) <= 1 ? "Agrees" : inr(m.diff)}</td>
                  <td>{m.parties.length === 0 ? <StatusPill tone="warn">No party matched</StatusPill> : Math.abs(m.diff) <= 1 ? <StatusPill tone="good">Agrees</StatusPill> : m.diff > 0 ? <StatusPill tone="bad">Books higher</StatusPill> : <StatusPill tone="warn">Books lower</StatusPill>}</td>
                </tr>
              ))}
              {view.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: V.muted, padding: 28 }}>No deductors match.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={cur} pageSize={size} total={sorted.length} onPage={setPage} />
      </div>
      {unassigned.length > 0 && <p style={{ fontSize: 12.5, color: V.body, margin: 0 }}>TDS taken in the books from parties that match no deductor on 26AS: {unassigned.map((u) => `${u.party} ${inr(u.amount)}`).join("; ")}.</p>}
      {books.clearedInYear.length > 0 && <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>Credits to the TDS-receivable ledgers in the year (opening balances cleared or adjusted): {books.clearedInYear.map((c) => `${c.ledger} ${inr(c.credit)}`).join("; ")}.</p>}
      {cmp.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: 0 }}>{n}</p>)}

      <SidePanel open={!!open} onClose={() => setOpen(null)} title={open?.deductor.name ?? ""} width={600}>
        {open && (
          <>
            <Compare
              left={{ title: "Form 26AS", lines: [["TAN", open.deductor.tan], ["Amount paid or credited", inr(open.deductor.amount)], ["Tax deducted", inr(open.deductor.tax)], ["Tax deposited", inr(open.deductor.deposited)], ["Transactions", open.deductor.rows.length]] }}
              right={{ title: "Books", lines: [["Parties matched", open.parties.length || "None"], ["TDS taken as credit", inr(open.books)], ["Difference from 26AS", Math.abs(open.diff) <= 1 ? "None" : inr(open.diff)]] }}
              diff={{ label: Math.abs(open.diff) <= 1 ? "Books agree with 26AS" : open.diff > 0 ? "Books above 26AS: not claimable yet" : "Books below 26AS: TDS not recognised", value: Math.abs(open.diff) <= 1 ? "✓" : inr(open.diff), ok: Math.abs(open.diff) <= 1 }}
            />
            <div className="kt-fs">
              <h4>On 26AS</h4>
              <div>{open.deductor.rows.slice(0, 40).map((r, i) => <div className="kt-line" key={i}><span>{r.date} · {r.section}</span><b>{inr(r.tax)} <span style={{ color: V.muted, fontWeight: 500 }}>on {inr(r.amount)}</span></b></div>)}</div>
            </div>
            <div className="kt-fs">
              <h4>In the books</h4>
              <div>{books.byParty.filter((b) => open.parties.includes(b.party)).map((b) => <div className="kt-line" key={`${b.party}${b.section}`}><span>{b.party} · {b.section ?? "no section"}</span><b>{inr(b.amount)}</b></div>)}{open.parties.length === 0 && <span style={{ fontSize: 13, color: V.muted }}>No books party is matched to this deductor. Check the party names.</span>}</div>
            </div>
          </>
        )}
      </SidePanel>
    </div>
  );
}
