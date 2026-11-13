/**
 * Approve bank lines for Tally. Each line shows the ledger FynHelp suggests (only ever an existing
 * Tally ledger), the person confirms or changes it, and approving queues exactly one voucher.
 * Nothing is written without this click, and a ledger that is not in Tally cannot be chosen.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Clock, Link2Off, Loader2, RefreshCw, Send, ShieldCheck, TriangleAlert, Undo2 } from "lucide-react";
import { tallyApprove, tallyCancel, tallyCancelLedger, tallyCreateLedger, tallyMarkPosted, tallyWorkbench } from "@/lib/practice/practice.functions";
import { splitGstInclusive, type Split } from "@/lib/practice/tallyVoucher";
import { PagesChip, PagesTopUpModal } from "./PagesPanel";
import { refreshPages } from "../lib/pages";
import { Badge, Card, V, formatDate, formatINR } from "../ui";

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

/**
 * Asks Tally to create a ledger that is not there yet. Shown when the typed name is not an existing ledger: a group is
 * chosen, a partner or manager confirms, and the connector creates it and reads it back before the line can use it.
 */
function CreateLedgerBox({ clientId, name, linked, reload }: { clientId: string; name: string; linked: Linked; reload: () => Promise<void> }) {
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const clean = name.replace(/\s+/g, " ").trim();
  const pending = linked.ledgerRequests.find((r) => r.name.trim().toLowerCase() === clean.toLowerCase());
  if (!clean) return null;
  if (pending && pending.status !== "failed") {
    return (
      <div style={{ fontSize: 12.5, color: V.body, display: "flex", gap: 8, alignItems: "center" }}>
        <Loader2 size={14} className="fh-spin" /> Asked Tally to create <b>{pending.name}</b> under {pending.parent}. It appears here as soon as Tally confirms it.
        <button className="v2-btn v2-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }} disabled={pending.status !== "queued"} onClick={async () => { try { await tallyCancelLedger({ data: { id: pending.id } }); await reload(); } catch (e) { toast.error(errMsg(e)); } }}>Cancel</button>
      </div>
    );
  }
  if (!linked.canCreateLedgers) {
    return <div style={{ fontSize: 12.5, color: V.muted }}>"{clean}" is not in Tally. Create it in Tally, or update the connector to 1.5 (Settings, TallyPrime) to create ledgers from here.</div>;
  }
  const create = async () => {
    setBusy(true);
    try {
      await tallyCreateLedger({ data: { business_id: clientId, name: clean, parent: group, allow_similar: confirmed || undefined } });
      toast.success("Asked Tally to create the ledger. It is added the next time the connector checks in.");
      setSimilar(null);
      await reload();
    } catch (e) {
      const m = errMsg(e);
      if (/looks like/i.test(m)) setSimilar(m);
      else toast.error(m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 8, background: V.gray, borderRadius: 12, padding: 12, fontSize: 13 }}>
      <div>
        <b>"{clean}" is not in Tally yet.</b> Create it from here: FynHelp asks Tally, then reads the ledger back to make sure it is there.
        {pending?.status === "failed" && <div role="alert" style={{ color: V.maroon, marginTop: 4 }}>{pending.last_error || "The last attempt did not reach Tally."}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="v2-input" aria-label="Group for the new ledger" value={group} onChange={(e) => setGroup(e.target.value)} style={{ minWidth: 220 }}>
          <option value="">Choose the group…</option>
          {linked.groups.map((g) => <option key={g.name} value={g.name}>{g.name}: {g.use}</option>)}
        </select>
        <button className="v2-btn v2-btn-primary" disabled={!group || busy} onClick={() => void create()}>
          {busy ? <Loader2 size={15} className="fh-spin" /> : <Send size={15} />} Create in Tally
        </button>
      </div>
      {similar && (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: V.maroon }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{similar} Tick this if it really is a different party, then press Create again.</span>
        </label>
      )}
    </div>
  );
}

type ReconViewData = Linked["view"];
type VRow = ReconViewData["rows"][number];

