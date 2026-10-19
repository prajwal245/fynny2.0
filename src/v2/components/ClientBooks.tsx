/**
 * Client workspace → Books. The financial statements from the client's Tally
 * books: Schedule III P&L, Balance Sheet, Trial Balance, receivables and
 * payables, and a month-by-month trend. The Books agent reads the snapshot
 * first and lists what a careful reviewer would stop on. Every line opens to
 * the Tally ledgers behind it.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, ChevronRight, Download, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { getClientBooks } from "@/lib/practice/practice.functions";
import type { Finding, Line, Section } from "@/lib/practice/tally/statements";
import { Badge, Card, EmptyState, Stat, Tabs, V, formatDate, formatINR } from "../ui";
import { AgentGlyph, FadeIn, RowSkeleton } from "../agents";
import { useV2 } from "../store";

type Books = Awaited<ReturnType<typeof getClientBooks>>;
type Linked = Extract<Books, { linked: true }>;
type Snapshot = NonNullable<Linked["snapshot"]>;

const STYLES = `
.bk-line { display:grid; grid-template-columns: 18px minmax(0,1fr) auto; gap:8px; align-items:center; width:100%; padding:10px 6px; border:0; background:transparent; text-align:left; cursor:pointer; border-radius:10px; font:inherit; color:inherit; transition: background .15s ease; }
.bk-line:hover { background:${V.gray}; }
.bk-line svg { transition: transform .25s cubic-bezier(.16,1,.3,1); color:${V.muted}; }
.bk-line[aria-expanded="true"] svg { transform: rotate(90deg); }
.bk-line[data-static="true"] { cursor:default; }
.bk-line[data-static="true"]:hover { background:transparent; }
.bk-ledgers { margin:0 0 6px 26px; padding-left:12px; border-left:2px solid ${V.line}; animation: bk-in .25s cubic-bezier(.16,1,.3,1) both; }
.bk-ledger { display:flex; justify-content:space-between; gap:12px; padding:5px 6px; font-size:13px; color:${V.body}; }
.bk-sec { font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:${V.muted}; font-weight:650; padding:14px 6px 4px; }
.bk-total { display:flex; justify-content:space-between; gap:12px; padding:10px 6px; font-weight:650; border-top:1px solid ${V.line}; }
.bk-grand { display:flex; justify-content:space-between; gap:12px; padding:12px 14px; margin-top:8px; font-weight:700; border-radius:12px; background:${V.cream}; }
.bk-find { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; padding:12px 14px; border-radius:14px; background:${V.gray}; animation: bk-in .35s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i, 0) * 50ms); }
.bk-chip { display:inline-block; border-radius:999px; padding:2px 9px; font-size:11.5px; background:#fff; border:1px solid ${V.line}; color:${V.body}; margin:4px 6px 0 0; }
.bk-two { display:grid; gap:18px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); align-items:start; }
.bk-bar { transition: height .5s cubic-bezier(.16,1,.3,1), y .5s cubic-bezier(.16,1,.3,1); }
@keyframes bk-in { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }
.bk-printhead { display:none; }
.bk-seg { display:inline-flex; background:${V.gray}; border-radius:12px; padding:3px; gap:2px; margin-bottom:12px; }
.bk-seg button { border:0; background:transparent; padding:6px 14px; border-radius:10px; font:inherit; font-size:13px; color:${V.body}; cursor:pointer; }
.bk-seg button[aria-pressed="true"] { background:#fff; color:${V.ink}; font-weight:650; box-shadow:0 1px 3px rgba(42,15,12,.12); }
.bk-printsec { break-inside:avoid-page; margin-top:22px; }
.bk-printsec h2 { font-size:17px; margin:0 0 8px; }
@media print { .bk-noprint { display:none !important; } .bk-printhead { display:block; margin-bottom:16px; border-bottom:2px solid ${V.ink}; padding-bottom:10px; } }
@media (prefers-reduced-motion: reduce) { .bk-ledgers, .bk-find, .bk-bar, .bk-line svg { animation:none !important; transition:none !important; } }
`;

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const SEVERITY: Record<Finding["severity"], { tone: "bad" | "warn" | "info"; label: string }> = {
  high: { tone: "bad", label: "Needs action" },
  medium: { tone: "warn", label: "Check" },
  info: { tone: "info", label: "Note" },
};

/** One statement line; opens to the Tally ledgers behind it. */
function LineRow({ line }: { line: Line }) {
  const [open, setOpen] = useState(false);
  const expandable = line.ledgers.length > 0;
  return (
    <div>
      <button className="bk-line" aria-expanded={open} data-static={!expandable} onClick={() => expandable && setOpen((o) => !o)}>
        {expandable ? <ChevronRight size={14} /> : <span />}
        <span style={{ fontSize: 14 }}>{line.label}</span>
        <span className="num" style={{ fontSize: 14 }}>{formatINR(line.amount)}</span>
      </button>
      {open && (
        <div className="bk-ledgers">
          {line.ledgers.map((l) => (
            <div className="bk-ledger" key={l.name}><span>{l.name}</span><span className="num">{formatINR(l.amount)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function Block({ title, lines, total, totalLabel }: { title?: string; lines: Line[]; total?: number; totalLabel?: string }) {
  return (
    <div>
      {title && <div className="bk-sec">{title}</div>}
      {lines.length === 0 && <div style={{ fontSize: 13, color: V.muted, padding: "6px" }}>Nothing posted.</div>}
      {lines.map((l) => <LineRow key={l.label} line={l} />)}
      {typeof total === "number" && <div className="bk-total"><span>{totalLabel ?? `Total ${title ?? ""}`}</span><span className="num">{formatINR(total)}</span></div>}
    </div>
  );
}

function SheetSide({ title, sections, total }: { title: string; sections: Section[]; total: number }) {
  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 2 }}>{title}</div>
      {sections.map((s) => <Block key={s.title} title={s.title} lines={s.lines} total={s.total} />)}
      <div className="bk-grand"><span>Total</span><span className="num">{formatINR(total)}</span></div>
    </Card>
  );
}

function ProfitLoss({ pl }: { pl: Snapshot["pl"] }) {
  return (
    <Card>
      <Block title="Revenue from operations" lines={pl.revenue} total={pl.revenueTotal} />
      <Block title="Cost of sales and direct expenses" lines={pl.directCosts} total={pl.directCostsTotal} />
      <div className="bk-grand"><span>Gross profit{pl.grossMarginPct !== null && <span style={{ fontWeight: 500, color: V.body }}> · {pl.grossMarginPct}%</span>}</span><span className="num">{formatINR(pl.grossProfit)}</span></div>
      <Block title="Other income" lines={pl.otherIncome} total={pl.otherIncomeTotal} />
      <Block title="Indirect expenses" lines={pl.indirectExpenses} total={pl.indirectExpensesTotal} />
      <div className="bk-grand" style={{ background: pl.netProfit >= 0 ? "rgba(47,107,79,.12)" : "rgba(180,36,36,.1)", color: pl.netProfit >= 0 ? V.green : V.maroon }}>
        <span>{pl.netProfit >= 0 ? "Net profit" : "Net loss"}{pl.netMarginPct !== null && <span style={{ fontWeight: 500 }}> · {pl.netMarginPct}% of revenue</span>}</span>
        <span className="num">{formatINR(pl.netProfit)}</span>
      </div>
    </Card>
  );
}

function TrialBalanceTable({ tb }: { tb: Snapshot["trialBalance"] }) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof tb.rows>();
    for (const r of tb.rows) m.set(r.primary, [...(m.get(r.primary) ?? []), r]);
    return [...m.entries()];
  }, [tb]);
  return (
    <Card style={{ padding: 0 }} className="v2-scroll">
      <table className="v2-table">
        <thead><tr><th>Ledger</th><th>Group</th><th style={{ textAlign: "right" }}>Debit</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
        <tbody>
          {groups.map(([primary, rows]) => (
            <Fragment key={primary}>
              <tr><td colSpan={4} style={{ background: V.gray, fontSize: 12, fontWeight: 650, letterSpacing: ".06em", textTransform: "uppercase", color: V.body }}>{primary}</td></tr>
              {rows.map((r) => (
                <tr key={`${primary}-${r.ledger}`}>
                  <td>{r.ledger}</td><td style={{ color: V.body }}>{r.group}</td>
                  <td className="num" style={{ textAlign: "right" }}>{r.debit ? formatINR(r.debit) : ""}</td>
                  <td className="num" style={{ textAlign: "right" }}>{r.credit ? formatINR(r.credit) : ""}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr><td colSpan={2} style={{ fontWeight: 700 }}>Total {tb.balanced ? <Badge tone="good">Tallies</Badge> : <Badge tone="bad">Out by {formatINR(Math.abs(tb.difference))}</Badge>}</td>
            <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(tb.totalDebit)}</td>
            <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(tb.totalCredit)}</td></tr>
        </tbody>
      </table>
    </Card>
  );
}

function PartyList({ title, rows, hint }: { title: string; rows: { name: string; amount: number }[]; hint: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>{title}</div>
        <div className="num" style={{ fontWeight: 650 }}>{formatINR(total)}</div>
      </div>
      <div style={{ fontSize: 12.5, color: V.muted, marginBottom: 6 }}>{hint}</div>
      {rows.length === 0 && <div style={{ fontSize: 13, color: V.muted, padding: 6 }}>None outstanding.</div>}
      {rows.slice(0, 15).map((r) => {
        const share = total ? (r.amount / total) * 100 : 0;
        return (
          <div key={r.name} style={{ padding: "7px 6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}><span>{r.name}</span><span className="num">{formatINR(r.amount)}</span></div>
            <div style={{ height: 4, borderRadius: 4, background: V.gray, marginTop: 5 }}><div style={{ width: `${share}%`, height: "100%", borderRadius: 4, background: V.coral, opacity: 0.75 }} /></div>
          </div>
        );
      })}
      {rows.length > 15 && <div style={{ fontSize: 12.5, color: V.muted, padding: 6 }}>and {rows.length - 15} more in the Excel export.</div>}
    </Card>
  );
}

/** Revenue against costs by month, with net profit written under each. */
function Trend({ monthly }: { monthly: Snapshot["monthly"] }) {
  if (monthly.length < 2) {
    return <EmptyState title="The trend needs a few months" description="Month-by-month figures appear once the agent has sent more than one month end. A first sync backfills the whole year, so this fills in by itself." />;
  }
  const W = 720, H = 240, pad = { l: 8, r: 8, t: 14, b: 54 };
  const max = Math.max(1, ...monthly.flatMap((m) => [m.revenue + m.otherIncome, m.expenses]));
  const bw = (W - pad.l - pad.r) / monthly.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, v) / max);
  const label = (m: string) => new Date(`${m}-01`).toLocaleDateString("en-IN", { month: "short" });
  return (
    <Card>
      <div style={{ display: "flex", gap: 16, fontSize: 12.5, color: V.body, marginBottom: 6 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: V.green, marginRight: 6 }} />Income</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: V.coral, marginRight: 6 }} />Expenses</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly income and expenses" style={{ width: "100%", height: "auto" }}>
        {monthly.map((m, i) => {
          const x0 = pad.l + i * bw;
          const inc = m.revenue + m.otherIncome;
          return (
            <g key={m.month}>
              <rect className="bk-bar" x={x0 + bw * 0.14} width={bw * 0.34} y={y(inc)} height={H - pad.b - y(inc)} rx={4} fill={V.green} opacity={0.85}><title>{`${label(m.month)} income ${formatINR(inc)}`}</title></rect>
              <rect className="bk-bar" x={x0 + bw * 0.52} width={bw * 0.34} y={y(m.expenses)} height={H - pad.b - y(m.expenses)} rx={4} fill={V.coral} opacity={0.85}><title>{`${label(m.month)} expenses ${formatINR(m.expenses)}`}</title></rect>
              <text x={x0 + bw / 2} y={H - pad.b + 18} textAnchor="middle" fontSize={12} fill={V.body}>{label(m.month)}</text>
              <text x={x0 + bw / 2} y={H - pad.b + 36} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={m.netProfit >= 0 ? V.green : V.maroon}>{m.netProfit >= 0 ? "+" : "−"}{formatINR(Math.abs(m.netProfit)).replace("₹", "₹ ")}</text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke={V.line} />
      </svg>
      <div style={{ fontSize: 12, color: V.muted }}>Figures under each month are net profit for that month alone.</div>
    </Card>
  );
}

function BooksAgent({ findings }: { findings: Finding[] }) {
  const high = findings.filter((f) => f.severity === "high").length;
  return (
    <Card data-testid="books-agent">
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: findings.length ? 12 : 0 }}>
        <AgentGlyph agent="narrate" state="succeeded" size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>Books agent</div>
          <div style={{ fontSize: 13, color: V.body }}>
            {findings.length === 0 ? "Read every ledger. Nothing stands out; the books tally and the usual traps are clear." : `Read every ledger and found ${findings.length} thing${findings.length === 1 ? "" : "s"} to look at${high ? `, ${high} before sign-off` : ""}.`}
          </div>
        </div>
        {findings.length === 0 && <ShieldCheck size={22} color={V.green} style={{ marginLeft: "auto" }} />}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {findings.map((f, i) => (
          <div className="bk-find" key={f.id} style={{ ["--i" as string]: i }}>
            <AlertTriangle size={18} color={f.severity === "high" ? V.maroon : f.severity === "medium" ? V.warnFg : V.muted} style={{ marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 650 }}>{f.title}</span>
                <Badge tone={SEVERITY[f.severity].tone}>{SEVERITY[f.severity].label}</Badge>
              </div>
              <div style={{ fontSize: 13, color: V.body, marginTop: 3, lineHeight: 1.5 }}>{f.detail}</div>
              {f.ledgers.length > 0 && <div>{f.ledgers.map((l) => <span className="bk-chip" key={l}>{l}</span>)}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

async function downloadExcel(client: string, company: string, s: Snapshot) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const lines = (title: string, ls: Line[], total?: number): (string | number)[][] => [[title], ...ls.map((l) => [l.label, l.amount]), ...(total === undefined ? [] : [["Total", total]]), []];
  const pl: (string | number)[][] = [
    [`${client} · Profit and Loss`], [`${company} · 1 Apr ${s.fyStart.slice(0, 4)} to ${formatDate(s.asOn)}`], [],
    ...lines("Revenue from operations", s.pl.revenue, s.pl.revenueTotal),
    ...lines("Cost of sales and direct expenses", s.pl.directCosts, s.pl.directCostsTotal),
    ["Gross profit", s.pl.grossProfit], [],
    ...lines("Other income", s.pl.otherIncome, s.pl.otherIncomeTotal),
    ...lines("Indirect expenses", s.pl.indirectExpenses, s.pl.indirectExpensesTotal),
    [s.pl.netProfit >= 0 ? "Net profit" : "Net loss", s.pl.netProfit],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pl), "Profit and Loss");
  const side = (t: string, secs: Section[], total: number) => [[t], ...secs.flatMap((x) => lines(x.title, x.lines, x.total)), ["Total", total], []];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`${client} · Balance Sheet as on ${formatDate(s.asOn)}`], [], ...side("Equity and liabilities", s.balanceSheet.liabilities, s.balanceSheet.totalLiabilities), ...side("Assets", s.balanceSheet.assets, s.balanceSheet.totalAssets)]), "Balance Sheet");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Ledger", "Group", "Primary group", "Debit", "Credit"], ...s.trialBalance.rows.map((r) => [r.ledger, r.group, r.primary, r.debit, r.credit]), ["Total", "", "", s.trialBalance.totalDebit, s.trialBalance.totalCredit]]), "Trial Balance");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Debtor", "Outstanding"], ...s.parties.debtors.map((p) => [p.name, p.amount])]), "Debtors");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Creditor", "Outstanding"], ...s.parties.creditors.map((p) => [p.name, p.amount])]), "Creditors");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Month", "Revenue", "Other income", "Expenses", "Net profit"], ...s.monthly.map((m) => [m.month, m.revenue, m.otherIncome, m.expenses, m.netProfit])]), "Monthly");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Severity", "Finding", "Detail", "Ledgers"], ...s.findings.map((f) => [f.severity, f.title, f.detail, f.ledgers.join("; ")])]), "Books agent");
  XLSX.writeFile(wb, `${client.replace(/[^\w]+/g, "_")}_Financials_${s.asOn}.xlsx`);
}

