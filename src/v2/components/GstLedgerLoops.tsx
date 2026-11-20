import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Upload } from "lucide-react";
import { Badge, Card, SortTh, Tabs, useSort, V } from "../ui";
import {
  detectLedgerFile, readItcReport, proveItcReport, readItcUtil, readChallans, readFilingStatus, creditLedgerLoop, inputCreditLedgers,
  cashLedgerLoop, matchChallansToBooks, challanFlags, missingReturns, readGstr3bPayment, readCreditLiability, type Challan, type CashStep, type Heads, type LedgerFileKind,
} from "@/lib/practice/gst/ledgers";
import { readTrialBalance } from "@/lib/practice/review/trialBalance";
import { readDayBookVouchers } from "@/lib/practice/review/dayBook";
import { BalanceCard, Compare, Kit, Pager, QuickFilter, SidePanel, StatStrip, StatusPill, TableToolbar } from "./kit/Kit";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const LABEL: Record<LedgerFileKind, string> = {
  itc_report: "ITC: 3B vs 2B", itc_util: "ITC claimed and utilised", challans: "Challans", filing_status: "Return filing status", credit_liability: "Credit and liability statement",
  trial_balance: "Trial Balance", ledger_masters: "Ledger masters", day_book: "Day Book", gstr3b_annual: "GSTR-3B annual",
};
const HEADS: (keyof Heads)[] = ["igst", "cgst", "sgst"];
type View = "credit" | "cash" | "challans" | "itc";
const STATUS_TONE = { PAID: "good", FAILED: "bad", EXPIRED: "warn", AWAITING: "warn", OTHER: "neutral" } as const;
const STATUS_TEXT = { PAID: "Paid", FAILED: "Failed", EXPIRED: "Expired", AWAITING: "Awaiting bank", OTHER: "Other" } as const;

/**
 * The GST electronic ledgers, in the order a CA works: credit first, then cash, then the challans behind the cash, then the ITC the return claimed
 * against what the portal showed. Each part is a table with a side window that puts the two sides of the proof next to each other.
 * Drop whatever reports you have; each sheet is recognised by what it holds. Nothing is posted, filed or changed.
 */
