import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Upload, X, AlertTriangle, FileQuestion } from "lucide-react";
import { Badge, Card, V } from "../ui";
import { useV2 } from "../store";
import { getTallyGstBooks } from "@/lib/practice/practice.functions";
import { readGstr2bJson, type ReadInvoices } from "@/lib/practice/gst/invoices";
import { detectWorkbook, monthsIn, readGstr3bAnnual, readJournalsGst, readPortalReport, readTallyRegister } from "@/lib/practice/gst/reports";
import { checkReturns, readGstr1Json, readGstr3bJson, type Check, type Gstr1Read, type Gstr3bRead } from "@/lib/practice/gst/returns";

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const TONE: Record<Check["status"], { tone: "good" | "bad" | "neutral"; label: string; icon: ReactNode }> = {
  agree: { tone: "good", label: "Agrees", icon: <CheckCircle2 size={16} color={V.green} /> },
  differs: { tone: "bad", label: "Differs", icon: <AlertTriangle size={16} color={V.maroon} /> },
  needs: { tone: "neutral", label: "Needs a file", icon: <FileQuestion size={16} color={V.muted} /> },
};

type Kind = "sales" | "purchases" | "debitNotes" | "journals" | "gstr1" | "gstr2b" | "gstr3b";
const KIND_LABEL: Record<Kind, string> = { sales: "Sales register", purchases: "Purchase register", debitNotes: "Debit note register", journals: "Journals with GST", gstr1: "GSTR-1", gstr2b: "GSTR-2B", gstr3b: "GSTR-3B" };
const lastMonthOf = (ms: string[]) => [...ms].sort().pop() ?? "";

/** Reads one file and says what it is. Excel workbooks are recognised by their headings, JSON by its sections. */
async function identify(file: File): Promise<{ kind: Kind; rows?: string[][]; json?: unknown; months: string[]; sheet?: string }[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    const json = JSON.parse(await file.text()) as Record<string, unknown>;
    const root = (json["data"] as Record<string, unknown> | undefined) ?? json;
    if (root["sup_details"] || root["itc_elg"] || json["sup_details"]) return [{ kind: "gstr3b", json, months: [] }];
    if (root["docdata"] || (json["data"] as Record<string, unknown> | undefined)?.["docdata"]) return [{ kind: "gstr2b", json, months: [] }];
    return [{ kind: "gstr1", json, months: [] }];
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const sheets = wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n]!, { header: 1, raw: false, defval: "" }) }));
  const d = detectWorkbook(sheets);
  const sheet = sheets.find((x) => x.name === d.sheet)!;
  if (d.kind === "gstr3b_annual") return [{ kind: "gstr3b", rows: sheet.rows, months: [] }];
  if (d.kind === "gstr1_report") return [{ kind: "gstr1", rows: sheet.rows, months: monthsIn(sheet.rows) }];
  if (d.kind === "gstr2b_report") return [{ kind: "gstr2b", rows: sheet.rows, months: monthsIn(sheet.rows) }];
  // A Tally export can hold several registers, one per sheet: take each by its own heading.
  const found: { kind: Kind; rows: string[][]; months: string[]; sheet: string }[] = [];
  for (const sh of sheets) {
    const one = detectWorkbook([sh]);
    if (one.kind === "tally_journals") found.push({ kind: "journals", rows: sh.rows, months: [], sheet: sh.name });
    else if (one.kind === "tally_register") {
      const t = sh.rows.slice(0, 4).map((r) => r.join(" ").toLowerCase()).join(" ");
      const isPurchase = sh.rows.slice(0, 8).some((r) => r.some((c) => /supplier invoice no/i.test(String(c))));
      found.push({ kind: /debit note|credit note/.test(t) ? "debitNotes" : isPurchase ? "purchases" : "sales", rows: sh.rows, months: [], sheet: sh.name });
    }
  }
  return found;
}

