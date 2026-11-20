import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Badge, Card, V } from "../ui";
import { read26asPdf, savePracticePartyMaster } from "@/lib/practice/practice.functions";
import { detectLedgerFile } from "@/lib/practice/gst/ledgers";
import { readTrialBalance, readLedgerMasters, type MasterRow, type TrialBalance } from "@/lib/practice/review/trialBalance";
import { readDayBookVouchers, type Voucher } from "@/lib/practice/review/dayBook";
import { ageingReport } from "@/lib/practice/review/ageingReport";
import { buildPartyMaster } from "@/lib/practice/review/partyMaster";
import { booksTds, compareTds, matchDeductors, type As26, type As26Check } from "@/lib/practice/tax/tds";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const lastDay = (fy: string) => `${Number(fy.slice(0, 4)) + 1}-03-31`;

/**
 * Three year-end reviews from the same three files (Tally Trial Balance with masters, the Day Book, and Form 26AS): ageing of debtors and
 * creditors, TDS in the books against 26AS, and the party master filled from Tally's masters. Read-only; saving the party master writes only
 * GSTIN, PAN and aliases, never credit days, Udyam or related-party flags (those are for the CA).
 */
export default function YearEndReviews({ clientId }: { clientId: string }) {
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[] | null>(null);
  const [as26, setAs26] = useState<{ as26: As26; checks: As26Check[] } | null>(null);
  const [side, setSide] = useState<"debtor" | "creditor">("debtor");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (files: FileList | File[]) => {
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        if (/\.pdf$/i.test(f.name)) {
          const r = await read26asPdf({ data: { base64: await toBase64(f) } });
          if (!r.ok) { toast.error(`${f.name}: ${r.reason}`); continue; }
          setAs26({ as26: r.as26 as As26, checks: r.checks as As26Check[] });
          continue;
        }
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
        const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }) }));
        const found = detectLedgerFile(sheets);
        const rowsOf = (kind: string) => sheets.find((s) => s.name === found.find((d) => d.kind === kind)?.sheet)?.rows;
        const t = rowsOf("trial_balance"), m = rowsOf("ledger_masters"), d = rowsOf("day_book");
        if (!t && !d) { toast.error(`${f.name}: use the Tally Trial Balance Excel, the Day Book Excel, or the 26AS PDF.`); continue; }
        if (t) { const read = readTrialBalance(t); if (read.ledgers.length) setTb(read); }
        if (m) setMasters(readLedgerMasters(m));
        if (d) setVouchers(readDayBookVouchers(d));
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setBusy(false);
  };

  const fy = as26?.as26.fy ?? "2025-26";
  const asAt = lastDay(fy);
  const ageing = useMemo(() => tb && vouchers ? ageingReport(vouchers, tb, masters, { side, asAt, fyStart: `${fy.slice(0, 4)}-04-01`, creditDays: days ? Number(days) : undefined, tbDate: asAt }) : null, [tb, vouchers, masters, side, days, asAt, fy]);
  const tds = useMemo(() => {
    if (!as26 || !vouchers || !tb) return null;
    const led = tb.ledgers.filter((l) => /tds receivable|tcs receivable/i.test(l.group) || /tds.*receivable|receivable.*tds/i.test(l.name)).map((l) => l.name);
    const books = booksTds(vouchers, led, { start: `${fy.slice(0, 4)}-04-01`, end: asAt });
    return { books, cmp: compareTds(as26.as26, books), match: matchDeductors(as26.as26, books) };
  }, [as26, vouchers, tb, fy, asAt]);
  const party = useMemo(() => (masters.length ? buildPartyMaster(masters) : null), [masters]);

  const savePartyMaster = async () => {
    if (!party) return;
    setSaving(true);
    try {
      const r = await savePracticePartyMaster({ data: { business_id: clientId, parties: party.parties.map((p) => ({ party: p.party, aliases: p.aliases, gstin: p.gstin, pan: p.pan })) } });
      toast.success(`${r.saved} parties saved to the party master.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the party master.");
    } finally {
      setSaving(false);
    }
  };
  const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
      {ok ? <CheckCircle2 size={15} color={V.green} style={{ marginTop: 2 }} /> : <AlertTriangle size={15} color={V.maroon} style={{ marginTop: 2 }} />}
      <span>{children}</span>
    </div>
  );

  return (
    <Card data-testid="year-end-reviews" style={{ marginBottom: 16 }}>
      <strong style={{ fontSize: 15 }}>Year-end reviews: ageing, TDS against 26AS, party master</strong>
      <p style={{ margin: "6px 0 10px", fontSize: 13, color: V.body }}>Drop the Tally Trial Balance Excel (with the ledger masters sheet), the Day Book Excel and the Form 26AS PDF. Nothing is posted or changed.</p>
      <div onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }} style={{ border: `1px dashed ${V.line}`, borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
        <input ref={input} type="file" multiple accept=".xlsx,.xls,.pdf" hidden onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} />
        <Upload size={18} color={V.muted} />
        <span style={{ fontSize: 13 }}>{busy ? "Reading…" : "Drop the files here or click to choose"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tb && <Badge tone="info">Trial Balance: {tb.ledgers.length}</Badge>}
          {masters.length > 0 && <Badge tone="info">Masters: {masters.length}</Badge>}
          {vouchers && <Badge tone="info">Day Book: {vouchers.length} vouchers</Badge>}
          {as26 && <Badge tone="info">26AS {as26.as26.fy}</Badge>}
        </span>
      </div>

      {ageing && (
        <div style={{ marginTop: 14 }} data-testid="ageing">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>Ageing at {asAt}</strong>
            <select className="v2-input" style={{ maxWidth: 160 }} value={side} onChange={(e) => setSide(e.target.value as "debtor" | "creditor")} aria-label="Debtors or creditors"><option value="debtor">Debtors</option><option value="creditor">Creditors</option></select>
            <label style={{ fontSize: 13 }}>Credit days (optional) <input className="v2-input" style={{ width: 70 }} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></label>
            <Badge tone={ageing.untied.length ? "bad" : "good"}>{ageing.untied.length ? `${ageing.untied.length} do not tie to the Trial Balance` : "All tie to the Trial Balance"}</Badge>
          </div>
          <p style={{ fontSize: 12.5, color: V.body, margin: "0 0 6px" }}>{ageing.dueBasis}</p>
          <div className="v2-scroll" style={{ maxHeight: 360 }}>
            <table className="v2-table">
              <thead><tr><th>Party</th><th style={{ textAlign: "right" }}>Closing</th><th style={{ textAlign: "right" }}>0–30</th><th style={{ textAlign: "right" }}>31–60</th><th style={{ textAlign: "right" }}>61–90</th><th style={{ textAlign: "right" }}>Over 90</th><th style={{ textAlign: "right" }}>On account</th><th>Basis</th></tr></thead>
              <tbody>
                {ageing.rows.slice(0, 200).map((r) => (
                  <tr key={r.party}>
                    <td>{r.party}{!r.tied && <> <Badge tone="bad">does not tie</Badge></>}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(r.closing)}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(r.buckets.current)}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(r.buckets.d31_60)}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(r.buckets.d61_90)}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(r.buckets.d90plus)}</td>
                    <td style={{ textAlign: "right" }} className="num">{inr(r.onAccount)}</td>
                    <td>{r.billWise ? "FIFO (bill-wise in Tally)" : "FIFO"}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td>Total</td><td style={{ textAlign: "right" }} className="num">{inr(ageing.totals.closing)}</td><td style={{ textAlign: "right" }} className="num">{inr(ageing.totals.current)}</td><td style={{ textAlign: "right" }} className="num">{inr(ageing.totals.d31_60)}</td><td style={{ textAlign: "right" }} className="num">{inr(ageing.totals.d61_90)}</td><td style={{ textAlign: "right" }} className="num">{inr(ageing.totals.d90plus)}</td><td style={{ textAlign: "right" }} className="num">{inr(ageing.totals.onAccount)}</td><td /></tr>
              </tbody>
            </table>
          </div>
          {ageing.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: "4px 0 0" }}>{n}</p>)}
        </div>
      )}

      {as26 && (
        <div style={{ marginTop: 14, display: "grid", gap: 6 }} data-testid="tds-check">
          <strong style={{ fontSize: 14 }}>TDS deducted from the client, books against 26AS</strong>
          {as26.checks.map((c) => <Row key={c.id} ok={c.ok}><b>{c.label}.</b> <span style={{ color: V.muted }}>{c.detail}</span></Row>)}
          {tds && (
            <>
              <div className="v2-scroll">
                <table className="v2-table">
                  <thead><tr><th>Section</th><th style={{ textAlign: "right" }}>26AS tax</th><th style={{ textAlign: "right" }}>Books (TDS receivable debits)</th><th style={{ textAlign: "right" }}>Difference</th></tr></thead>
                  <tbody>
                    {tds.cmp.rows.map((r) => (
                      <tr key={r.section}>
                        <td>{r.section}</td><td style={{ textAlign: "right" }} className="num">{inr(r.as26)}</td><td style={{ textAlign: "right" }} className="num">{inr(r.books)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: r.status === "agree" ? V.green : V.maroon }} className="num">{r.status === "agree" ? "Agrees" : r.status === "books_higher" ? `Books higher by ${inr(r.diff)}` : `Books lower by ${inr(-r.diff)}`}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700 }}><td>Total</td><td style={{ textAlign: "right" }} className="num">{inr(tds.cmp.as26Total)}</td><td style={{ textAlign: "right" }} className="num">{inr(tds.cmp.booksTotal)}</td><td /></tr>
                  </tbody>
                </table>
              </div>
              <strong style={{ fontSize: 13, marginTop: 4 }}>By deductor (parties matched by name; check the match)</strong>
              <div className="v2-scroll">
                <table className="v2-table">
                  <thead><tr><th>Deductor (TAN)</th><th style={{ textAlign: "right" }}>26AS tax</th><th>Books parties</th><th style={{ textAlign: "right" }}>Books</th><th style={{ textAlign: "right" }}>Difference</th></tr></thead>
                  <tbody>
                    {tds.match.matches.map((m) => (
                      <tr key={m.deductor.tan}>
                        <td>{m.deductor.name} ({m.deductor.tan})</td><td style={{ textAlign: "right" }} className="num">{inr(m.deductor.tax)}</td>
                        <td style={{ fontSize: 12 }}>{m.parties.join("; ") || "No party matched"}</td><td style={{ textAlign: "right" }} className="num">{inr(m.books)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: Math.abs(m.diff) <= 1 ? V.green : V.maroon }} className="num">{Math.abs(m.diff) <= 1 ? "Agrees" : inr(m.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tds.match.unassigned.length > 0 && <p style={{ fontSize: 12.5, color: V.body, margin: 0 }}>TDS taken in the books from parties that match no deductor in 26AS: {tds.match.unassigned.map((u) => `${u.party} ${inr(u.amount)}`).join("; ")}.</p>}
              {tds.books.clearedInYear.length > 0 && <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>Credits to the TDS-receivable ledgers in the year (opening balances cleared or adjusted): {tds.books.clearedInYear.map((c) => `${c.ledger} ${inr(c.credit)}`).join("; ")}.</p>}
              {tds.cmp.notes.map((n, i) => <p key={i} style={{ fontSize: 12, color: V.muted, margin: 0 }}>{n}</p>)}
            </>
          )}
          {!tb || !vouchers ? <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>Add the Trial Balance and the Day Book to compare with the books.</p> : null}
        </div>
      )}

      {party && (
        <div style={{ marginTop: 14, display: "grid", gap: 6 }} data-testid="party-master">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14 }}>Party master from Tally's masters</strong>
            <Badge tone="info">{party.parties.length} parties · {party.withGstin} with GSTIN · {party.withPan} with PAN · {party.billWise} bill-wise</Badge>
            <button className="v2-btn" disabled={saving} onClick={() => void savePartyMaster()} data-testid="party-save">{saving ? "Saving…" : "Save to this client's party master"}</button>
          </div>
          <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>Saves GSTIN, PAN and aliases only. Credit days, Udyam status and related parties are not in Tally: the CA fills them.</p>
          {party.issues.length > 0 && (
            <details style={{ fontSize: 13 }}>
              <summary style={{ cursor: "pointer" }}>{party.issues.length} thing{party.issues.length === 1 ? "" : "s"} to look at</summary>
              <ul style={{ margin: "6px 0 0 18px", color: V.body }}>{party.issues.slice(0, 100).map((i, k) => <li key={k}><b>{i.party}</b>: {i.detail}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
