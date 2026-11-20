import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Badge, Card, Segmented, V } from "../ui";
import { runPracticeReviewChecks } from "@/lib/practice/practice.functions";
import type { ReviewChecks as Result } from "@/lib/practice/reviewChecks.server";
import { workbookBytes, type SheetSpec } from "@/lib/practice/review/workpaper";
import { adjustmentSheet, ADJ_FLAG_LABEL, cashSheet, ledgerMapSheet } from "@/lib/practice/review/workpapers";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const FLAG = ADJ_FLAG_LABEL;

const save = (name: string, bytes: Uint8Array) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

type Tab = "cash" | "adj" | "map";

/** Review checks on the client's prepared books. Read-only: nothing is posted or changed, and each table downloads as an Excel working paper. */
export default function ReviewChecks({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("cash");
  const [opening, setOpening] = useState("");

  const run = async () => {
    setBusy(true);
    try {
      const n = opening.trim() === "" ? null : Number(opening.replace(/,/g, ""));
      if (n !== null && !Number.isFinite(n)) { toast.error("Opening cash must be a number."); return; }
      setR(await runPracticeReviewChecks({ data: { business_id: clientId, opening_cash: n } }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not run the checks."); } finally { setBusy(false); }
  };

  const header = (what: string): [string, string | number][] => [["Client", clientName], ["Working paper", what], ["Period", r?.from && r.to ? `${r.from} to ${r.to}` : ""], ["Source", `Tally Day Book, ${r?.vouchers ?? 0} vouchers`], ["Prepared by", "FynHelp (read-only copy of what was found)"], ["Status", "Draft: for the CA's review"]];

  const download = () => {
    if (!r) return;
    const sheet: SheetSpec = tab === "cash" ? cashSheet(r.cash, header("Day-wise cash balance")) : tab === "adj" ? adjustmentSheet(r.adjustments, header("Entries that look like adjustments")) : ledgerMapSheet(r.ledgerMap, header("Suggested ledger map (to be confirmed once per client)"));
    save(`${clientName.replace(/[^\w]+/g, "_")}_${sheet.name.replace(/\s+/g, "_")}.xlsx`, workbookBytes([sheet]));
  };

  const fam = r ? r.ledgerMap.reduce<Record<string, number>>((m, x) => ((m[x.family] = (m[x.family] ?? 0) + 1), m), {}) : {};

  return (
    <Card data-testid="review-checks" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>Review checks on the books</strong>
        <Badge tone="neutral">Read-only</Badge>
      </div>
      <p style={{ margin: "6px 0 10px", fontSize: 13, color: V.body }}>Runs on the Tally Day Book already uploaded for this client: cash day by day, entries that look like adjustments, and a suggested ledger map. Nothing is posted or changed.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="v2-label" htmlFor="rv-open" style={{ margin: 0 }}>Opening cash (₹)</label>
        <input id="rv-open" className="v2-input" style={{ maxWidth: 160 }} inputMode="decimal" placeholder="optional" value={opening} onChange={(e) => setOpening(e.target.value)} />
        <button className="v2-btn v2-btn-primary" disabled={busy} data-busy={busy || undefined} onClick={() => void run()}>{busy ? "Running…" : r ? "Run again" : "Run the checks"}</button>
      </div>
      {r && (
        <div style={{ marginTop: 14 }}>
          {r.notes.map((n) => <p key={n} style={{ color: V.maroon, fontSize: 13 }}>{n}</p>)}
          {r.files > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 10px" }}>{r.vouchers.toLocaleString("en-IN")} vouchers from {r.files} Day Book{r.files === 1 ? "" : "s"}, {r.from} to {r.to}.</p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <Segmented<Tab> label="Check" value={tab} onChange={setTab} options={[{ value: "cash", label: "Cash by day", count: r.cash.negativeDays }, { value: "adj", label: "Adjustment entries", count: r.adjustmentsTotal }, { value: "map", label: "Ledger map", count: r.ledgerMap.length }]} />
                <button className="v2-btn v2-btn-ghost" onClick={download}><Download size={14} /> Working paper (Excel)</button>
              </div>

              {tab === "cash" && (
                <div>
                  <p style={{ fontSize: 13, color: V.body, margin: "0 0 8px" }}>
                    {r.cash.days.length} days with cash entries in {r.cash.ledgers.join(", ") || "no cash ledger"}. <b>{r.cash.negativeDays}</b> day{r.cash.negativeDays === 1 ? "" : "s"} end negative{r.cash.lowest ? `, lowest ${inr(r.cash.lowest.closing)} on ${r.cash.lowest.date}` : ""}. {r.cash.paymentsOverLimit.length} party-day{r.cash.paymentsOverLimit.length === 1 ? "" : "s"} of cash payments above the 40A(3) limit; {r.cash.receiptsOverLimit.length} of cash receipts at 269ST.
                  </p>
                  {r.cash.notes.map((n) => <p key={n} style={{ fontSize: 12.5, color: V.muted, margin: "0 0 6px" }}>{n}</p>)}
                  <div className="v2-scroll" style={{ maxHeight: 320 }}>
                    <table className="v2-table"><thead><tr><th>Date</th><th style={{ textAlign: "right" }}>Opening</th><th style={{ textAlign: "right" }}>Receipts</th><th style={{ textAlign: "right" }}>Payments</th><th style={{ textAlign: "right" }}>Closing</th></tr></thead>
                      <tbody>{r.cash.days.map((d) => <tr key={d.date}><td>{d.date}</td><td className="num" style={{ textAlign: "right" }}>{inr(d.opening)}</td><td className="num" style={{ textAlign: "right" }}>{inr(d.receipts)}</td><td className="num" style={{ textAlign: "right" }}>{inr(d.payments)}</td><td className="num" style={{ textAlign: "right", fontWeight: 600, color: d.flag === "negative" ? V.maroon : undefined }}>{inr(d.closing)}</td></tr>)}</tbody></table>
                  </div>
                  {r.cash.paymentsOverLimit.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13 }}><b>Cash payments over the limit (one party, one day):</b> {r.cash.paymentsOverLimit.slice(0, 8).map((b) => `${b.date} ${b.party} ${inr(b.amount)}`).join("; ")}{r.cash.paymentsOverLimit.length > 8 ? ` and ${r.cash.paymentsOverLimit.length - 8} more (in the working paper)` : ""}</div>
                  )}
                </div>
              )}

              {tab === "adj" && (
                <div>
                  <p style={{ fontSize: 13, color: V.body, margin: "0 0 8px" }}>{r.adjustmentsTotal} journal or contra entr{r.adjustmentsTotal === 1 ? "y" : "ies"} look like adjustments{r.adjustmentsTotal > r.adjustments.length ? ` (the largest ${r.adjustments.length} are shown and exported)` : ""}. A flag is a reason to look, not a finding.</p>
                  <div className="v2-scroll" style={{ maxHeight: 360 }}>
                    <table className="v2-table"><thead><tr><th>Date</th><th>Voucher</th><th style={{ textAlign: "right" }}>Amount</th><th>Why listed</th><th>Narration</th></tr></thead>
                      <tbody>{r.adjustments.slice(0, 150).map((a) => <tr key={`${a.date}-${a.no}-${a.row}`}><td>{a.date}</td><td>{a.type} {a.no}</td><td className="num" style={{ textAlign: "right" }}>{inr(a.amount)}</td><td>{a.routine ? <Badge tone="neutral">{a.routine}</Badge> : null} {a.flags.map((f) => <Badge key={f} tone="warn">{FLAG[f]}</Badge>)}</td><td style={{ maxWidth: 320 }}>{a.narration}</td></tr>)}</tbody></table>
                  </div>
                </div>
              )}

              {tab === "map" && (
                <div>
                  <p style={{ fontSize: 13, color: V.body, margin: "0 0 8px" }}>{r.ledgerMap.length} ledgers read from the vouchers. {Object.entries(fam).filter(([k]) => k !== "party_or_other").map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}; {fam["party_or_other"] ?? 0} parties or others. This is a suggestion; nothing reads a ledger through it until a person confirms it.</p>
                  {r.duplicates.length > 0 && <p style={{ fontSize: 13, margin: "0 0 8px" }}><b>Possible duplicate ledgers:</b> {r.duplicates.slice(0, 6).map(([a, b]) => `${a} / ${b}`).join("; ")}{r.duplicates.length > 6 ? ` and ${r.duplicates.length - 6} more` : ""}. Their groups can differ and change gross profit.</p>}
                  <div className="v2-scroll" style={{ maxHeight: 320 }}>
                    <table className="v2-table"><thead><tr><th>Ledger</th><th>Suggested family</th><th>GST head</th><th>Rate</th><th>Year in name</th></tr></thead>
                      <tbody>{r.ledgerMap.filter((m) => m.family !== "party_or_other").slice(0, 200).map((m) => <tr key={m.ledger}><td>{m.ledger}</td><td>{m.family.replace(/_/g, " ")}</td><td>{m.gstHead ?? ""}</td><td>{m.rate ?? ""}</td><td>{m.year ?? ""}</td></tr>)}</tbody></table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