function SignOffLine() {
  return (
    <div className="bk-printhead" style={{ marginTop: 36, borderBottom: 0, paddingBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, fontSize: 13, color: V.body }}>
        <div style={{ flex: 1, borderTop: `1px solid ${V.ink}`, paddingTop: 6 }}>Prepared by</div>
        <div style={{ flex: 1, borderTop: `1px solid ${V.ink}`, paddingTop: 6 }}>Reviewed and signed off by (partner), with membership no. and date</div>
      </div>
    </div>
  );
}

export default function ClientBooks({ clientId, clientName, onOpenSettings }: { clientId: string; clientName: string; onOpenSettings?: () => void }) {
  const [data, setData] = useState<Books | null>(null);
  const [asOn, setAsOn] = useState<string | undefined>();
  const [tab, setTab] = useState("pl");
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"ytd" | "month">("ytd");
  const [printAll, setPrintAll] = useState(false);
  const { firm } = useV2();

  const load = useCallback(async (on?: string) => {
    setLoading(true);
    try {
      setData(await getClientBooks({ data: { businessId: clientId, asOn: on } }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);
  useEffect(() => { void load(asOn); }, [load, asOn]);

  if (!data) return <RowSkeleton rows={4} height={72} />;

  if (!data.linked) {
    return (
      <EmptyState
        icon={<BookOpen size={22} />}
        title="Connect this client's Tally"
        description="Link a Tally company to this client and the agent keeps their Trial Balance, P&L and Balance Sheet current, then reads the books for you. Read-only; nothing is changed in Tally."
        action={onOpenSettings ? <button className="v2-btn v2-btn-primary" onClick={onOpenSettings}>Set up Tally</button> : undefined}
      />
    );
  }
  const s = data.snapshot;
  if (!s) {
    return (
      <EmptyState
        icon={<RefreshCw size={22} />}
        title={`Waiting for ${data.company.name}`}
        description="The company is linked. The first numbers arrive when the agent next reads Tally on the client's PC, usually within a few hours. It needs Tally open on that PC."
      />
    );
  }

  const shown = period === "month" && s.plPeriod ? s.plPeriod.pl : s.pl;
  const printPack = () => {
    setPrintAll(true);
    // let the full pack render before the print dialog opens
    setTimeout(() => { window.print(); setPrintAll(false); }, 200);
  };
  const cash = s.balanceSheet.assets.flatMap((x) => x.lines).find((l) => l.label === "Cash and bank balances")?.amount ?? 0;
  const recv = s.parties.debtors.reduce((a, d) => a + d.amount, 0);
  const pay = s.parties.creditors.reduce((a, d) => a + d.amount, 0);

  return (
    <FadeIn>
      <style>{STYLES}</style>
      <div className="bk-printhead">
        <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: V.body }}>{firm?.name ?? "FynHelp"}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{clientName}</div>
        <div style={{ fontSize: 13, color: V.body }}>Financial statements for the year from {formatDate(s.fyStart)} to {formatDate(s.asOn)} · Tally company: {data.company.name}</div>
        <div style={{ fontSize: 12, color: V.muted, marginTop: 4 }}>Draft until signed off by the partner. Prepared from the client's Tally books with FynHelp.</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, color: V.muted }}>Tally company</div>
          <div style={{ fontSize: 16, fontWeight: 650 }}>{data.company.name}</div>
          <div style={{ fontSize: 12.5, color: V.muted }}>{s.ledgerCount} ledgers · synced {data.company.lastSyncedAt ? formatDate(data.company.lastSyncedAt) : "just now"}</div>
        </div>
        <div className="bk-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12.5, color: V.body, display: "flex", alignItems: "center", gap: 8 }}>
            As on
            <select className="v2-input" style={{ width: "auto" }} value={s.asOn} disabled={loading} onChange={(e) => setAsOn(e.target.value)} aria-label="Books as on">
              {data.available.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
            </select>
          </label>
          <button className="v2-btn v2-btn-ghost" onClick={() => void downloadExcel(clientName, data.company.name, s).catch((e) => toast.error(errMsg(e)))}><Download size={14} /> Excel</button>
          <button className="v2-btn v2-btn-ghost" onClick={printPack}><Printer size={14} /> Print pack</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 14 }}>
        <Stat label="Revenue" value={formatINR(s.pl.revenueTotal)} hint={`Year to ${formatDate(s.asOn)}`} />
        <Stat label="Net profit" value={formatINR(s.pl.netProfit)} tone={s.pl.netProfit >= 0 ? "good" : "bad"} hint={s.pl.netMarginPct === null ? undefined : `${s.pl.netMarginPct}% of revenue`} />
        <Stat label="Cash and bank" value={formatINR(cash)} tone={cash < 0 ? "bad" : "neutral"} />
        <Stat label="Receivables" value={formatINR(recv)} hint={`${s.parties.debtors.length} debtors`} />
        <Stat label="Payables" value={formatINR(pay)} hint={`${s.parties.creditors.length} creditors`} />
      </div>

      <div style={{ marginBottom: 16 }}><BooksAgent findings={s.findings} /></div>

      <div className="bk-noprint">
        <Tabs value={tab} onChange={setTab} items={[
          { value: "pl", label: "Profit and Loss" },
          { value: "bs", label: "Balance Sheet" },
          { value: "tb", label: "Trial Balance", count: s.trialBalance.rows.length },
          { value: "parties", label: "Debtors and Creditors" },
          { value: "trend", label: "Monthly trend" },
        ]} />
      </div>
      <div className={printAll ? "bk-noprint" : undefined} style={{ opacity: loading ? 0.5 : 1, transition: "opacity .2s" }}>
        {tab === "pl" && (
          <>
            {s.plPeriod && (
              <div className="bk-seg bk-noprint" role="group" aria-label="Period">
                <button aria-pressed={period === "ytd"} onClick={() => setPeriod("ytd")}>Year to date</button>
                <button aria-pressed={period === "month"} onClick={() => setPeriod("month")}>Since {formatDate(s.plPeriod.from)}</button>
              </div>
            )}
            <ProfitLoss pl={shown} />
          </>
        )}
        {tab === "bs" && (
          <>
            {!s.balanceSheet.balanced && <div style={{ marginBottom: 10 }}><Badge tone="warn">Off by {formatINR(Math.abs(s.balanceSheet.difference))}: see the Books agent</Badge></div>}
            <div className="bk-two">
              <SheetSide title="Equity and liabilities" sections={s.balanceSheet.liabilities} total={s.balanceSheet.totalLiabilities} />
              <SheetSide title="Assets" sections={s.balanceSheet.assets} total={s.balanceSheet.totalAssets} />
            </div>
          </>
        )}
        {tab === "tb" && <TrialBalanceTable tb={s.trialBalance} />}
        {tab === "parties" && (
          <div className="bk-two">
            <PartyList title="Debtors" rows={s.parties.debtors} hint="Customers who owe the client, largest first." />
            <PartyList title="Creditors" rows={s.parties.creditors} hint="Suppliers the client owes, largest first." />
          </div>
        )}
        {tab === "trend" && <Trend monthly={s.monthly} />}
      </div>

      {printAll && (
        <div aria-hidden>
          <div className="bk-printsec"><h2>Profit and Loss</h2><ProfitLoss pl={s.pl} /></div>
          <div className="bk-printsec"><h2>Balance Sheet</h2>
            <div className="bk-two"><SheetSide title="Equity and liabilities" sections={s.balanceSheet.liabilities} total={s.balanceSheet.totalLiabilities} /><SheetSide title="Assets" sections={s.balanceSheet.assets} total={s.balanceSheet.totalAssets} /></div>
          </div>
          <div className="bk-printsec"><h2>Trial Balance</h2><TrialBalanceTable tb={s.trialBalance} /></div>
          <div className="bk-printsec"><h2>Debtors and Creditors</h2>
            <div className="bk-two"><PartyList title="Debtors" rows={s.parties.debtors} hint="Largest first." /><PartyList title="Creditors" rows={s.parties.creditors} hint="Largest first." /></div>
          </div>
        </div>
      )}
      <SignOffLine />
    </FadeIn>
  );
}