export default function GstLedgerLoops({ preload, defaultView }: { preload?: Partial<Record<LedgerFileKind, string[][]>>; defaultView?: View } = {}) {
  const [rows, setRows] = useState<Partial<Record<LedgerFileKind, string[][]>>>(preload ?? {});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>(defaultView ?? "credit");
  const input = useRef<HTMLInputElement>(null);

  const take = async (files: FileList | File[]) => {
    setBusy(true);
    const XLSX = await import("xlsx");
    for (const f of Array.from(files)) {
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
        const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }) }));
        const found = detectLedgerFile(sheets);
        if (!found.length) { toast.error(`${f.name}: not one of the GST ledger reports, the Trial Balance or the Day Book.`); continue; }
        setRows((cur) => { const next = { ...cur }; for (const d of found) next[d.kind] = sheets.find((s) => s.name === d.sheet)!.rows; return next; });
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setBusy(false);
  };

  const m = useMemo(() => {
    const itc = rows.itc_report ? readItcReport(rows.itc_report) : null;
    const util = rows.itc_util ? readItcUtil(rows.itc_util) : null;
    const ch = rows.challans ? readChallans(rows.challans) : null;
    const filings = rows.filing_status ? readFilingStatus(rows.filing_status) : [];
    const tb = rows.trial_balance ? readTrialBalance(rows.trial_balance) : null;
    const vouchers = rows.day_book ? readDayBookVouchers(rows.day_book) : null;
    const credLiab = rows.credit_liability ? readCreditLiability(rows.credit_liability) : [];
    const credit = util && tb ? creditLedgerLoop(util, inputCreditLedgers(tb.ledgers).map((l) => ({ name: l.name, head: l.head, opening: l.opening, closing: l.closing }))) : null;
    const cash = ch && rows.gstr3b_annual && util ? cashLedgerLoop(ch.challans, filings, util.months.map((x) => readGstr3bPayment(rows.gstr3b_annual!, x.month))) : null;
    const books = ch && vouchers ? matchChallansToBooks(ch.challans, vouchers) : null;
    return { itc, itcProof: itc ? proveItcReport(itc) : null, util, ch, filings, credit, cash, books, credLiab, flags: ch ? challanFlags(ch.challans, filings) : [], missing: util && filings.length ? missingReturns(filings, util.months.map((x) => x.month)) : [] };
  }, [rows]);

  const have = Object.keys(rows) as LedgerFileKind[];
  const creditBad = m.credit ? !m.credit.ok : false;
  const cashBad = m.cash ? m.cash.lowestBalance < -0.5 : false;
  const unpaid = m.ch ? m.ch.challans.filter((c) => c.status !== "PAID").length : 0;
  const itcExcess = m.itcProof ? HEADS.filter((h) => Math.abs(m.itcProof!.excess[h]) >= 1).length : 0;

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="gst-ledger-loops">
      <Kit />
      <StatStrip items={[
        { label: "Credit ledger", value: m.credit ? (m.credit.ok ? "Closes" : "Does not close") : "Needs files", tone: m.credit ? (m.credit.ok ? "good" : "bad") : undefined },
        { label: "Cash ledger", value: m.cash ? (cashBad ? "Goes negative" : m.cash.untested.length ? `${m.cash.steps.length} of ${m.cash.steps.length + m.cash.untested.length} tested` : "Closes") : "Needs files", tone: m.cash ? (cashBad ? "bad" : undefined) : undefined },
        { label: "Challans not paid", value: m.ch ? unpaid : "–", tone: unpaid ? "bad" : undefined },
        { label: "ITC heads off", value: m.itcProof ? itcExcess : "–", tone: itcExcess ? "bad" : undefined },
      ]} />

      <Card style={{ padding: 0 }}>
        <div
          onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }}
          style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 18px", cursor: "pointer", flexWrap: "wrap" }}
        >
          <input ref={input} type="file" multiple accept=".xlsx,.xls" hidden onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} />
          <span style={{ width: 34, height: 34, borderRadius: 11, background: V.cream, color: V.maroon, display: "grid", placeItems: "center" }}><Upload size={16} /></span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{busy ? "Reading…" : "Drop the portal reports, Trial Balance, Day Book and GSTR-3B annual"}</div>
            <div style={{ fontSize: 12.5, color: V.muted }}>Each sheet is recognised by what it holds. Nothing is filed or changed.</div>
          </div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>{have.map((k) => <Badge key={k} tone="info">{LABEL[k]}</Badge>)}</span>
        </div>
      </Card>

      <Flags items={[...m.flags, ...m.missing]} />

      <Tabs value={view} onChange={(v) => setView(v as View)} items={[
        { value: "credit", label: "1  Credit ledger", count: creditBad ? 1 : undefined },
        { value: "cash", label: "2  Cash ledger", count: cashBad ? 1 : undefined },
        { value: "challans", label: "Challans", count: unpaid || undefined },
        { value: "itc", label: "ITC vs GSTR-2B", count: itcExcess || undefined },
      ]} />

      {view === "credit" && <CreditView credit={m.credit} util={m.util} />}
      {view === "cash" && <CashView cash={m.cash} />}
      {view === "challans" && <ChallanView challans={m.ch?.challans ?? null} books={m.books} />}
      {view === "itc" && <ItcView itc={m.itc} proof={m.itcProof} credLiab={m.credLiab} />}
    </div>
  );
}

