import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Badge, Card, V } from "../ui";
import {
  detectLedgerFile, readItcReport, proveItcReport, readItcUtil, readChallans, readFilingStatus, readCreditLiability, creditLedgerLoop, inputCreditLedgers,
  cashLedgerLoop, matchChallansToBooks, challanFlags, missingReturns, readGstr3bPayment, type LedgerFileKind, type Heads,
} from "@/lib/practice/gst/ledgers";
import { readTrialBalance } from "@/lib/practice/review/trialBalance";
import { readDayBookVouchers } from "@/lib/practice/review/dayBook";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const LABEL: Record<LedgerFileKind, string> = {
  itc_report: "ITC: 3B vs 2B", itc_util: "ITC claimed and utilised", challans: "Challans", filing_status: "Return filing status", credit_liability: "Credit and liability statement",
  trial_balance: "Trial Balance", ledger_masters: "Ledger masters", day_book: "Day Book", gstr3b_annual: "GSTR-3B annual",
};
const HEADS: (keyof Heads)[] = ["igst", "cgst", "sgst"];

/**
 * The GST electronic ledgers, proved from the portal reports. Drop whatever you have; each sheet is recognised by its content.
 * First the credit ledger (opening + claimed − utilised against the input ledgers in Tally), then the cash ledger (challans against what each
 * return used and what the books paid). Nothing is posted, filed or changed.
 */
