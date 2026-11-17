import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Circle, Clock, Lock, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { Badge, Card, Modal, V, formatDate } from "../ui";
import { useV2 } from "../store";
import { parsePeriod } from "@/lib/practice/core";
import {
  acceptPracticeStatement,
  addPracticeExpectedStatement,
  confirmPracticeCloseStep,
  getPracticeClientClose,
  removePracticeExpectedStatement,
} from "@/lib/practice/practice.functions";
import { CLOSE_LABEL, closeState, mayConfirm, type StepState } from "@/lib/practice/close/steps";
import { AgentTrace } from "./AgentTrace";

type Data = Awaited<ReturnType<typeof getPracticeClientClose>>;
const msg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const today = () => new Date().toISOString().slice(0, 10);

export const STATE_TONE = { not_started: "neutral", in_progress: "info", bank_books_closed: "warn", fully_closed: "good" } as const;

/** The progress bar and the two closure states, side by side: they are different things and a CA reads them apart. */
export function CloseSummary({ state, done, total, bankBooks }: { state: keyof typeof STATE_TONE; done: number; total: number; bankBooks: boolean }) {
  const pct = Math.round((done / Math.max(1, total)) * 100);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone={STATE_TONE[state]}>{CLOSE_LABEL[state]}</Badge>
        <span style={{ fontSize: 13, color: V.body }}>{done} of {total} steps done</span>
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Close progress" style={{ height: 8, borderRadius: 999, background: V.gray, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ height: "100%", background: state === "fully_closed" ? V.green : V.brand, borderRadius: 999 }} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
        <span style={{ color: bankBooks ? V.green : V.muted, display: "inline-flex", gap: 5, alignItems: "center" }}>{bankBooks ? <CheckCircle2 size={14} /> : <Circle size={14} />} Bank and Books Closed</span>
        <span style={{ color: state === "fully_closed" ? V.green : V.muted, display: "inline-flex", gap: 5, alignItems: "center" }}>{state === "fully_closed" ? <CheckCircle2 size={14} /> : <Circle size={14} />} Fully Closed</span>
      </div>
    </div>
  );
}

function StepIcon({ s, late }: { s: StepState; late: boolean }) {
  if (s.status === "done") return <CheckCircle2 size={20} color={V.green} aria-label="Done" />;
  if (s.status === "blocked") return <AlertTriangle size={20} color={V.maroon} aria-label="Blocked" />;
  return late ? <Clock size={20} color={V.maroon} aria-label="Late" /> : <Circle size={20} color={V.muted} aria-label="Waiting" />;
}

const KIND_NOTE: Record<StepState["kind"], string> = { auto: "Checked by FynHelp", staff: "Confirmed by a team member", authorized: "Confirmed by a partner or manager", partner: "Partner sign-off" };