function Flags({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <div style={{ display: "grid", gap: 6, padding: "12px 16px", borderRadius: 16, background: V.warnBg, color: V.warnFg }} data-testid="gst-flags">
      {shown.map((f, i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}><AlertTriangle size={15} style={{ marginTop: 2, flex: "none" }} /><span>{f}</span></div>)}
      {items.length > 3 && <button onClick={() => setAll((x) => !x)} style={{ justifySelf: "start", border: 0, background: "transparent", font: "inherit", fontSize: 12.5, fontWeight: 650, color: V.maroon, cursor: "pointer", padding: "2px 0 0 23px" }}>{all ? "Show fewer" : `Show ${items.length - 3} more`}</button>}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <Card style={{ padding: 28, textAlign: "center", color: V.muted, fontSize: 13.5 }}>{text}</Card>;

function CreditView({ credit, util }: { credit: ReturnType<typeof creditLedgerLoop> | null; util: ReturnType<typeof readItcUtil> | null }) {
  const [head, setHead] = useState<keyof Heads | null>(null);
  if (!credit || !util) return <Empty text="Add the ITC claimed and utilised report and the Trial Balance to prove the credit ledger: opening + claimed − utilised against the input ledgers in Tally." />;
  const sel = head;
  const ledgers = sel ? credit.ledgers.filter((l) => l.head === sel) : [];
  return (
    <>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {HEADS.map((h) => {
          const d = credit.difference[h], ok = Math.abs(d) <= 1;
          return (
            <BalanceCard
              key={h} mark={h.slice(0, 1).toUpperCase() + "G"} title={`${h.toUpperCase()} credit`} sub={`Opening ${inr(credit.opening[h])} + claimed − utilised`}
              left={{ label: "Should be (portal reports)", value: inr(credit.derivedClosing[h]) }} right={{ label: "Tally closing", value: inr(credit.tallyClosing[h]) }}
              pill={<StatusPill tone={ok ? "good" : "bad"}>{ok ? "Agrees" : inr(d)}</StatusPill>} selected={head === h} onClick={() => setHead(h)}
            />
          );
        })}
      </div>
      <MonthTable util={util} />
      {credit.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: 0 }}>{n}</p>)}
      <SidePanel open={!!sel} onClose={() => setHead(null)} title={sel ? `${sel.toUpperCase()} credit` : ""}>
        {sel && (
          <>
            <Compare
              left={{ title: "Portal reports", lines: [["Opening (Tally)", inr(credit.opening[sel])], ["Claimed 4(C)", inr(credit.claimed[sel])], ["Utilised 6.1", inr(credit.utilised[sel])], ["Should close at", inr(credit.derivedClosing[sel])]] }}
              right={{ title: "Tally input ledgers", lines: [["Ledgers counted", ledgers.length], ["Tally closing", inr(credit.tallyClosing[sel])]] }}
              diff={{ label: Math.abs(credit.difference[sel]) <= 1 ? "Tally agrees" : "Tally holds more than the loop gives", value: Math.abs(credit.difference[sel]) <= 1 ? "✓" : inr(credit.difference[sel]), ok: Math.abs(credit.difference[sel]) <= 1 }}
            />
            <div className="kt-fs">
              <h4>Tally ledgers counted as {sel.toUpperCase()} input credit</h4>
              <div>{ledgers.map((l) => <div className="kt-line" key={l.name}><span>{l.name}</span><b>{inr(l.closing)}</b></div>)}</div>
            </div>
            <p style={{ fontSize: 12.5, color: V.body, margin: 0 }}>If a ledger here is a carry-forward or a transfer, not a credit taken from the portal, the CA should say so and it will be left out.</p>
          </>
        )}
      </SidePanel>
    </>
  );
}