export default function GstLedgerLoops() {
  const [rows, setRows] = useState<Partial<Record<LedgerFileKind, string[][]>>>({});
  const [busy, setBusy] = useState(false);
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
    const cash = ch && rows.gstr3b_annual && util
      ? cashLedgerLoop(ch.challans, filings, util.months.map((x) => readGstr3bPayment(rows.gstr3b_annual!, x.month)))
      : null;
    const books = ch && vouchers ? matchChallansToBooks(ch.challans, vouchers) : null;
    return { itc, itcProof: itc ? proveItcReport(itc) : null, util, ch, filings, credit, cash, books, credLiab, flags: ch ? challanFlags(ch.challans, filings) : [], missing: util && filings.length ? missingReturns(filings, util.months.map((x) => x.month)) : [] };
  }, [rows]);

  const have = Object.keys(rows) as LedgerFileKind[];
  const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
      {ok ? <CheckCircle2 size={15} color={V.green} style={{ marginTop: 2 }} /> : <AlertTriangle size={15} color={V.maroon} style={{ marginTop: 2 }} />}
      <span>{children}</span>
    </div>
  );

  return (
    <Card data-testid="gst-ledger-loops" style={{ marginBottom: 16 }}>
      <strong style={{ fontSize: 15 }}>GST credit and cash ledgers</strong>
      <p style={{ margin: "6px 0 10px", fontSize: 13, color: V.body }}>
        Drop the portal reports (ITC 3B vs 2B, ITC claimed and utilised, challans with return filing status, credit and liability statement), the GSTR-3B annual report, the Tally Trial Balance and the Day Book. Each sheet is recognised by what it holds. Nothing is filed or changed.
      </p>
      <div
        onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }}
        style={{ border: `1px dashed ${V.line}`, borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}
      >
        <input ref={input} type="file" multiple accept=".xlsx,.xls" hidden onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} />
        <Upload size={18} color={V.muted} />
        <span style={{ fontSize: 13 }}>{busy ? "Reading…" : "Drop the files here or click to choose"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>{have.map((k) => <Badge key={k} tone="info">{LABEL[k]}</Badge>)}</span>
      </div>

      {(m.flags.length > 0 || m.missing.length > 0) && (
        <div style={{ marginTop: 12, display: "grid", gap: 6 }} data-testid="gst-flags">
          {[...m.flags, ...m.missing].map((f, i) => <Row key={i} ok={false}>{f}</Row>)}
        </div>
      )}

      {m.credit && (
        <div style={{ marginTop: 14 }} data-testid="credit-loop">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>1. Credit ledger</strong>
            <Badge tone={m.credit.ok ? "good" : "bad"}>{m.credit.ok ? "Closes" : "Does not close"}</Badge>
          </div>
          <div className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>Head</th><th style={{ textAlign: "right" }}>Opening (Tally)</th><th style={{ textAlign: "right" }}>+ Claimed 4(C)</th><th style={{ textAlign: "right" }}>− Utilised 6.1</th><th style={{ textAlign: "right" }}>= Should be</th><th style={{ textAlign: "right" }}>Tally closing</th><th style={{ textAlign: "right" }}>Difference</th></tr></thead>
              <tbody>
                {HEADS.map((h) => (
                  <tr key={h}>
                    <td>{h.toUpperCase()}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(m.credit!.opening[h])}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(m.credit!.claimed[h])}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(m.credit!.utilised[h])}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(m.credit!.derivedClosing[h])}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(m.credit!.tallyClosing[h])}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: Math.abs(m.credit!.difference[h]) <= 1 ? V.green : V.maroon }} className="num">{Math.abs(m.credit!.difference[h]) <= 1 ? "Agrees" : inr(m.credit!.difference[h])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details style={{ marginTop: 6, fontSize: 12.5, color: V.body }}>
            <summary style={{ cursor: "pointer" }}>Tally ledgers counted as input credit ({m.credit.ledgers.length})</summary>
            <ul style={{ margin: "6px 0 0 18px" }}>{m.credit.ledgers.map((l) => <li key={l.name}>{l.name} ({l.head.toUpperCase()}): {inr(l.closing)}</li>)}</ul>
          </details>
          {m.credit.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: "4px 0 0" }}>{n}</p>)}
        </div>
      )}

      {m.itc && m.itcProof && (
        <div style={{ marginTop: 14 }} data-testid="itc-report">
          <strong style={{ fontSize: 14 }}>ITC claimed against GSTR-2B (as the report shows it)</strong>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {m.itcProof.checks.map((c) => <Row key={c.id} ok={c.ok}><b>{c.label}.</b> <span style={{ color: V.muted }}>{c.detail}</span></Row>)}
            <Row ok={HEADS.every((h) => Math.abs(m.itcProof!.excess[h]) < 1)}>
              Year: {HEADS.map((h) => `${h.toUpperCase()} ${m.itcProof!.excess[h] > 0 ? "excess +" : m.itcProof!.excess[h] < 0 ? "shortfall " : ""}${inr(m.itcProof!.excess[h])}`).join(", ")}. <span style={{ color: V.muted }}>An excess is credit taken that 2B does not show; a shortfall is credit available but not taken. These are the report's own figures: the 2A/2B data behind them is not in these files, so they are not recomputed here.</span>
            </Row>
          </div>
        </div>
      )}

      {m.cash && (
        <div style={{ marginTop: 14 }} data-testid="cash-loop">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>2. Cash ledger</strong>
            <Badge tone={m.cash.ok ? "good" : m.cash.lowestBalance < -0.5 ? "bad" : "neutral"}>{m.cash.lowestBalance < -0.5 ? "Goes negative" : m.cash.untested.length ? "Partly tested" : "Closes"}</Badge>
          </div>
          <div className="v2-scroll">
            <table className="v2-table">
              <thead><tr><th>Return</th><th>Filed</th><th style={{ textAlign: "right" }}>Paid in since last return</th><th style={{ textAlign: "right" }}>Cash used (6.1 + RCM)</th><th style={{ textAlign: "right" }}>Balance after</th></tr></thead>
              <tbody>
                {m.cash.steps.map((s) => (
                  <tr key={s.month}>
                    <td>{s.month}</td><td>{s.filedOn}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(s.deposited)}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(s.cashUsed + s.rcmUsed)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: s.balanceAfter < -0.5 ? V.maroon : V.body }} className="num">{inr(s.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.cash.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: "4px 0 0" }}>{n}</p>)}
        </div>
      )}

      {m.books && (
        <div style={{ marginTop: 14, display: "grid", gap: 6 }} data-testid="challan-books">
          <strong style={{ fontSize: 14 }}>Challans against the books</strong>
          <Row ok={m.books.paidNotInBooks.length === 0}>{m.books.matched.length} paid challan{m.books.matched.length === 1 ? "" : "s"} found as payments in “{m.books.ledgers[0] ?? "the tax ledger"}”{m.books.paidNotInBooks.length > 0 && <>; <b>{m.books.paidNotInBooks.length} paid on the portal with no payment in the books</b>: {m.books.paidNotInBooks.map((c) => `${c.cpin} (${inr(c.total)} on ${c.created})`).join("; ")}</>}.</Row>
          {m.books.booksNotPaid.length > 0 && <Row ok={false}>Payments in the books with no PAID challan: {m.books.booksNotPaid.map((b) => `voucher ${b.no} on ${b.date} (${inr(b.amount)})`).join("; ")}.</Row>}
          {m.books.afterReport > 0 && <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>{m.books.afterReport} further payment{m.books.afterReport === 1 ? "" : "s"} in the books fall after the last challan in the report and could not be tested.</p>}
        </div>
      )}

      {m.credLiab.length > 0 && (
        <p style={{ fontSize: 12.5, color: V.body, margin: "12px 0 0" }}>
          Credit and liability statement: liability in GSTR-1 and GSTR-3B differs in {m.credLiab.filter((c) => Math.abs(c.liabilityGstr1 - c.liabilityGstr3b) > 0.5).length} of {m.credLiab.length} months; ITC claimed is above the portal's 2A in {m.credLiab.filter((c) => c.itcClaimed - c.itc2a > 0.5).length}.
        </p>
      )}
    </Card>
  );
}
