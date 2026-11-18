import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { FileSpreadsheet, ShieldCheck, Upload, Copy, Download, MessageCircle, X, CheckCircle2 } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Stat, Tabs, V } from "../ui";
import { useV2 } from "../store";
import { AgentTrace } from "../components/AgentTrace";
import { readGstFile, toCsv } from "@/lib/practice/gst/files";
import type { ReadInvoices } from "@/lib/practice/gst/invoices";
import { reconcileGstr2b, vendorMessage, type Gstr2bRecon } from "@/lib/practice/gst/reconcile";
import { runValidations, type ValidationRun } from "@/lib/practice/gst/validations";
import { getPracticeDocumentUrl, saveGstResult } from "@/lib/practice/practice.functions";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Loaded = { name: string; read: ReadInvoices } | null;

function Drop({ title, hint, accept, loaded, busy, onFile, onClear }: { title: string; hint: string; accept: string; loaded: Loaded; busy: boolean; onFile: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <Card
      style={{ borderStyle: loaded ? "solid" : "dashed", borderColor: over ? V.brand : V.line, minHeight: 132, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}
      onClick={loaded ? undefined : () => input.current?.click()}
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        style={{ display: "grid", gap: 6 }}
      >
        <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loaded ? <CheckCircle2 size={20} color={V.green} /> : <Upload size={20} color={V.muted} />}
          <strong style={{ color: V.ink }}>{title}</strong>
          {loaded && (
            <button className="v2-icon-btn" aria-label={`Remove ${title}`} title="Remove" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); onClear(); }}><X size={16} /></button>
          )}
        </div>
        {busy ? (
          <AgentTrace agent="extract" compact title="Reading the file" steps={["Opening the file", "Finding the invoice table", "Reading each invoice", "Adding up one invoice per row"]} />
        ) : loaded ? (
          <span style={{ color: V.body, fontSize: 13 }}>
            {loaded.name}: {loaded.read.invoices.length} invoices{loaded.read.period ? `, ${loaded.read.period}` : ""}
            {loaded.read.invoices.length === 0 && loaded.read.notes[0] ? <span style={{ color: V.maroon }}> {loaded.read.notes[0]}</span> : null}
          </span>
        ) : (
          <span style={{ color: V.muted, fontSize: 13 }}>{hint}</span>
        )}
      </div>
    </Card>
  );
}

