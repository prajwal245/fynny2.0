/**
 * Approve bank lines for Tally. Each line shows the ledger FynHelp suggests (only ever an existing
 * Tally ledger), the person confirms or changes it, and approving queues exactly one voucher.
 * Nothing is written without this click, and a ledger that is not in Tally cannot be chosen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Clock, Link2Off, Loader2, RefreshCw, Send, ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
import { tallyApprove, tallyCancel, tallyMarkPosted, tallyWorkbench } from "@/lib/practice/practice.functions";
import { splitGstInclusive, type Split } from "@/lib/practice/tallyVoucher";
import { PagesChip, PagesTopUpModal } from "./PagesPanel";
import { refreshPages } from "../lib/pages";
import { Badge, V, formatDate, formatINR } from "../ui";

type Bench = Awaited<ReturnType<typeof tallyWorkbench>>;
type Linked = Extract<Bench, { linked: true }>;
type Line = Linked["lines"][number];

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Extra choices for one line: a transfer between own accounts (Contra), or a charge with its GST. */
interface Opts {
  open?: boolean;
  contra?: boolean;
  gst?: boolean;
  rate?: number;
  igst?: boolean;
  tax1?: string;
  tax2?: string;
}

const STATUS: Record<string, { label: string; tone: "info" | "good" | "warn" | "bad" | "neutral" }> = {
  queued: { label: "Approved, waiting for Tally", tone: "info" },
  sent: { label: "Writing to Tally", tone: "info" },
  posted: { label: "In Tally", tone: "good" },
  failed: { label: "Needs a look", tone: "warn" },
};