/** The return-level GST checks: sales against GSTR-1, GSTR-1 against 3B, ITC available against claimed, and reverse charge. Runs in the browser; nothing is filed. */
export default function GstReturnsCheck() {
  const [parts, setParts] = useState<Partial<Record<Kind, { name: string; rows?: string[][]; json?: unknown; months: string[] }>>>({});
  const [month, setMonth] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { clients } = useV2();
  const [clientId, setClientId] = useState("");
  const [tally, setTally] = useState<{ sales: ReadInvoices; purchases: ReadInvoices; name: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const take = async (files: FileList | File[]) => {
    setBusy(true);
    const next = { ...parts };
    const unknown: string[] = [];
    let months: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const got = await identify(f);
        if (!got.length) unknown.push(f.name);
        for (const g of got) { next[g.kind] = { name: g.sheet ? `${f.name} (${g.sheet})` : f.name, rows: g.rows, json: g.json, months: g.months }; months = months.concat(g.months); }
      } catch (e) {
        unknown.push(`${f.name} (${e instanceof Error ? e.message : "could not be read"})`);
      }
    }
    setParts(next);
    if (!month) {
      // The registers are for one month; the portal reports cover the year. Start from the latest month the portal reports hold.
      const fromReg = [next.sales, next.purchases].map((x) => (x?.rows ? x.rows.slice(5).map((r) => String(r[0] ?? "")).find((c) => /^\d{2}-\d{2}-\d{4}$/.test(c)) : "")).find(Boolean);
      setMonth(fromReg ? `${fromReg.slice(6)}-${fromReg.slice(3, 5)}` : lastMonthOf(months));
    }
    if (unknown.length) toast.error(`Could not tell what these files are: ${unknown.join(", ")}. Use the Tally registers, or the GSTR-1, 2B and 3B reports from the portal.`);
    setBusy(false);
  };

  const loadTally = async () => {
    if (!clientId || !month) return;
    setLoading(true);
    try {
      const r = await getTallyGstBooks({ data: { business_id: clientId, month } });
      const who = clients.find((c) => c.id === clientId)?.name ?? "client";
      setTally(r.sales.invoices.length || r.purchases.invoices.length ? { sales: r.sales, purchases: r.purchases, name: `Tally Day Book of ${who}` } : null);
      if (!r.sales.invoices.length && !r.purchases.invoices.length)
        toast.error(r.files ? `No sales or purchase vouchers for ${month} in the Tally Day Books on file.` : r.notXml ? "None of the books files on file is a Tally Day Book. Upload the Day Book, or a sales register." : "No Tally Day Book on file for this client.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the Day Book.");
    } finally {
      setLoading(false);
    }
  };

  const model = useMemo(() => {
    const m = month || null;
    const reg = (k: Kind, side: "sales" | "purchase") => (parts[k]?.rows ? readTallyRegister(parts[k]!.rows!, { month: m, side }) : null);
    const sales = reg("sales", "sales") ?? tally?.sales ?? null;
    const purReg = reg("purchases", "purchase");
    const dn = reg("debitNotes", "purchase");
    const jr = parts.journals?.rows ? readJournalsGst(parts.journals.rows, { month: m }) : null;
    const base = purReg ?? tally?.purchases ?? null;
    const purchases: ReadInvoices | null = base || dn || jr ? { invoices: [...(base?.invoices ?? []), ...(dn?.invoices ?? []), ...(jr?.purchases ?? [])], period: m, ownGstin: null, notes: [] } : null;
    const g1 = parts.gstr1 ? (parts.gstr1.rows ? readPortalReport(parts.gstr1.rows, { kind: "gstr1", month: m }) : readGstr1Json(parts.gstr1.json)) : null;
    const g1x: Gstr1Read | null = g1 ? { ...(g1 as Gstr1Read), b2c: (g1 as Gstr1Read).b2c ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }, exportsAndNil: (g1 as Gstr1Read).exportsAndNil ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 } } : null;
    const g2 = parts.gstr2b ? (parts.gstr2b.rows ? readPortalReport(parts.gstr2b.rows, { kind: "gstr2b", month: m }) : readGstr2bJson(parts.gstr2b.json)) : null;
    const g3 = parts.gstr3b ? (parts.gstr3b.rows ? readGstr3bAnnual(parts.gstr3b.rows, m ?? "") : readGstr3bJson(parts.gstr3b.json)) : null;
    const notes = [sales?.notes, purReg?.notes, dn?.notes, jr?.notes, g1?.notes, g2?.notes, g3?.notes].flatMap((x) => x ?? []).filter(Boolean);
    const checks = checkReturns({ salesBooks: sales, purchaseBooks: purchases, gstr1: g1x, gstr3b: g3, gstr2b: g2, rcmBooks: jr?.rcm ?? null });
    return { checks, notes, periods: [sales?.period, g1?.period, g2?.period, g3?.period].filter(Boolean) as string[] };
  }, [parts, month, tally]);

  const have = Object.keys(parts) as Kind[];
  const allMonths = [...new Set(Object.values(parts).flatMap((p) => p?.months ?? []))].sort();

  return (
    <div data-testid="gst-returns-check">
      <Card
        style={{ borderStyle: "dashed", borderColor: over ? V.brand : V.line, marginBottom: 14, display: "grid", gap: 10, cursor: "pointer" }}
        onClick={() => input.current?.click()}
      >
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }} style={{ display: "grid", gap: 8 }}>
          <input ref={input} type="file" multiple accept=".xlsx,.xls,.json" hidden onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Upload size={18} color={V.muted} />
            <strong style={{ fontSize: 14 }}>{busy ? "Reading the files…" : "Drop all the month's files here"}</strong>
          </div>
          <span style={{ fontSize: 12.5, color: V.muted }}>Tally registers (sales, purchase, debit note, journals with GST) and the GSTR-1, GSTR-2B and GSTR-3B from the portal, as Excel or JSON. Each file is recognised by what is in it, so you can drop them together. The portal reports cover the whole year; choose the month below.</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {have.map((k) => (
              <span key={k} className="v2-btn v2-btn-quiet" style={{ cursor: "default" }} title={parts[k]!.name}>
                <CheckCircle2 size={14} color={V.green} /> {KIND_LABEL[k]}
                <button className="v2-icon-btn" style={{ width: 22, height: 22 }} aria-label={`Remove ${KIND_LABEL[k]}`} onClick={(e) => { e.stopPropagation(); setParts((p) => { const n = { ...p }; delete n[k]; return n; }); }}><X size={12} /></button>
              </span>
            ))}
            {tally && <span className="v2-btn v2-btn-quiet" style={{ cursor: "default" }}><CheckCircle2 size={14} color={V.green} /> {tally.name}</span>}
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="v2-label" htmlFor="gst-month" style={{ margin: 0 }}>Month</label>
        {allMonths.length ? (
          <select id="gst-month" className="v2-input" style={{ maxWidth: 170 }} value={month} onChange={(e) => setMonth(e.target.value)}>
            {!allMonths.includes(month) && <option value={month}>{month || "Choose"}</option>}
            {allMonths.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        ) : (
          <input id="gst-month" className="v2-input" type="month" style={{ maxWidth: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        )}
        <span style={{ color: V.muted, fontSize: 12.5 }}>or fill sales and purchases from a client's Tally Day Book:</span>
        <select className="v2-input" aria-label="Client" style={{ maxWidth: 240 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="v2-btn v2-btn-ghost" disabled={!clientId || !month || loading} data-busy={loading || undefined} onClick={() => void loadTally()}>{loading ? "Reading…" : "Fill from Day Book"}</button>
      </Card>

      {new Set(model.periods).size > 1 && <p role="alert" style={{ color: V.maroon, fontSize: 13, margin: "0 0 14px" }}>These files are for different months ({[...new Set(model.periods)].join(", ")}). Use the same month for every file, or the differences will mean nothing.</p>}
      {model.notes.length > 0 && <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12.5, color: V.muted }}>{model.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <div style={{ display: "grid", gap: 14 }}>
        {model.checks.map((c) => (
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
      <p style={{ fontSize: 12, color: V.muted, marginTop: 14 }}>Read-only. Files stay in your browser and nothing is filed or changed. A difference up to ₹1 is treated as rounding. Exports and nil-rated supplies are shown on GSTR-1 but are not in the outward comparison. Sales booked as journals without GST ledgers are not in a sales register, so they appear as "in GSTR-1, not in the books".</p>
    </div>
  );
}