function MonthTable({ util }: { util: NonNullable<ReturnType<typeof readItcUtil>> }) {
  const [q, setQ] = useState("");
  const rows = util.months.filter((x) => !q || x.month.includes(q));
  const tot = (h: Heads) => h.igst + h.cgst + h.sgst + h.cess;
  return (
    <div className="kt-card">
      <TableToolbar search={q} onSearch={setQ} placeholder="Search month, e.g. 2025-04"><span style={{ fontSize: 12.5, color: V.muted }}>Table 4(C) against table 6.1, by month</span></TableToolbar>
      <div className="v2-scroll">
        <table className="kt-table">
          <thead><tr><th>Month</th><th className="r">Claimed</th><th className="r">Utilised</th><th className="r">Net</th></tr></thead>
          <tbody>
            {rows.map((x) => <tr key={x.month} style={{ cursor: "default" }}><td style={{ fontWeight: 600 }}>{x.month}</td><td className="r">{inr(tot(x.claimed))}</td><td className="r">{inr(tot(x.utilised))}</td><td className="r">{inr(tot(x.claimed) - tot(x.utilised))}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: V.muted, padding: 24 }}>No month matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashView({ cash }: { cash: ReturnType<typeof cashLedgerLoop> | null }) {
  const [open, setOpen] = useState<CashStep | null>(null);
  if (!cash) return <Empty text="Add the challan report with return filing status, the GSTR-3B annual report and the ITC report to run the cash ledger: deposits less what each return used." />;
  const prev = open ? cash.steps[cash.steps.indexOf(open) - 1]?.filedOn ?? "" : "";
  const inWindow = open ? cash.paidChallans.filter((c) => c.created > prev && c.created <= open.filedOn) : [];
  return (
    <>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <BalanceCard mark="₹" title="Cash ledger" sub={`${cash.steps.length} return${cash.steps.length === 1 ? "" : "s"} tested${cash.untested.length ? `, ${cash.untested.length} not tested` : ""}`}
          left={{ label: "Paid in (PAID challans)", value: inr(cash.deposited) }} right={{ label: "Used in returns", value: inr(cash.used) }}
          pill={<StatusPill tone={cash.lowestBalance < -0.5 ? "bad" : "good"}>{inr(cash.derivedBalance)} left</StatusPill>} />
        {cash.unpaidTotal > 0 && <BalanceCard mark="!" title="Challans that did not pay" sub="Failed, expired or awaiting the bank" left={{ label: "Not in the ledger", value: inr(cash.unpaidTotal) }} right={{ label: "Counted as deposits", value: "₹0" }} pill={<StatusPill tone="warn">Check</StatusPill>} />}
      </div>
      <div className="kt-card">
        <div className="kt-bar"><strong style={{ fontSize: 15 }}>Running balance, return by return</strong><StatusPill tone={cash.lowestBalance < -0.5 ? "bad" : cash.untested.length ? "warn" : "good"}>{cash.lowestBalance < -0.5 ? "Goes negative" : cash.untested.length ? "Partly tested" : "Closes"}</StatusPill></div>
        <div className="v2-scroll">
          <table className="kt-table">
            <thead><tr><th>Return</th><th>Filed</th><th className="r">Paid in since last return</th><th className="r">Cash used (6.1 + RCM)</th><th className="r">Balance after</th></tr></thead>
            <tbody>
              {cash.steps.map((s) => (
                <tr key={s.month} aria-selected={open?.month === s.month} onClick={() => setOpen(s)}>
                  <td style={{ fontWeight: 650 }}>{s.month}</td><td>{s.filedOn}</td><td className="r">{inr(s.deposited)}</td><td className="r">{inr(s.cashUsed + s.rcmUsed)}</td>
                  <td className="r" style={{ fontWeight: 650, color: s.balanceAfter < -0.5 ? V.maroon : undefined }}>{inr(s.balanceAfter)}</td>
                </tr>
              ))}
              {cash.untested.map((mo) => <tr key={mo} style={{ cursor: "default" }}><td style={{ fontWeight: 650 }}>{mo}</td><td colSpan={3} style={{ color: V.muted }}>Filed after the last challan in the report</td><td className="r"><StatusPill tone="warn">Not tested</StatusPill></td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="kt-foot"><span>Click a return to see the challans paid in for it.</span></div>
      </div>
      {cash.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: 0 }}>{n}</p>)}
      <SidePanel open={!!open} onClose={() => setOpen(null)} title={open ? `Return for ${open.month}` : ""}>
        {open && (
          <>
            <Compare
              left={{ title: "Deposits", lines: [["Challans paid in", inWindow.length], ["Total deposited", inr(open.deposited)]] }}
              right={{ title: "Return (table 6.1)", lines: [["Cash paid", inr(open.cashUsed)], ["RCM paid in cash", inr(open.rcmUsed)], ["Filed on", open.filedOn]] }}
              diff={{ label: "Balance after this return", value: inr(open.balanceAfter), ok: open.balanceAfter >= -0.5 }}
            />
            <div className="kt-fs"><h4>Challans paid in</h4><div>{inWindow.length ? inWindow.map((c) => <div className="kt-line" key={c.cpin}><span>{c.created} · {c.cpin}</span><b>{inr(c.total)}</b></div>) : <span style={{ fontSize: 13, color: V.muted }}>No challan was paid in before this return.</span>}</div></div>
          </>
        )}
      </SidePanel>
    </>
  );
}

function ChallanView({ challans, books }: { challans: Challan[] | null; books: ReturnType<typeof matchChallansToBooks> | null }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Challan["status"]>("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Challan | null>(null);
  const all = challans ?? [];
  const rows = useMemo(() => all.filter((c) => (status === "all" || c.status === status) && (!q || c.cpin.includes(q) || c.created.includes(q))), [all, q, status]);
  const { sorted, sort, toggle } = useSort(rows, { created: (c: Challan) => c.created, total: (c) => c.total, status: (c) => c.status });
  if (!challans) return <Empty text="Add the challan deposit summary to see each challan against the payments in the books." />;
  const size = 10, cur = Math.min(page, Math.max(1, Math.ceil(sorted.length / size)));
  const view = sorted.slice((cur - 1) * size, cur * size);
  const hit = open && books?.matched.find((x) => x.challan.cpin === open.cpin);
  return (
    <>
      <div className="kt-card">
        <TableToolbar search={q} onSearch={(v) => { setQ(v); setPage(1); }} placeholder="Search CPIN or date…">
          <QuickFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: "All challans" }, { value: "PAID", label: "Paid" }, { value: "FAILED", label: "Failed" }, { value: "EXPIRED", label: "Expired" }, { value: "AWAITING", label: "Awaiting bank" }]} />
        </TableToolbar>
        <div className="v2-scroll">
          <table className="kt-table">
            <thead><tr><SortTh label="Created" k="created" sort={sort} toggle={toggle} /><th>CPIN</th><SortTh label="Amount" k="total" sort={sort} toggle={toggle} align="right" /><SortTh label="Status" k="status" sort={sort} toggle={toggle} /><th>In the books</th></tr></thead>
            <tbody>
              {view.map((c) => {
                const found = books?.matched.some((x) => x.challan.cpin === c.cpin);
                return (
                  <tr key={c.cpin} aria-selected={open?.cpin === c.cpin} onClick={() => setOpen(c)}>
                    <td>{c.created}</td><td style={{ fontFamily: V.mono, fontSize: 12.5 }}>{c.cpin}</td><td className="r">{inr(c.total)}</td>
                    <td><StatusPill tone={STATUS_TONE[c.status]}>{STATUS_TEXT[c.status]}</StatusPill></td>
                    <td>{c.status !== "PAID" ? <span style={{ color: V.muted }}>Not paid, not expected</span> : !books ? <span style={{ color: V.muted }}>Add the Day Book</span> : found ? <StatusPill tone="good">Payment found</StatusPill> : <StatusPill tone="bad">No payment</StatusPill>}</td>
                  </tr>
                );
              })}
              {view.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: V.muted, padding: 26 }}>No challans match.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={cur} pageSize={size} total={sorted.length} onPage={setPage} />
      </div>
      {books && books.booksNotPaid.length > 0 && <p style={{ fontSize: 12.5, color: V.maroon, margin: 0 }}>Payments in the books with no PAID challan: {books.booksNotPaid.map((b) => `voucher ${b.no} on ${b.date} (${inr(b.amount)})`).join("; ")}.</p>}
      {books && books.afterReport > 0 && <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>{books.afterReport} further payment{books.afterReport === 1 ? "" : "s"} in the books fall after the last challan in the report and could not be tested.</p>}
      <SidePanel open={!!open} onClose={() => setOpen(null)} title={open ? `Challan ${open.cpin}` : ""}>
        {open && (
          <>
            <Compare
              left={{ title: "GST portal", lines: [["Created", open.created], ["Deposited", open.deposited ?? "Not deposited"], ["IGST", inr(open.amount.igst)], ["CGST", inr(open.amount.cgst)], ["SGST", inr(open.amount.sgst)], ["Total", inr(open.total)]] }}
              right={{ title: "Books", lines: hit ? [["Payment voucher", hit.voucher.no], ["Date", hit.voucher.date], ["Amount", inr(hit.voucher.amount)], ["Ledger", books?.ledgers[0] ?? ""]] : [["Payment voucher", open.status === "PAID" ? "None found" : "Not expected"]] }}
              diff={{ label: open.status !== "PAID" ? `Challan ${STATUS_TEXT[open.status].toLowerCase()}: nothing reaches the cash ledger` : hit ? "Matched by date and amount" : "Paid on the portal, no payment in the books", value: open.status !== "PAID" ? "–" : hit ? "✓" : "!", ok: open.status !== "PAID" || !!hit }}
            />
          </>
        )}
      </SidePanel>
    </>
  );
}