/** The client's month-end close: system-checked steps, steps a person confirms, statement verification, and expected statements. */
export function CloseChecklist({ clientId, onTab }: { clientId: string; onTab: (tab: string) => void }) {
  const { period, docs, exceptions, reports } = useV2();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<StepState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState<{ id: string; name: string } | null>(null);
  const [acceptNote, setAcceptNote] = useState("");
  const [label, setLabel] = useState("");
  const [tailDigits, setTailDigits] = useState("");

  let key = "";
  try { key = parsePeriod(period).key; } catch { key = ""; }

  const load = useCallback(async () => {
    if (!key) return;
    try {
      setData(await getPracticeClientClose({ data: { business_id: clientId, period: key } }));
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  }, [clientId, key]);
  // Read again when the month, the client, or the work underneath changes.
  useEffect(() => { void load(); }, [load, docs.length, exceptions.length, reports.length]);

  if (!key) return <Card><p style={{ margin: 0, color: V.muted }}>Pick a single month in the top bar to see its close checklist.</p></Card>;
  if (error) return <Card><p style={{ margin: 0, color: V.maroon }}>{error}</p></Card>;
  if (!data) return <Card><AgentTrace agent="recon" title="Reading the month" steps={["Reading the statements", "Checking each against the bank's own figures", "Counting what is still open", "Checking who has confirmed what"]} /></Card>;
  const sum = data.summary;
  if (!sum) return <Card><p style={{ margin: 0, color: V.muted }}>This client was not found.</p></Card>;
  const cs = closeState(sum.steps);
  const role = data.role;
  const todayIso = today();
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (e) {
      toast.error(msg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const group = (phase: "bank_books" | "full", title: string, sub: string) => (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "16px 20px 6px" }}>
        <div style={{ fontWeight: 600, color: V.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, color: V.muted }}>{sub}</div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: "4px 0 8px" }}>
        {sum.steps.filter((s) => s.phase === phase).map((s) => {
          const late = s.status !== "done" && s.dueOn < todayIso;
          const manual = s.kind === "staff" || s.kind === "authorized";
          return (
            <li key={s.key} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, padding: "12px 20px", borderTop: `1px solid ${V.line}`, alignItems: "start" }} data-testid={`step-${s.key}`}>
              <StepIcon s={s} late={late} />
              <div>
                <div style={{ fontWeight: 600, color: V.ink }}>{s.label}</div>
                <div style={{ fontSize: 13, color: s.status === "blocked" ? V.maroon : V.body, marginTop: 2 }}>{s.detail}</div>
                <div style={{ fontSize: 12, color: V.muted, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>{s.kind === "auto" ? <Zap size={12} /> : <Lock size={12} />}{KIND_NOTE[s.kind]}</span>
                  {s.status === "done" && s.doneBy && <span>· {s.doneBy === "FynHelp" ? "verified by FynHelp" : `${s.doneBy}${s.doneAt ? `, ${formatDate(s.doneAt.slice(0, 10))}` : ""}`}</span>}
                  {s.status !== "done" && <span style={{ color: late ? V.maroon : V.muted, fontWeight: late ? 600 : 400 }}>· due {formatDate(s.dueOn)}{late ? " (late)" : ""}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {manual && s.status !== "done" && mayConfirm(role, s.kind) && <button className="bx-btn bx-sm bx-primary" disabled={busy} onClick={() => { setConfirming(s); setNote(""); }}>Confirm</button>}
                {manual && s.status !== "done" && !mayConfirm(role, s.kind) && <span style={{ fontSize: 12, color: V.muted }}>A partner or manager confirms</span>}
                {manual && s.status === "done" && mayConfirm(role, s.kind) && <button className="bx-btn bx-sm" disabled={busy} onClick={() => void act(() => confirmPracticeCloseStep({ data: { business_id: clientId, period: key, step: s.key, confirm: false } }), "Taken back.")}>Take back</button>}
                {s.status !== "done" && s.key === "docs_received" && <button className="bx-btn bx-sm" onClick={() => onTab("documents")}>Open documents</button>}
                {s.status !== "done" && (s.key === "recon_done") && <button className="bx-btn bx-sm" onClick={() => onTab("recon")}>Open recon</button>}
                {s.status !== "done" && s.key === "exceptions_explained" && <button className="bx-btn bx-sm" onClick={() => onTab("exceptions")}>Open exceptions</button>}
                {s.status !== "done" && (s.key === "mis_prepared" || s.key === "mis_reviewed" || s.key === "partner_signoff") && <button className="bx-btn bx-sm" onClick={() => onTab("mis")}>Open MIS</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="close-checklist">
      <Card>
        <CloseSummary state={cs.state} done={cs.done} total={cs.total} bankBooks={cs.bankBooks} />
        {cs.next && <p style={{ margin: "14px 0 0", fontSize: 13.5, color: V.body }}>Next: <b style={{ color: V.ink }}>{cs.next.label}</b>. {cs.next.detail}</p>}
        <p style={{ margin: "10px 0 0", fontSize: 12, color: V.muted }}>FynHelp does not file GST or pay TDS, and does not know whether you did. Those steps stay waiting until a partner or manager confirms them here.</p>
        {sum.notes.map((n) => <p key={n} style={{ margin: "8px 0 0", fontSize: 12.5, color: V.warnFg }}>{n}</p>)}
      </Card>

      {group("bank_books", "Bank and books", "FynHelp checks these from the documents and reconciliation.")}
      {group("full", "Statutory, MIS and sign-off", "Confirmed by people. A month is Fully Closed only when every step above and below is done.")}

      <Card>
        <div style={{ fontWeight: 600, color: V.ink, marginBottom: 4 }}>Bank statements for {period}</div>
        {sum.statements.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: V.muted }}>No statement covering this month has been read yet.</p> : (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {sum.statements.map((st) => (
              <div key={st.id} style={{ background: V.gray, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <ShieldCheck size={16} color={st.verification.result === "passed" ? V.green : st.verification.result === "failed" ? V.maroon : V.muted} />
                  <span style={{ fontWeight: 600 }}>{st.filename}</span>
                  {st.accountTail && <span style={{ color: V.muted, fontSize: 12.5 }}>account …{st.accountTail}</span>}
                  <Badge tone={st.verification.result === "passed" ? "good" : st.verification.result === "failed" ? "bad" : "neutral"}>{st.verification.label}</Badge>
                  {st.verification.held && <Badge tone="warn">Held</Badge>}
                </div>
                {st.verification.reasons.map((r) => <div key={r} style={{ fontSize: 12.5, color: V.body }}>{r}</div>)}
                {st.verification.acceptedBy && <div style={{ fontSize: 12.5, color: V.muted }}>Accepted by {st.verification.acceptedBy}.</div>}
                {st.verification.held && (
                  <div>
                    {["owner", "admin", "partner", "manager"].includes(role)
                      ? <button className="bx-btn bx-sm" onClick={() => { setAccepting({ id: st.id, name: st.filename }); setAcceptNote(""); }}>Accept with a reason</button>
                      : <span style={{ fontSize: 12.5, color: V.muted }}>A partner or manager can accept this statement with a reason, or upload a corrected one.</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight: 600, color: V.ink }}>Expected bank statements</div>
        <p style={{ margin: "2px 0 10px", fontSize: 12.5, color: V.muted }}>List each account this client must send every month. “All expected statements received” is checked against this list; with the last 4 digits, a statement of another account does not count.</p>
        <div style={{ display: "grid", gap: 6 }}>
          {sum.requirements.length === 0 && <div style={{ fontSize: 13, color: V.muted }}>None set up yet.</div>}
          {sum.requirements.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
              <span style={{ fontWeight: 600 }}>{r.label}</span>
              {r.accountTail && <span style={{ color: V.muted }}>…{r.accountTail}</span>}
              <button className="v2-icon-btn" aria-label={`Remove ${r.label}`} title="Remove" style={{ marginLeft: "auto" }} onClick={() => void act(() => removePracticeExpectedStatement({ data: { id: r.id } }), "Removed.")}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }} onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => addPracticeExpectedStatement({ data: { business_id: clientId, label, account_tail: tailDigits.trim() || null } }), "Added.")) { setLabel(""); setTailDigits(""); }
        }}>
          <input className="v2-input" style={{ flex: 1, minWidth: 200 }} placeholder="For example: HDFC current account" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Account name" />
          <input className="v2-input" style={{ width: 130 }} placeholder="Last 4 digits" inputMode="numeric" maxLength={8} value={tailDigits} onChange={(e) => setTailDigits(e.target.value)} aria-label="Last 4 digits of the account" />
          <button className="bx-btn bx-primary" type="submit" disabled={busy || !label.trim()}><Plus size={14} /> Add</button>
        </form>
      </Card>

      {data.history.length > 0 && (
        <Card>
          <div style={{ fontWeight: 600, color: V.ink, marginBottom: 8 }}>Who confirmed what</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6, fontSize: 13 }}>
            {data.history.map((h, i) => (
              <li key={i} style={{ color: V.body }}>
                <b style={{ color: V.ink }}>{h.by}</b> {h.action === "confirmed" ? "confirmed" : "took back"} “{sum.steps.find((s) => s.key === h.step)?.label ?? h.step}” · <span style={{ color: V.muted }}>{formatDate(h.at.slice(0, 10))}</span>{h.note ? <span style={{ color: V.muted }}> — {h.note}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={confirming !== null} onClose={() => (busy ? undefined : setConfirming(null))} title={confirming ? `Confirm: ${confirming.label}` : ""}>
        {confirming && (
          <>
            <p style={{ marginTop: 0, fontSize: 13, color: V.body, lineHeight: 1.6 }}>{confirming.help} Your name and the time are recorded.</p>
            <label className="v2-label" htmlFor="close-note">Note (optional)</label>
            <textarea id="close-note" className="v2-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={confirming.key === "gst" ? "For example: GSTR-3B filed 20 Nov, ARN …" : confirming.key === "tds" ? "For example: challan 281 paid 7 Nov" : "Anything the next person should know"} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="bx-btn" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
              <button className="bx-btn bx-primary" disabled={busy} onClick={async () => { if (await act(() => confirmPracticeCloseStep({ data: { business_id: clientId, period: key, step: confirming.key, confirm: true, note: note.trim() || undefined } }), "Confirmed.")) setConfirming(null); }}>{busy ? "Saving…" : "Confirm"}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={accepting !== null} onClose={() => (busy ? undefined : setAccepting(null))} title={accepting ? `Accept ${accepting.name}` : ""}>
        {accepting && (
          <>
            <p style={{ marginTop: 0, fontSize: 13, color: V.body, lineHeight: 1.6 }}>This statement did not pass its checks. Accepting it keeps every line exactly as read and records that you decided it can be used, and why. If a page is really missing, upload a corrected statement instead.</p>
            <label className="v2-label" htmlFor="accept-note">Why it can be accepted (required)</label>
            <textarea id="accept-note" className="v2-input" rows={3} value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} placeholder="For example: page 3 is blank in the bank's original PDF" />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="bx-btn" onClick={() => setAccepting(null)} disabled={busy}>Cancel</button>
              <button className="bx-btn bx-primary" disabled={busy || acceptNote.trim().length < 10} onClick={async () => { if (await act(() => acceptPracticeStatement({ data: { id: accepting.id, note: acceptNote.trim() } }), "Accepted.")) setAccepting(null); }}>{busy ? "Saving…" : "Accept statement"}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/** One line on the client's Overview: where the real month-end close stands, with a way in. It reads the same checklist as the Month-end close tab. */
export function CloseOverviewLine({ clientId, onOpen }: { clientId: string; onOpen: () => void }) {
  const { period, docs, exceptions, reports } = useV2();
  const [data, setData] = useState<Data | null>(null);
  let key = "";
  try { key = parsePeriod(period).key; } catch { key = ""; }
  useEffect(() => {
    if (!key) return;
    let live = true;
    void getPracticeClientClose({ data: { business_id: clientId, period: key } }).then((d) => live && setData(d)).catch(() => undefined);
    return () => { live = false; };
  }, [clientId, key, docs.length, exceptions.length, reports.length]);
  const sum = data?.summary;
  if (!sum) return null;
  const cs = closeState(sum.steps);
  return (
    <Card style={{ marginBottom: 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }} data-testid="close-overview-line">
      <div>
        <div style={{ fontWeight: 600, color: V.ink }}>Month-end close for {period}</div>
        <div style={{ fontSize: 13, color: V.body, marginTop: 2 }}>
          <Badge tone={STATE_TONE[cs.state]}>{CLOSE_LABEL[cs.state]}</Badge> <span style={{ marginLeft: 6 }}>{cs.done} of {cs.total} steps{cs.next ? ` · next: ${cs.next.label}` : ""}</span>
        </div>
      </div>
      <button className="bx-btn bx-sm" onClick={onOpen}>Open the checklist</button>
    </Card>
  );
}