export function TallyPosting({ clientId }: { clientId: string }) {
  const [bench, setBench] = useState<Bench | null>(null);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [opts, setOpts] = useState<Record<string, Opts>>({});
  const [addPages, setAddPages] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const setOpt = (id: string, o: Opts) => setOpts((cur) => ({ ...cur, [id]: { ...cur[id], ...o } }));

  const load = useCallback(async () => {
    try {
      const b = await tallyWorkbench({ data: { business_id: clientId } });
      setUnavailable(false);
      setBench(b);
      if (b.linked) setBank((cur) => cur || b.bankLedgers[0] || "");
    } catch {
      // Quiet on purpose: if posting is not available yet the panel explains it instead of a red error on every visit.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Entries move from "waiting" to "in Tally" on their own while the connector works.
    const t = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  const linked = bench && bench.linked ? bench : null;
  const names = useMemo(() => new Set((linked?.ledgers ?? []).map((l) => l.name.trim().toLowerCase())), [linked]);

  const approve = async (l: Line, ledger: string) => {
    setBusy(l.txn_id);
    try {
      const o = opts[l.txn_id] ?? {};
      let splits: Split[] | undefined;
      if (o.gst && !o.contra) {
        const g = splitGstInclusive(l.amount, o.rate ?? 18, !o.igst);
        splits = [{ ledger, amount: g.base }, ...(o.igst ? [{ ledger: o.tax1 ?? "", amount: g.igst }] : [{ ledger: o.tax1 ?? "", amount: g.cgst }, { ledger: o.tax2 ?? "", amount: g.sgst }])];
      }
      await tallyApprove({ data: { txn_id: l.txn_id, party_ledger: ledger, bank_ledger: bank, kind: o.contra ? "Contra" : undefined, splits } });
      toast.success("Approved. It will be written to Tally the next time the connector checks in.");
      void refreshPages();
      await load();
    } catch (e) {
      const m = errMsg(e);
      if (/Add pages/i.test(m)) setAddPages(true);
      toast.error(m);
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await tallyCancel({ data: { id } });
      toast.success("Cancelled. Nothing was written to Tally.");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const markPosted = async (id: string) => {
    const note = window.prompt("You have checked Tally and this entry is there. Add a short note (for example, voucher number):", "Checked in Tally");
    if (!note || note.trim().length < 3) return;
    setBusy(id);
    try {
      await tallyMarkPosted({ data: { id, note: note.trim() } });
      toast.success("Marked as in Tally. The note is kept in the history.");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", gap: 8, color: V.muted, fontSize: 13 }}><Loader2 size={15} className="fh-spin" /> Checking Tally…</div>;
  if (unavailable && !bench) {
    return <div style={{ background: V.gray, borderRadius: 14, padding: 14, fontSize: 13, color: V.body }}>Posting to Tally is not available right now. Your extracted rows above are safe. Try again in a few minutes.</div>;
  }
  if (!bench || !linked) {
    return (
      <div style={{ background: V.gray, borderRadius: 14, padding: 16, fontSize: 13.5, color: V.body, display: "flex", gap: 10 }}>
        <Link2Off size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <b>This client is not linked to a Tally company yet.</b> In Settings, TallyPrime, link the Tally company to this client. Until then you can still export the lines and import them in Tally yourself.
        </div>
      </div>
    );
  }

  const stale = !linked.lastSyncedAt || Date.now() - Date.parse(linked.lastSyncedAt) > 6 * 3_600_000;
  const online = Boolean(linked.connectorSeenAt) && Date.now() - Date.parse(linked.connectorSeenAt!) < 15 * 60_000;
  const open = linked.lines.filter((l) => !l.posting || l.posting.status === "failed");

  return (
    <section aria-label="Approve entries for Tally" style={{ display: "grid", gap: 14 }}>
      <style>{`@keyframes fh-spin{to{transform:rotate(360deg)}}.fh-spin{animation:fh-spin 1s linear infinite}@media (prefers-reduced-motion:reduce){.fh-spin{animation:none}}`}</style>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <ShieldCheck size={18} color={V.green} />
        <b style={{ fontSize: 15 }}>Post to Tally: {linked.company}</b>
        <Badge tone={online ? "good" : "warn"}>{online ? "Connector online" : "Connector offline"}</Badge>
        <span style={{ fontSize: 12.5, color: V.muted }}>Tally last read {ago(linked.lastSyncedAt)}</span>
        <span style={{ marginLeft: "auto" }}><PagesChip onAdd={() => setAddPages(true)} /></span>
        <button className="v2-btn v2-btn-ghost" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} /> Refresh</button>
      </div>
      <PagesTopUpModal open={addPages} onClose={() => setAddPages(false)} />

      {!online && (
        <div role="status" style={{ background: "rgba(217,160,43,.12)", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: V.body, display: "flex", gap: 8 }}>
          <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          Tally is not reachable right now. You can approve lines; they wait and are written when Tally is open and the connector checks in.
        </div>
      )}
      {stale && (
        <div role="status" style={{ background: V.gray, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: V.body }}>
          The Tally data here is more than 6 hours old, so a very recent entry may not show. Check the line in Tally if you are unsure.
        </div>
      )}

      <label style={{ display: "grid", gap: 6, maxWidth: 360 }}>
        <span className="v2-label">Bank ledger in Tally for this statement</span>
        <select className="v2-input" value={bank} onChange={(e) => setBank(e.target.value)} aria-label="Bank ledger in Tally">
          {linked.bankLedgers.length === 0 && <option value="">No bank ledger found</option>}
          {linked.bankLedgers.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>

      {linked.ledgers.length === 0 && (
        <div style={{ fontSize: 13, color: V.maroon }}><TriangleAlert size={14} /> No ledgers have been read from Tally yet. Update the connector to version 1.1 and run a sync.</div>
      )}

      <datalist id="fh-tally-ledgers">{linked.ledgers.map((l) => <option key={l.name} value={l.name} />)}</datalist>

      {open.length === 0 && linked.lines.length === 0 && (
        <div style={{ fontSize: 13.5, color: V.body }}>Every bank line is already matched to an entry in Tally. Nothing to post.</div>
      )}

      <AnimatePresence initial={false}>
        {linked.lines.map((l, i) => {
          const sg = l.suggestion;
          const typed = choice[l.txn_id] ?? (sg.kind === "suggest" ? sg.ledger : "");
          const exists = names.has(typed.trim().toLowerCase());
          const done = l.posting && l.posting.status !== "failed";
          const st = l.posting ? STATUS[l.posting.status] : null;
          return (
            <motion.div
              key={l.txn_id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.03 }}
              style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10, background: l.posting?.status === "posted" ? "rgba(47,107,79,.06)" : V.card }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                <span className="num" style={{ fontSize: 12.5, color: V.muted }}>{formatDate(l.date)}</span>
                <b style={{ fontSize: 14 }}>{l.counterparty || l.description || "No description"}</b>
                <span className="num" style={{ marginLeft: "auto", fontWeight: 600, color: l.direction === "in" ? V.green : V.maroon }}>
                  {l.direction === "in" ? "+" : "−"}{formatINR(l.amount)}
                </span>
              </div>
              {l.description && l.counterparty && <div style={{ fontSize: 12.5, color: V.muted, overflowWrap: "anywhere" }}>{l.description}</div>}

              {done && st ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span style={{ fontSize: 13 }}>Ledger: <b>{l.posting!.party_ledger}</b></span>
                  {l.posting!.status === "posted" && <CheckCircle2 size={16} color={V.green} />}
                  {l.posting!.status === "queued" && (
                    <button className="v2-btn v2-btn-ghost" disabled={busy === l.posting!.id} onClick={() => void cancel(l.posting!.id)}><Undo2 size={14} /> Cancel</button>
                  )}
                </div>
              ) : (
                <>
                  {l.posting?.status === "failed" && (
                    <div role="alert" style={{ background: "rgba(169,56,56,.07)", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: V.maroon }}>
                      {l.posting.last_error || "This entry did not reach Tally."} Check Tally for this entry before approving again.
                      <div style={{ marginTop: 6 }}>
                        <button className="v2-btn v2-btn-ghost" disabled={busy === l.posting.id} onClick={() => void markPosted(l.posting!.id)}><CheckCircle2 size={14} /> It is in Tally: mark as posted</button>
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: V.body }}>
                    {sg.kind === "suggest" && <>Suggested <b>{sg.ledger}</b> ({Math.round(sg.confidence * 100)}% sure). {sg.reason}</>}
                    {sg.kind === "uncertain" && <>Not sure: {sg.candidates.map((c) => c.ledger).join(", ")}. Please choose.</>}
                    {sg.kind === "none" && <>{sg.reason}</>}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="v2-input"
                      style={{ flex: "1 1 220px", minWidth: 0 }}
                      list="fh-tally-ledgers"
                      value={typed}
                      placeholder="Choose a ledger from Tally"
                      aria-label={`Ledger for ${l.counterparty || l.description || "this line"}`}
                      onChange={(e) => setChoice({ ...choice, [l.txn_id]: e.target.value })}
                    />
                    <button
                      className="v2-btn v2-btn-primary"
                      disabled={!exists || !bank || busy === l.txn_id}
                      title={!typed ? "Choose a ledger first" : !exists ? "This ledger is not in Tally. A new ledger must be created in Tally first." : undefined}
                      onClick={() => void approve(l, typed)}
                    >
                      {busy === l.txn_id ? <Loader2 size={15} className="fh-spin" /> : <Send size={15} />} Approve for Tally
                    </button>
                  </div>
                  <button type="button" className="v2-btn v2-btn-ghost" style={{ justifySelf: "start", padding: "4px 10px", fontSize: 12.5 }} aria-expanded={!!opts[l.txn_id]?.open} onClick={() => setOpt(l.txn_id, { open: !opts[l.txn_id]?.open })}>
                    <ChevronDown size={14} style={{ transform: opts[l.txn_id]?.open ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> More options
                  </button>
                  <AnimatePresence initial={false}>
                    {opts[l.txn_id]?.open && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                        <div style={{ display: "grid", gap: 10, background: V.gray, borderRadius: 12, padding: 12, fontSize: 13 }}>
                          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <input type="checkbox" checked={!!opts[l.txn_id]?.contra} onChange={(e) => setOpt(l.txn_id, { contra: e.target.checked, gst: false })} style={{ marginTop: 3 }} />
                            <span><b>Transfer between my own bank or cash accounts</b> (posts as a Contra). Choose the other bank or cash ledger above.</span>
                          </label>
                          {!opts[l.txn_id]?.contra && (
                            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <input type="checkbox" checked={!!opts[l.txn_id]?.gst} onChange={(e) => setOpt(l.txn_id, { gst: e.target.checked })} style={{ marginTop: 3 }} />
                              <span><b>This amount includes GST</b> (for example a bank charge). FynHelp splits it into the charge and its GST ledgers.</span>
                            </label>
                          )}
                          {opts[l.txn_id]?.gst && !opts[l.txn_id]?.contra && (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <select className="v2-input" aria-label="GST rate" value={opts[l.txn_id]?.rate ?? 18} onChange={(e) => setOpt(l.txn_id, { rate: Number(e.target.value) })}>
                                  {[5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}% GST</option>)}
                                </select>
                                <select className="v2-input" aria-label="GST type" value={opts[l.txn_id]?.igst ? "igst" : "cs"} onChange={(e) => setOpt(l.txn_id, { igst: e.target.value === "igst" })}>
                                  <option value="cs">CGST + SGST (same state)</option>
                                  <option value="igst">IGST (other state)</option>
                                </select>
                              </div>
                              <input className="v2-input" list="fh-tally-ledgers" placeholder={opts[l.txn_id]?.igst ? "Input IGST ledger" : "Input CGST ledger"} aria-label="First GST ledger" value={opts[l.txn_id]?.tax1 ?? ""} onChange={(e) => setOpt(l.txn_id, { tax1: e.target.value })} />
                              {!opts[l.txn_id]?.igst && <input className="v2-input" list="fh-tally-ledgers" placeholder="Input SGST ledger" aria-label="Second GST ledger" value={opts[l.txn_id]?.tax2 ?? ""} onChange={(e) => setOpt(l.txn_id, { tax2: e.target.value })} />}
                              {(() => {
                                const g = splitGstInclusive(l.amount, opts[l.txn_id]?.rate ?? 18, !opts[l.txn_id]?.igst);
                                return <div style={{ fontSize: 12.5, color: V.body }}>Charge {formatINR(g.base)} + {opts[l.txn_id]?.igst ? `IGST ${formatINR(g.igst)}` : `CGST ${formatINR(g.cgst)} + SGST ${formatINR(g.sgst)}`} = {formatINR(l.amount)}</div>;
                              })()}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {typed && !exists && <div style={{ fontSize: 12, color: V.maroon }}>"{typed}" is not a ledger in Tally. FynHelp never creates ledgers: create it in Tally, then sync.</div>}
                </>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>
        Every entry needs your approval. Nothing is written until the connector on the Tally PC has writing turned on, and each line is written once. Only typed or printed documents are read reliably: handwritten documents are not supported, and unclear lines go to the Review Queue instead of being guessed.
      </p>
    </section>
  );
}
