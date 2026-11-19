import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Upload, X, AlertTriangle, FileQuestion } from "lucide-react";
import { Badge, Card, V } from "../ui";
import { useV2 } from "../store";
import { getTallyGstBooks } from "@/lib/practice/practice.functions";
import { readGstFile, readGstr3bFile } from "@/lib/practice/gst/files";
import { gstr3bFor, toGstr1Read, type Gstr3bAnnual } from "@/lib/practice/gst/portalExcel";
import type { ReadInvoices } from "@/lib/practice/gst/invoices";
import { checkReturns, readGstr1Json, readGstr3bJson, type Check, type Gstr1Read, type Gstr3bRead } from "@/lib/practice/gst/returns";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Slot<T> = { name: string; data: T; note: string } | null;

function FileSlot({ title, hint, accept, slot, onFile, onClear }: { title: string; hint: string; accept: string; slot: Slot<unknown>; onFile: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Card style={{ borderStyle: slot ? "solid" : "dashed", minHeight: 104, display: "grid", gap: 4, alignContent: "center" }} onClick={slot ? undefined : () => input.current?.click()}>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {slot ? <CheckCircle2 size={18} color={V.green} /> : <Upload size={18} color={V.muted} />}
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {slot && <button className="v2-icon-btn" aria-label={`Remove ${title}`} style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); onClear(); }}><X size={15} /></button>}
      </div>
      <span style={{ fontSize: 12.5, color: slot ? V.body : V.muted }}>{slot ? `${slot.name}: ${slot.note}` : hint}</span>
    </Card>
  );
}

const TONE: Record<Check["status"], { tone: "good" | "bad" | "neutral"; label: string; icon: ReactNode }> = {
  agree: { tone: "good", label: "Agrees", icon: <CheckCircle2 size={16} color={V.green} /> },
  differs: { tone: "bad", label: "Differs", icon: <AlertTriangle size={16} color={V.maroon} /> },
  needs: { tone: "neutral", label: "Needs a file", icon: <FileQuestion size={16} color={V.muted} /> },
};

