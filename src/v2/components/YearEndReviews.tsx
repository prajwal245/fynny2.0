import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Badge, Card, V } from "../ui";
import { read26asPdf, savePracticePartyMaster } from "@/lib/practice/practice.functions";
import { detectLedgerFile } from "@/lib/practice/gst/ledgers";
import { readTrialBalance, readLedgerMasters, type MasterRow, type TrialBalance } from "@/lib/practice/review/trialBalance";
import { readDayBookVouchers, type Voucher } from "@/lib/practice/review/dayBook";
import AgeingTable from "./AgeingTable";
import TdsTable from "./TdsTable";
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

      {ageing && <div style={{ marginTop: 14 }}><AgeingTable report={ageing} side={side} onSide={setSide} days={days} onDays={setDays} /></div>}

      {as26 && tds && tb && vouchers && <div style={{ marginTop: 14 }}><TdsTable as26={as26.as26} checks={as26.checks} cmp={tds.cmp} matches={tds.match.matches} unassigned={tds.match.unassigned} books={tds.books} /></div>}
      {as26 && !(tb && vouchers) && <p style={{ fontSize: 12.5, color: V.muted, margin: "12px 0 0" }}>26AS read: {as26.as26.deductors.length} deductors. Add the Trial Balance and the Day Book to compare with the books.</p>}

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