function ItcView({ itc, proof, credLiab }: { itc: ReturnType<typeof readItcReport> | null; proof: ReturnType<typeof proveItcReport> | null; credLiab: ReturnType<typeof readCreditLiability> }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!itc || !proof) return <Empty text="Add the GSTR-3B vs GSTR-2B ITC report to see the credit claimed against what the portal showed." />;
  const sel = itc.months.find((x) => x.month === open);
  const cl = credLiab.find((x) => x.month === open);
  const tot = (h: Heads) => h.igst + h.cgst + h.sgst;
  return (
    <>
      <StatStrip items={HEADS.map((h) => ({ label: `${h.toUpperCase()} for the year`, value: Math.abs(proof.excess[h]) < 1 ? "Agrees" : `${proof.excess[h] > 0 ? "+" : ""}${inr(proof.excess[h])}`, tone: Math.abs(proof.excess[h]) < 1 ? "good" : "bad" }))} />
      <div className="kt-card">
        <div className="kt-bar">
          <strong style={{ fontSize: 15 }}>Credit claimed in 3B against GSTR-2B</strong>
          {proof.checks.map((c) => <StatusPill key={c.id} tone={c.ok ? "good" : "bad"}>{c.ok ? "✓" : "✕"} {c.label.split(":")[0]}</StatusPill>)}
        </div>
        <div className="v2-scroll">
          <table className="kt-table">
            <thead><tr><th>Month</th><th className="r">Claimed in 3B</th><th className="r">In GSTR-2B</th><th className="r">Excess (+) / shortfall (−)</th></tr></thead>
            <tbody>
              {itc.months.map((x) => {
                const d = tot(x.diff);
                return (
                  <tr key={x.month} aria-selected={open === x.month} onClick={() => setOpen(x.month)}>
                    <td style={{ fontWeight: 650 }}>{x.month}</td><td className="r">{inr(tot(x.claimed))}</td><td className="r">{inr(tot(x.twoB))}</td>
                    <td className="r" style={{ fontWeight: 650, color: Math.abs(d) < 1 ? V.green : V.maroon }}>{Math.abs(d) < 1 ? "Agrees" : `${d > 0 ? "+" : ""}${inr(d)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="kt-foot"><span>These are the report's own figures: the 2A/2B data behind them is not in the files, so they are not recomputed here. Click a month for the heads.</span></div>
      </div>
      <SidePanel open={!!sel} onClose={() => setOpen(null)} title={sel ? `ITC for ${sel.month}` : ""}>
        {sel && (
          <>
            <Compare
              left={{ title: "Claimed in GSTR-3B", lines: HEADS.map((h): [string, string] => [h.toUpperCase(), inr(sel.claimed[h])]) }}
              right={{ title: "In GSTR-2B", lines: HEADS.map((h): [string, string] => [h.toUpperCase(), inr(sel.twoB[h])]) }}
              diff={{ label: "Excess (+) or shortfall (−)", value: HEADS.map((h) => `${h.toUpperCase()} ${inr(sel.diff[h])}`).join("  "), ok: HEADS.every((h) => Math.abs(sel.diff[h]) < 1) }}
            />
            {cl && <Compare left={{ title: "Liability per GSTR-1", lines: [["Tax", inr(cl.liabilityGstr1)]] }} right={{ title: "Liability per GSTR-3B", lines: [["Tax", inr(cl.liabilityGstr3b)]] }} diff={{ label: "Difference", value: inr(cl.liabilityGstr3b - cl.liabilityGstr1), ok: Math.abs(cl.liabilityGstr3b - cl.liabilityGstr1) < 1 }} />}
          </>
        )}
      </SidePanel>
    </>
  );
}