/** The return-level GST checks: sales against GSTR-1, GSTR-1 against 3B, ITC available against claimed, and reverse charge. Runs in the browser; nothing is filed. */
export default function GstReturnsCheck() {
  const [sales, setSales] = useState<Slot<ReadInvoices>>(null);
  const [purchases, setPurchases] = useState<Slot<ReadInvoices>>(null);
  // GSTR-1 and GSTR-3B arrive as a monthly portal JSON or as a full-year Excel. A full-year file is kept whole and cut to the chosen month.
  const [g1Json, setG1Json] = useState<Slot<Gstr1Read>>(null);
  const [g1Year, setG1Year] = useState<Slot<ReadInvoices>>(null);
  const [g3bJson, setG3bJson] = useState<Slot<Gstr3bRead>>(null);
  const [g3bYear, setG3bYear] = useState<Slot<Gstr3bAnnual>>(null);
  const [checkMonth, setCheckMonth] = useState("");
  const [g2b, setG2b] = useState<Slot<ReadInvoices>>(null);

  const reg = (set: (s: Slot<ReadInvoices>) => void) => async (f: File) => {
    const r = await readGstFile(f);
    if (!r.invoices.length) toast.error(r.notes[0] ?? "No invoices found in that file.");
    else set({ name: f.name, data: r, note: `${r.invoices.length} invoices${r.period ? `, ${r.period}` : ""}` });
  };

  const { clients } = useV2();
  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState("");
  const [fromTally, setFromTally] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadTally = async () => {
    if (!clientId || !month) return;
    setLoading(true);
    try {
      const r = await getTallyGstBooks({ data: { business_id: clientId, month } });
      const who = clients.find((c) => c.id === clientId)?.name ?? "client";
      const slot = (x: ReadInvoices): Slot<ReadInvoices> | null => (x.invoices.length ? { name: `Tally Day Book of ${who}`, data: x, note: x.notes[0] ?? "" } : null);
      setSales(slot(r.sales));
      setPurchases(slot(r.purchases));
      setFromTally(true);
      if (!r.sales.invoices.length && !r.purchases.invoices.length)
        toast.error(r.files ? `No sales or purchase vouchers for ${month} in the Tally Day Books on file.` : r.notXml ? "None of the books files on file is a Tally Day Book. Upload the Day Book, or a sales register." : "No Tally Day Book on file for this client.");
      else if (r.notXml) toast.message(`$`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the Day Book.");
    } finally {
      setLoading(false);
    }
  };

  // The month a full-year file is cut to: the one chosen, else the month the sales register is for.
  const month1 = checkMonth || sales?.data.period || purchases?.data.period || "";
  const g1 = useMemo<Slot<Gstr1Read>>(() => {
    if (g1Json) return g1Json;
    if (!g1Year || !month1) return null;
    const r = toGstr1Read(g1Year.data, month1);
    return { name: g1Year.name, data: r, note: `${r.invoices.length} invoices dated ${month1}` };
  }, [g1Json, g1Year, month1]);
  const g3b = useMemo<Slot<Gstr3bRead>>(() => {
    if (g3bJson) return g3bJson;
    if (!g3bYear || !month1) return null;
    const r = gstr3bFor(g3bYear.data, month1);
    return r ? { name: g3bYear.name, data: r, note: `month ${month1}` } : null;
  }, [g3bJson, g3bYear, month1]);
  const needsMonth = Boolean((g1Year || g3bYear) && !month1);
  const monthMissing = Boolean(g3bYear && month1 && !g3b);

  const checks = useMemo(() => checkReturns({ salesBooks: sales?.data, purchaseBooks: purchases?.data, gstr1: g1?.data, gstr3b: g3b?.data, gstr2b: g2b?.data }), [sales, purchases, g1, g3b, g2b]);
  const periods = [sales?.data.period, purchases?.data.period, g1?.data.period, g3b?.data.period, g2b?.data.period].filter(Boolean) as string[];
  const mixed = new Set(periods).size > 1;

  return (
    <div data-testid="gst-returns-check">
      <Card style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>Use a client's Tally Day Book</strong>
        <select className="v2-input" aria-label="Client" style={{ maxWidth: 260 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="v2-input" type="month" aria-label="Month" style={{ maxWidth: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="v2-btn v2-btn-primary" disabled={!clientId || !month || loading} data-busy={loading || undefined} onClick={() => void loadTally()}>{loading ? "Reading…" : "Fill sales and purchases"}</button>
        <span style={{ fontSize: 12.5, color: V.muted }}>Reads the Day Books already uploaded (Tally Excel or XML), so no register needs exporting.</span>
      </Card>
      {fromTally && <p style={{ fontSize: 12.5, color: V.muted, margin: "0 0 12px" }}>Reverse charge is taken from tax ledgers named RCM or reverse charge. If your ledgers are named differently, upload the purchase register instead.</p>}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 18 }}>
        <FileSlot title="Sales register" hint="Excel or CSV from Tally, Zoho or Busy, for the month." accept=".xlsx,.xls,.csv" slot={sales} onFile={(f) => void reg(setSales)(f)} onClear={() => setSales(null)} />
        <FileSlot title="GSTR-1 (portal JSON or Excel)" hint="Returns → GSTR-1 → the JSON, or the full-year Excel." accept=".json,.xlsx,.xls" slot={g1Json ?? g1Year} onClear={() => { setG1Json(null); setG1Year(null); }} onFile={async (f) => {
          if (/\.json$/i.test(f.name)) { const r = readGstr1Json(await f.text()); if (!r.invoices.length && !r.b2c.taxable) toast.error(r.notes[0] ?? "Could not read GSTR-1."); else { setG1Year(null); setG1Json({ name: f.name, data: r, note: r.notes[0] ?? "" }); } return; }
          const r = await readGstFile(f);
          if (!r.invoices.length) toast.error(r.notes[0] ?? "No invoices found in that file.");
          else { setG1Json(null); setG1Year({ name: f.name, data: r, note: `${r.invoices.length} invoices for the year` }); }
        }} />
        <FileSlot title="GSTR-3B (portal JSON or annual Excel)" hint="Returns → GSTR-3B → the JSON, or the annual report in Excel." accept=".json,.xlsx,.xls" slot={g3bJson ?? g3bYear} onClear={() => { setG3bJson(null); setG3bYear(null); }} onFile={async (f) => {
          if (/\.json$/i.test(f.name)) { const r = readGstr3bJson(await f.text()); if (r.notes.length) toast.error(r.notes[0]); else { setG3bYear(null); setG3bJson({ name: f.name, data: r, note: r.period ? `period ${r.period}` : "read" }); } return; }
          const r = await readGstr3bFile(f);
          if (!r.months.length) toast.error(r.notes[0] ?? "Could not read GSTR-3B.");
          else { setG3bJson(null); setG3bYear({ name: f.name, data: r, note: `twelve months, ${r.startYear ?? "year"}` }); }
        }} />
        <FileSlot title="GSTR-2B (portal JSON or Excel)" hint="For ITC available against claimed." accept=".json,.xlsx,.xls,.csv" slot={g2b} onFile={(f) => void reg(setG2b)(f)} onClear={() => setG2b(null)} />
        <FileSlot title="Purchase register" hint="For reverse charge. Needs a reverse-charge column." accept=".xlsx,.xls,.csv" slot={purchases} onFile={(f) => void reg(setPurchases)(f)} onClear={() => setPurchases(null)} />
      </div>
      {(g1Year || g3bYear) && (
        <Card style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>Month to check</strong>
          <input className="v2-input" type="month" aria-label="Month to check" style={{ maxWidth: 170 }} value={month1} onChange={(e) => setCheckMonth(e.target.value)} />
          <span style={{ fontSize: 12.5, color: needsMonth || monthMissing ? V.maroon : V.muted }}>
            {needsMonth ? "A full-year file is loaded. Choose the month so GSTR-1 and GSTR-3B are cut to it." : monthMissing ? `The GSTR-3B annual report has no column for ${month1}. Choose a month inside its financial year.` : "The full-year files are cut to this month before every check."}
          </span>
        </Card>
      )}
      {mixed && <p role="alert" style={{ color: V.maroon, fontSize: 13, margin: "0 0 14px" }}>These files are for different months ({[...new Set(periods)].join(", ")}). Use the same month for every file, or the differences will mean nothing.</p>}
      <div style={{ display: "grid", gap: 14 }}>
        {checks.map((c) => (
          <Card key={c.id} data-testid={`check-${c.id}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {TONE[c.status].icon}
              <strong style={{ fontSize: 15 }}>{c.title}</strong>
              <Badge tone={TONE[c.status].tone}>{TONE[c.status].label}</Badge>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 13.5, color: V.body }}>{c.summary}</p>
            {c.lines.length > 0 && (
              <div className="v2-scroll" style={{ marginTop: 12 }}>
                <table className="v2-table">
                  <thead><tr><th>Figure</th><th style={{ textAlign: "right" }}>One side</th><th style={{ textAlign: "right" }}>Other side</th><th style={{ textAlign: "right" }}>Difference</th></tr></thead>
                  <tbody>
                    {c.lines.map((l) => (
                      <tr key={l.label + l.aName}>
                        <td>{l.label}</td>
                        <td style={{ textAlign: "right" }}><div className="num">{inr(l.a)}</div><div style={{ fontSize: 11.5, color: V.muted }}>{l.aName}</div></td>
                        <td style={{ textAlign: "right" }}><div className="num">{inr(l.b)}</div><div style={{ fontSize: 11.5, color: V.muted }}>{l.bName}</div></td>
                        <td style={{ textAlign: "right", color: l.status === "agree" ? V.green : V.maroon, fontWeight: 600 }} className="num">{l.status === "agree" ? "Agrees" : inr(l.diff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {c.invoiceRecon && (c.invoiceRecon.missingInPortal.length > 0 || c.invoiceRecon.missingInBooks.length > 0) && (
              <div style={{ marginTop: 10, fontSize: 13, color: V.body, display: "grid", gap: 4 }}>
                {c.invoiceRecon.missingInPortal.length > 0 && <div><b>In the books, not in GSTR-1:</b> {c.invoiceRecon.missingInPortal.slice(0, 12).map((i) => `${i.no} (${inr(i.taxable)})`).join(", ")}{c.invoiceRecon.missingInPortal.length > 12 ? ` and ${c.invoiceRecon.missingInPortal.length - 12} more` : ""}</div>}
                {c.invoiceRecon.missingInBooks.length > 0 && <div><b>In GSTR-1, not in the books:</b> {c.invoiceRecon.missingInBooks.slice(0, 12).map((i) => `${i.no} (${inr(i.taxable)})`).join(", ")}{c.invoiceRecon.missingInBooks.length > 12 ? ` and ${c.invoiceRecon.missingInBooks.length - 12} more` : ""}</div>}
              </div>
            )}
          </Card>
        ))}
      </div>
      <p style={{ fontSize: 12, color: V.muted, marginTop: 14 }}>Read-only. Files stay in your browser and nothing is filed or changed. A difference up to ₹1 is treated as rounding. Exports and nil-rated supplies are shown on GSTR-1 but are not in the outward comparison.</p>
    </div>
  );
}