const downloadCsv = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** GST. GSTR-2B against the purchase books, and the checks that catch a notice before it happens. Read-only: nothing is filed. */
export default function GstPage() {
  const { firm, clients, docs, addDoc } = useV2();
  const firmName = firm?.name ?? "our firm";
  const [books, setBooks] = useState<Loaded>(null);
  const [portal, setPortal] = useState<Loaded>(null);
  const [busy, setBusy] = useState<"books" | "portal" | null>(null);
  const [tab, setTab] = useState("vendors");
  // The client this reconciliation belongs to. Saved files come back when the page is opened again.
  const [clientId, setClientId] = useState("");
  const [files, setFiles] = useState<{ books: File | null; portal: File | null }>({ books: null, portal: null });
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);
  useEffect(() => {
    if (!clientId && clients.length === 1) setClientId(clients[0]!.id);
  }, [clients, clientId]);
  const saved = useMemo(() => {
    const mine = docs.filter((d) => d.clientId === clientId && d.register);
    const pick = (kinds: string[]) => mine.find((d) => kinds.includes(d.register!.kind));
    return { books: pick(["gst_purchase_register", "invoice_register"]), portal: pick(["gstr2b"]) };
  }, [docs, clientId]);
  // Opening a client with saved GST files loads them, unless files were just added by hand.
  useEffect(() => {
    if (!clientId || books || portal) return;
    const fetchAs = async (id: string, name: string) => {
      const { url } = await getPracticeDocumentUrl({ data: { id } });
      const blob = await (await fetch(url)).blob();
      return new File([blob], name);
    };
    let cancelled = false;
    void (async () => {
      try {
        const [b, p] = await Promise.all([saved.books ? fetchAs(saved.books.id, saved.books.name) : null, saved.portal ? fetchAs(saved.portal.id, saved.portal.name) : null]);
        if (cancelled) return;
        if (b) setBooks({ name: b.name, read: await readGstFile(b) });
        if (p) setPortal({ name: p.name, read: await readGstFile(p) });
        if (b || p) setRestored(clients.find((c) => c.id === clientId)?.name ?? "this client");
      } catch {
        /* the saved files could not be fetched: the page works with new files */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, saved.books?.id, saved.portal?.id]);

  const load = async (which: "books" | "portal", file: File) => {
    setBusy(which);
    const read = await readGstFile(file);
    setBusy(null);
    (which === "books" ? setBooks : setPortal)({ name: file.name, read });
    setFiles((f) => ({ ...f, [which]: file }));
    setRestored(null);
    if (!read.invoices.length) toast.error(read.notes[0] ?? "No invoices found in that file.");
  };

  const recon: Gstr2bRecon | null = useMemo(
    () => (books?.read.invoices.length && portal?.read.invoices.length ? reconcileGstr2b(books.read.invoices, portal.read.invoices, { period: portal.read.period ?? books.read.period }) : null),
    [books, portal],
  );
  const checks: ValidationRun | null = useMemo(
    () => (books?.read.invoices.length ? runValidations(books.read.invoices, { side: "purchase", period: books.read.period, ownGstin: portal?.read.ownGstin ?? null }) : null),
    [books, portal],
  );

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Message copied"); } catch { toast.error("Could not copy. Select the text and copy it."); }
  };

  const saveToClient = async () => {
    if (!clientId || !recon) return;
    setSaving(true);
    try {
      if (files.books) addDoc(files.books.name, clientId, "Manual", files.books);
      if (files.portal) addDoc(files.portal.name, clientId, "Manual", files.portal);
      const who = clients.find((c) => c.id === clientId)?.name ?? "the client";
      await saveGstResult({ data: { business_id: clientId, summary: `GST reconciliation${recon.period ? ` for ${recon.period}` : ""}: ${recon.matched.length} matched, ${recon.mismatched.length} with different amounts, ${recon.missingInPortal.length} not on GSTR-2B (ITC at risk ${inr(recon.totals.itcAtRisk)}), ${recon.missingInBooks.length} not in the books.` } });
      toast.success(`Saved to ${who}. The files are in its Documents and the result is in its Activity.`);
      setFiles({ books: null, portal: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="GST reconciliation" subtitle="Match your purchase books to GSTR-2B and find the input tax credit that is at risk. Nothing is filed or changed. Choose a client to keep the files and the result with it." />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <label className="v2-label" htmlFor="gst-client" style={{ margin: 0 }}>Client</label>
        <select id="gst-client" className="v2-input" style={{ maxWidth: 320 }} value={clientId} onChange={(e) => { setClientId(e.target.value); setBooks(null); setPortal(null); setFiles({ books: null, portal: null }); setRestored(null); }}>
          <option value="">No client (files stay in this browser)</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {restored && <Badge tone="info">Loaded from {restored}'s saved files</Badge>}
        {recon && clientId && (files.books || files.portal) && (
          <button className="v2-btn v2-btn-primary" disabled={saving} onClick={() => void saveToClient()} data-testid="gst-save">{saving ? "Saving…" : "Save to client"}</button>
        )}
      </div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 20 }}>
        <Drop title="Purchase register (your books)" hint="Drop an Excel or CSV purchase register, from Tally, Zoho, Busy or your own sheet." accept=".xlsx,.xls,.csv" loaded={books} busy={busy === "books"} onFile={(f) => load("books", f)} onClear={() => { setBooks(null); setFiles((f) => ({ ...f, books: null })); }} />
        <Drop title="GSTR-2B (from the portal)" hint="Drop the GSTR-2B JSON (Returns → GSTR-2B → Download) or its Excel." accept=".json,.xlsx,.xls,.csv" loaded={portal} busy={busy === "portal"} onFile={(f) => load("portal", f)} onClear={() => { setPortal(null); setFiles((f) => ({ ...f, portal: null })); }} />
      </div>

      {!books && !portal && (
        <EmptyState icon={<FileSpreadsheet size={28} />} title="Add your purchase register and GSTR-2B" description="You get a list of suppliers whose invoices are missing from GSTR-2B, with the tax credit at risk and a message to send each of them. Add just the register to run the 30+ GST checks on it." />
      )}

      {recon && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="gst-recon">
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
            <Stat label="Matched ITC" value={inr(recon.totals.matchedTax)} hint={`${recon.matched.length} invoices agree`} tone="good" />
            <Stat label="ITC at risk" value={inr(recon.totals.itcAtRisk)} hint={`${recon.missingInPortal.length} invoices not on GSTR-2B`} tone={recon.totals.itcAtRisk > 0 ? "bad" : "good"} onClick={() => setTab("vendors")} />
            <Stat label="Not booked" value={inr(recon.totals.unbookedItc)} hint={`${recon.missingInBooks.length} on GSTR-2B, not in books`} onClick={() => setTab("unbooked")} />
            <Stat label="Amount differences" value={String(recon.mismatched.length)} hint={recon.mismatched.length ? `Tax differs by ${inr(Math.abs(recon.totals.mismatchTaxDiff))}` : "None"} tone={recon.mismatched.length ? "bad" : "good"} onClick={() => setTab("diff")} />
          </div>
          {recon.notes.map((n) => <p key={n} style={{ color: V.muted, fontSize: 12, margin: "0 0 6px" }}>{n}</p>)}
        </motion.div>
      )}

      {(recon || checks) && (
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ...(recon
              ? [
                  { value: "vendors", label: "Follow up suppliers", count: recon.vendors.length },
                  { value: "diff", label: "Differences", count: recon.mismatched.length },
                  { value: "unbooked", label: "Not in books", count: recon.missingInBooks.length },
                  { value: "blocked", label: "ITC not available", count: recon.itcBlocked.length },
                  { value: "matched", label: "Matched", count: recon.matched.length },
                ]
              : []),
            { value: "checks", label: "Register checks", count: checks?.failed.length ?? 0 },
          ]}
        />
      )}
      {books && portal && !recon && <p style={{ color: V.maroon, fontSize: 13 }}>One of the files has no readable invoices, so there is nothing to match yet.</p>}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {recon && tab === "vendors" && (
            recon.vendors.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={28} />} title="Every book invoice is on GSTR-2B" description="Nothing to chase. Check the Differences tab for amounts that do not agree." />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="v2-btn v2-btn-quiet" onClick={() => downloadCsv("gstr2b-followup.csv", toCsv(["Supplier GSTIN", "Supplier", "Invoice", "Date", "Taxable value", "Tax"], recon.vendors.flatMap((v) => v.missing.map((i) => [v.gstin, v.party, i.no, i.date, i.taxable, i.igst + i.cgst + i.sgst + i.cess]))))}><Download size={14} /> Download list</button>
                </div>
                {recon.vendors.map((v) => {
                  const msg = vendorMessage(v, recon.period, firmName);
                  return (
                    <Card key={v.gstin} data-testid="gst-vendor">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <strong style={{ color: V.ink }}>{v.party || "Unnamed supplier"}</strong>
                          <div style={{ color: V.muted, fontSize: 12, fontFamily: V.mono }}>{v.gstin}</div>
                        </div>
                        <Badge tone="bad">{inr(v.itcAtRisk)} ITC at risk · {v.missing.length} invoice{v.missing.length === 1 ? "" : "s"}</Badge>
                      </div>
                      <ul style={{ margin: "10px 0", paddingLeft: 18, color: V.body, fontSize: 13 }}>
                        {v.missing.slice(0, 6).map((i) => <li key={i.row + i.no}>{i.no || "(no number)"}{i.date ? `, ${i.date}` : ""}: taxable {inr(i.taxable)}, tax {inr(i.igst + i.cgst + i.sgst + i.cess)}</li>)}
                        {v.missing.length > 6 && <li>and {v.missing.length - 6} more</li>}
                      </ul>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="v2-btn v2-btn-quiet" onClick={() => copy(msg)}><Copy size={14} /> Copy message</button>
                        <a className="v2-btn v2-btn-quiet" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          {recon && tab === "diff" && <PairTable rows={recon.mismatched.map((p) => [p.portal.party || p.books.party, p.books.no, p.diffs.map((d) => `${d.field}: books ${inr(d.books)} vs GSTR-2B ${inr(d.portal)}`).join("; ")])} head={["Supplier", "Invoice", "What differs"]} empty="No amount differences." />}
          {recon && tab === "unbooked" && <PairTable rows={recon.missingInBooks.map((i) => [i.party, i.no, `${i.date ?? ""} · tax ${inr(i.igst + i.cgst + i.sgst + i.cess)}${i.itc === "N" ? " · ITC not available" : ""}`])} head={["Supplier", "Invoice", "Detail"]} empty="Everything on GSTR-2B is in your books." note="Check whether the purchase was missed in the books, or belongs to another month or another GSTIN." />}
          {recon && tab === "blocked" && <PairTable rows={recon.itcBlocked.map((i) => [i.party, i.no, `tax ${inr(i.igst + i.cgst + i.sgst + i.cess)}`])} head={["Supplier", "Invoice", "Tax"]} empty="The portal marks no invoice as ITC not available." note="The portal marks these as not eligible (for example, a blocked credit or a late-filing supplier). Do not claim them without checking." />}
          {recon && tab === "matched" && <PairTable rows={recon.matched.map((p) => [p.portal.party || p.books.party, p.books.no, `${inr(p.portal.igst + p.portal.cgst + p.portal.sgst)}${p.how === "exact" ? "" : p.how === "loose" ? " · number written differently" : ` · matched by amount (GSTR-2B shows ${p.portal.no})`}`])} head={["Supplier", "Invoice", "Tax"]} empty="Nothing matched." />}

          {checks && tab === "checks" && (
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ color: V.muted, fontSize: 13, margin: 0 }}>{checks.passed} checks passed{checks.skipped ? `, ${checks.skipped} skipped because the file does not carry what they need` : ""}. Each rule is plain arithmetic or format, not a guess.</p>
              {checks.failed.length === 0 && <EmptyState icon={<ShieldCheck size={28} />} title="No problems found" description="Every check that could run on this register passed." />}
              {checks.failed.map((v) => (
                <Card key={v.id}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <strong style={{ color: V.ink }}>{v.label}</strong>
                    <Badge tone={v.severity === "error" ? "bad" : v.severity === "warn" ? "warn" : "neutral"}>{v.count} {v.severity === "error" ? "to fix" : v.severity === "warn" ? "to review" : "for information"}</Badge>
                  </div>
                  <p style={{ color: V.body, fontSize: 13, margin: "8px 0 4px" }}>{v.detail}</p>
                  <p style={{ color: V.muted, fontSize: 12, margin: 0 }}>{v.examples.join(" · ")}</p>
                </Card>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PairTable({ rows, head, empty, note }: { rows: string[][]; head: string[]; empty: string; note?: string }) {
  if (!rows.length) return <EmptyState icon={<ShieldCheck size={28} />} title={empty} description="" />;
  return (
    <Card className="v2-scroll" style={{ padding: 0 }}>
      {note && <p style={{ color: V.muted, fontSize: 12, margin: 0, padding: "12px 16px 0" }}>{note}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: V.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 500).map((r, i) => <tr key={i} style={{ borderTop: `1px solid ${V.line}` }}>{r.map((c, j) => <td key={j} style={{ padding: "10px 16px", color: j === 0 ? V.ink : V.body }}>{c}</td>)}</tr>)}</tbody>
      </table>
      {rows.length > 500 && <p style={{ color: V.muted, fontSize: 12, padding: "0 16px 12px" }}>Showing the first 500 of {rows.length}.</p>}
    </Card>
  );
}