const TAG: Record<string, { bg: string; fg: string; dot: string }> = {
  matched: { bg: "rgba(47,107,79,.10)", fg: "#2f6b4f", dot: "#2f6b4f" },
  partial: { bg: "rgba(176,122,26,.12)", fg: "#8a5d0a", dot: "#b07a1a" },
  missing: { bg: "rgba(169,56,56,.10)", fg: "#a93838", dot: "#a93838" },
  pushed: { bg: "rgba(60,90,160,.10)", fg: "#3b5aa0", dot: "#3b5aa0" },
};

const money = (n: number | null) => (n === null ? "" : formatINR(n));

/**
 * The reconciliation as an accountant reads it: each statement line beside the Tally entry it matched, tagged matched,
 * partly matched or missing in Tally, with debit and credit apart. Only a line missing in Tally offers approval.
 * Debit and credit are as the bank ledger stands in Tally: money in is a debit, money out is a credit.
 */
function ReconView(props: {
  linked: Linked;
  bank: string;
  confirmBank: boolean;
  setConfirmBank: (v: boolean) => void;
  notDup: Record<string, boolean>;
  setNotDup: (f: (cur: Record<string, boolean>) => Record<string, boolean>) => void;
  asSeparate: Record<string, boolean>;
  setAsSeparate: (f: (cur: Record<string, boolean>) => Record<string, boolean>) => void;
  picked: Record<string, boolean>;
  setPicked: (v: Record<string, boolean> | ((cur: Record<string, boolean>) => Record<string, boolean>)) => void;
  filter: "all" | "missing" | "partial" | "matched";
  setFilter: (f: "all" | "missing" | "partial" | "matched") => void;
  lineFor: (id: string) => Line | null;
  card: (l: Line, i: number) => import("react").ReactElement;
  chosenLedger: (l: Line) => string;
  ledgerExists: (name: string) => boolean;
  approveMany: (ids: string[]) => Promise<void>;
  busy: string | null;
}) {
  const { linked, bank } = props;
  const view = linked.view;
  const check = bank ? view.accountChecks[bank] : undefined;
  const mismatch = check?.state === "mismatch";
  const open = (r: VRow) => {
    const l = props.lineFor(r.txn_id);
    return Boolean(l && (!l.posting || l.posting.status === "failed"));
  };
  const rows = view.rows.filter((r) => (props.filter === "all" ? true : props.filter === "missing" ? r.status === "missing" || r.status === "pushed" : r.status === props.filter));
  // A line can be ticked when it is missing, has an existing ledger, and nothing is waiting for a person's word.
  const tickable = (r: VRow) => {
    const l = props.lineFor(r.txn_id);
    if (!l || r.status !== "missing" || !open(r)) return false;
    if (!props.ledgerExists(props.chosenLedger(l))) return false;
    if (r.looksInTally.length && !props.notDup[r.txn_id]) return false;
    if (mismatch && !props.confirmBank) return false;
    return Boolean(bank);
  };
  const ticked = rows.filter((r) => props.picked[r.txn_id] && tickable(r)).map((r) => r.txn_id);
  const allTickable = rows.filter(tickable).map((r) => r.txn_id);

  const Chip = ({ k, n, label }: { k: "all" | "missing" | "partial" | "matched"; n: number; label: string }) => (
    <button
      type="button"
      onClick={() => props.setFilter(k)}
      aria-pressed={props.filter === k}
      className="v2-btn v2-btn-ghost"
      style={{ padding: "4px 12px", fontSize: 12.5, borderRadius: 999, border: `1px solid ${props.filter === k ? V.ink : V.line}`, fontWeight: props.filter === k ? 700 : 500 }}
    >
      {label} <b className="num">{n}</b>
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {check && (
        <div
          role={mismatch ? "alert" : "status"}
          style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, fontSize: 13, background: mismatch ? "rgba(169,56,56,.08)" : check.state === "match" ? "rgba(47,107,79,.07)" : V.gray, color: mismatch ? V.maroon : V.body }}
        >
          {mismatch ? <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} /> : check.state === "match" ? <CheckCircle2 size={16} color={V.green} style={{ flexShrink: 0, marginTop: 2 }} /> : <Link2Off size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
          <div style={{ display: "grid", gap: 6 }}>
            <span>{check.message}</span>
            {mismatch && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={props.confirmBank} onChange={(e) => props.setConfirmBank(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I have checked: this statement belongs to <b>{bank}</b>. Approving stays off until this is ticked.</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Chip k="all" n={view.rows.length} label="All" />
        <Chip k="missing" n={view.counts.missing + view.counts.pushed} label="Missing in Tally" />
        <Chip k="partial" n={view.counts.partial} label="Partly matched" />
        <Chip k="matched" n={view.counts.matched} label="Matched" />
        <span style={{ marginLeft: "auto", fontSize: 12, color: V.muted }}>Debit = money in, credit = money out, as in the bank ledger in Tally</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 13.5, color: V.body, padding: 12, background: V.gray, borderRadius: 12 }}>Nothing to show for this view.</div>
      ) : (
        <Card className="v2-scroll" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
            <thead>
              <tr style={{ height: 32, color: V.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".06em" }}>
                <th style={{ width: 34 }} />
                <th colSpan={4} style={{ textAlign: "left", padding: "8px 10px" }}>Bank statement</th>
                <th colSpan={4} style={{ textAlign: "left", padding: "8px 10px", borderLeft: `1px solid ${V.line}` }}>In Tally</th>
                <th style={{ padding: "8px 10px", textAlign: "left", borderLeft: `1px solid ${V.line}` }}>Status</th>
              </tr>
              <tr className="v2-head2" style={{ height: 28, color: V.muted, fontSize: 11.5 }}>
                <th />
                <th style={{ textAlign: "left", padding: "4px 10px" }}>Date</th>
                <th style={{ textAlign: "left", padding: "4px 10px" }}>Particulars</th>
                <th style={{ textAlign: "right", padding: "4px 10px" }}>Debit</th>
                <th style={{ textAlign: "right", padding: "4px 10px" }}>Credit</th>
                <th style={{ textAlign: "left", padding: "4px 10px", borderLeft: `1px solid ${V.line}` }}>Date</th>
                <th style={{ textAlign: "left", padding: "4px 10px" }}>Entry</th>
                <th style={{ textAlign: "right", padding: "4px 10px" }}>Debit</th>
                <th style={{ textAlign: "right", padding: "4px 10px" }}>Credit</th>
                <th style={{ borderLeft: `1px solid ${V.line}` }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const t = TAG[r.status]!;
                const l = props.lineFor(r.txn_id);
                const showCard = Boolean(l && open(r) && (r.status === "missing" || (r.status === "partial" && props.asSeparate[r.txn_id])));
                const tally = r.status === "matched" ? r.tally : r.status === "partial" && r.nearest ? [r.nearest] : [];
                const first = tally[0];
                const td = { padding: "8px 10px", verticalAlign: "top" as const, borderTop: `1px solid ${V.line}` };
                return (
                  <Fragment key={r.txn_id}>
                    <tr>
                      <td style={{ ...td, textAlign: "center" }}>
                        {r.status === "missing" && l && open(r) ? (
                          <input type="checkbox" aria-label={`Select ${r.particulars} to approve`} disabled={!tickable(r)} checked={Boolean(props.picked[r.txn_id]) && tickable(r)} onChange={(e) => props.setPicked((cur) => ({ ...cur, [r.txn_id]: e.target.checked }))} title={tickable(r) ? "Select to approve with the others" : "Choose an existing ledger (and confirm any warning) to select this line"} />
                        ) : null}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }} className="num">{formatDate(r.date)}</td>
                      <td style={{ ...td, minWidth: 180 }}>
                        <div style={{ fontWeight: 600 }}>{r.particulars}</div>
                        {r.reference && <div style={{ fontSize: 11.5, color: V.muted }}>Ref {r.reference}</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: V.green }} className="num">{money(r.debit)}</td>
                      <td style={{ ...td, textAlign: "right", color: V.maroon }} className="num">{money(r.credit)}</td>
                      <td style={{ ...td, borderLeft: `1px solid ${V.line}`, whiteSpace: "nowrap" }} className="num">{first ? formatDate(first.date) : ""}</td>
                      <td style={{ ...td, minWidth: 180, fontStyle: r.status === "partial" ? "italic" : "normal" }}>
                        {first ? (
                          <>
                            <div>{first.counterparty || first.description || "Entry in Tally"}</div>
                            {tally.length > 1 && <div style={{ fontSize: 11.5, color: V.muted }}>+ {tally.length - 1} more entr{tally.length === 2 ? "y" : "ies"}</div>}
                          </>
                        ) : r.status === "pushed" ? (
                          <span style={{ color: V.muted }}>Written to Tally, waiting for the next sync</span>
                        ) : (
                          <span style={{ color: V.muted }}>Not in Tally</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: V.green }} className="num">{first ? money(splitDr(first)) : ""}</td>
                      <td style={{ ...td, textAlign: "right", color: V.maroon }} className="num">{first ? money(splitCr(first)) : ""}</td>
                      <td style={{ ...td, borderLeft: `1px solid ${V.line}`, minWidth: 190 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.bg, color: t.fg, borderRadius: 999, padding: "2px 10px", fontWeight: 600, fontSize: 12 }}>
                          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: t.dot }} />
                          {r.label}
                        </span>
                        <div style={{ fontSize: 11.5, color: V.muted, marginTop: 4 }}>{r.why}</div>
                        {r.status === "partial" && r.difference && (
                          <div style={{ fontSize: 11.5, color: t.fg, marginTop: 4 }}>
                            {r.difference.amount !== 0 && <>Statement is {formatINR(Math.abs(r.difference.amount))} {r.difference.amount > 0 ? "more" : "less"} than Tally. </>}
                            {r.difference.days !== 0 && <>{Math.abs(r.difference.days)} day{Math.abs(r.difference.days) === 1 ? "" : "s"} {r.difference.days > 0 ? "after" : "before"} the Tally entry.</>}
                          </div>
                        )}
                        {r.status === "partial" && l && open(r) && !props.asSeparate[r.txn_id] && (
                          <button type="button" className="v2-btn v2-btn-ghost" style={{ padding: "2px 8px", fontSize: 12, marginTop: 4 }} onClick={() => props.setAsSeparate((cur) => ({ ...cur, [r.txn_id]: true }))}>
                            This is a separate entry: review for Tally
                          </button>
                        )}
                        {r.status === "missing" && r.looksInTally.length > 0 && l && open(r) && (
                          <div style={{ marginTop: 6, padding: 8, borderRadius: 10, background: "rgba(176,122,26,.12)", color: "#6d4a08", fontSize: 12 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                              <TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                              <span>{r.looksInTally[0]!.warning}</span>
                            </div>
                            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6 }}>
                              <input type="checkbox" checked={Boolean(props.notDup[r.txn_id])} onChange={(e) => props.setNotDup((cur) => ({ ...cur, [r.txn_id]: e.target.checked }))} style={{ marginTop: 2 }} />
                              <span>This is a different transaction, not that entry.</span>
                            </label>
                          </div>
                        )}
                      </td>
                    </tr>
                    {showCard && l && (
                      <tr>
                        <td />
                        <td colSpan={9} style={{ padding: "0 10px 12px" }}>{props.card(l, i)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {allTickable.length > 0 && (
        <div style={{ position: "sticky", bottom: 8, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: V.card, border: `1px solid ${V.line}`, borderRadius: 14, padding: "10px 14px", boxShadow: "0 8px 24px -12px rgba(0,0,0,.25)" }}>
          <span style={{ fontSize: 13 }}><b className="num">{ticked.length}</b> selected</span>
          <button type="button" className="v2-btn v2-btn-ghost" onClick={() => props.setPicked(Object.fromEntries(allTickable.map((id) => [id, true])))}>Select all that are ready ({allTickable.length})</button>
          {ticked.length > 0 && <button type="button" className="v2-btn v2-btn-ghost" onClick={() => props.setPicked({})}>Clear</button>}
          <button type="button" className="v2-btn v2-btn-primary" style={{ marginLeft: "auto" }} disabled={!ticked.length || props.busy === "many"} onClick={() => void props.approveMany(ticked)}>
            {props.busy === "many" ? <Loader2 size={15} className="fh-spin" /> : <Send size={15} />} Approve {ticked.length || ""} for Tally
          </button>
          <span style={{ flexBasis: "100%", fontSize: 12, color: V.muted }}>Each line is approved with the ledger shown on it. Nothing is written until the connector checks in.</span>
        </div>
      )}
    </div>
  );
}

const splitDr = (b: { direction: "in" | "out"; amount: number }) => (b.direction === "in" ? b.amount : null);
const splitCr = (b: { direction: "in" | "out"; amount: number }) => (b.direction === "out" ? b.amount : null);

/** Where the bank ledger chosen for one bank account is remembered, so it is asked once per account and never defaults to another bank. */
const bankKey = (clientId: string, st: { accountNo: string | null; bank: string | null } | null) => {
  const acc = st?.accountNo ? st.accountNo.replace(/\D/g, "").slice(-4) : st?.bank ?? "";
  return acc ? `fh.tallyBankFor.${clientId}.${acc}` : "";
};

export function TallyPosting({ clientId, documentId }: { clientId: string; documentId?: string }) {
  const [bench, setBench] = useState<Bench | null>(null);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [opts, setOpts] = useState<Record<string, Opts>>({});
  const [addPages, setAddPages] = useState(false);
  const [confirmBank, setConfirmBank] = useState(false);
  const [notDup, setNotDup] = useState<Record<string, boolean>>({});
  const [asSeparate, setAsSeparate] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "missing" | "partial" | "matched">("all");
  const [unavailable, setUnavailable] = useState(false);
  const setOpt = (id: string, o: Opts) => setOpts((cur) => ({ ...cur, [id]: { ...cur[id], ...o } }));

  const load = useCallback(async () => {
    try {
      const b = await tallyWorkbench({ data: { business_id: clientId, document_id: documentId } });
      setUnavailable(false);
      setBench(b);
      // The bank ledger comes from the statement (its account number and bank), or from what was chosen for this account before.
      // Only when neither is known does it fall back to the first ledger, and the person is asked to check it.
      if (b.linked)
        setBank((cur) => {
          if (cur && b.bankLedgers.includes(cur)) return cur;
          const key = bankKey(clientId, b.view.statement);
          let remembered = "";
          try {
            remembered = key ? (window.localStorage.getItem(key) ?? "") : "";
          } catch {
            /* no storage */
          }
          if (remembered && b.bankLedgers.includes(remembered)) return remembered;
          return b.view.suggestedBank ?? b.bankLedgers[0] ?? "";
        });
    } catch {
      // Quiet on purpose: if posting is not available yet the panel explains it instead of a red error on every visit.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [clientId, documentId]);

  useEffect(() => {
    setBank("");
    setConfirmBank(false);
  }, [clientId, documentId]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Entries move from "waiting" to "in Tally" on their own while the connector works.
    const t = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  const linked = bench && bench.linked ? bench : null;
  const names = useMemo(() => new Set((linked?.ledgers ?? []).map((l) => l.name.trim().toLowerCase())), [linked]);

  /** Approves one line. Returns the problem in words, or null when it was queued. */
  const approveOne = async (l: Line, ledger: string): Promise<string | null> => {
    try {
      const o = opts[l.txn_id] ?? {};
      let splits: Split[] | undefined;
      if (o.gst && !o.contra) {
        const g = splitGstInclusive(l.amount, o.rate ?? 18, !o.igst);
        splits = [{ ledger, amount: g.base }, ...(o.igst ? [{ ledger: o.tax1 ?? "", amount: g.igst }] : [{ ledger: o.tax1 ?? "", amount: g.cgst }, { ledger: o.tax2 ?? "", amount: g.sgst }])];
      }
      await tallyApprove({ data: { txn_id: l.txn_id, party_ledger: ledger, bank_ledger: bank, kind: o.contra ? "Contra" : undefined, splits, confirm_bank: confirmBank || undefined, confirm_not_duplicate: notDup[l.txn_id] || undefined } });
      return null;
    } catch (e) {
      const m = errMsg(e);
      if (/Add pages/i.test(m)) setAddPages(true);
      return m;
    }
  };
  const approve = async (l: Line, ledger: string) => {
    setBusy(l.txn_id);
    const problem = await approveOne(l, ledger);
    if (problem) toast.error(problem);
    else {
      toast.success("Approved. It will be written to Tally the next time the connector checks in.");
      void refreshPages();
      await load();
    }
    setBusy(null);
  };
  /** Approves the ticked lines one by one. Each is its own approval with its own ledger; one failing does not stop the others. */
  const approveMany = async (ids: string[]) => {
    if (!linked) return;
    setBusy("many");
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      const l = linked.lines.find((x) => x.txn_id === id);
      if (!l) continue;
      const ledger = choice[l.txn_id] ?? (l.suggestion.kind === "suggest" ? l.suggestion.ledger : "");
      const problem = await approveOne(l, ledger);
      if (problem) failed.push(`${l.counterparty || l.description || "A line"}: ${problem}`);
      else ok++;
    }
    setPicked({});
    void refreshPages();
    await load();
    setBusy(null);
    if (ok) toast.success(`${ok} line${ok === 1 ? "" : "s"} approved. They are written to Tally the next time the connector checks in.`);
    if (failed.length) toast.error(`${failed.length} not approved. ${failed[0]}`);
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

  /** The approval controls of one line: ledger, GST or Contra options, and the button. */
  const card = (l: Line, i: number) => {
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
                      title={!typed ? "Choose a ledger first" : !exists ? "This ledger is not in Tally yet. Create it with the button below, then approve." : undefined}
                      onClick={() => void approve(l, typed)}
                    >
                      {busy === l.txn_id ? <Loader2 size={15} className="fh-spin" /> : <Send size={15} />} Approve for Tally
                    </button>
                  </div>
                  {typed.trim() && !exists && <CreateLedgerBox clientId={clientId} name={typed} linked={linked} reload={load} />}
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
                  {typed && !exists && <div style={{ fontSize: 12, color: V.maroon }}>"{typed}" is not a ledger in Tally. Create it with the button below, then approve.</div>}
                </>
              )}
            </motion.div>
          );
  };

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
        <select className="v2-input" value={bank} onChange={(e) => { setBank(e.target.value); const k = bankKey(clientId, linked.view.statement); try { if (k) window.localStorage.setItem(k, e.target.value); } catch { /* no storage */ } }} aria-label="Bank ledger in Tally">
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

      <ReconView
        linked={linked}
        bank={bank}
        confirmBank={confirmBank}
        setConfirmBank={setConfirmBank}
        notDup={notDup}
        setNotDup={setNotDup}
        asSeparate={asSeparate}
        setAsSeparate={setAsSeparate}
        picked={picked}
        setPicked={setPicked}
        filter={filter}
        setFilter={setFilter}
        lineFor={(id) => linked.lines.find((x) => x.txn_id === id) ?? null}
        card={card}
        chosenLedger={(l) => choice[l.txn_id] ?? (l.suggestion.kind === "suggest" ? l.suggestion.ledger : "")}
        ledgerExists={(n) => names.has(n.trim().toLowerCase())}
        approveMany={approveMany}
        busy={busy}
      />
      <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>
        Every entry needs your approval. Nothing is written until the connector on the Tally PC has writing turned on, and each line is written once. Only typed or printed documents are read reliably: handwritten documents are not supported, and unclear lines go to the Review Queue instead of being guessed.
      </p>
    </section>
  );
}
