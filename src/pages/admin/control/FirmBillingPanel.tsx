import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { adminAdjustCredits, adminFirmBilling, adminSetFirmPlan, adminWaiveCharge } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { MAX_CREDIT_ADJUST, MIN_REASON, canWaiveCharge, creditAdjustProblem, cleanReason, cycleLabel, manualPlanEnd, planFitsUsage } from "@/lib/admin/planAdjust";
import { PLANS, TRIAL_MAX_ACTIVE_CLIENTS, TRIAL_MAX_DOCUMENTS, changeTiming, documentAllowance, type Cycle, type PlanKey } from "@/lib/practice/billing/plans";
import { Btn, ErrorNote, Pill, day, line, maroon, muted, when } from "./ui";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const STATUS: Record<string, { label: string; tone: "good" | "info" | "warn" | "bad" }> = {
  trialing: { label: "Free trial", tone: "info" },
  active: { label: "Active", tone: "good" },
  pending: { label: "Starting", tone: "info" },
  past_due: { label: "Payment retrying", tone: "warn" },
  halted: { label: "Payment failed", tone: "bad" },
  cancelled: { label: "Ends on a date", tone: "warn" },
};
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Open = null | "plan" | "credits";

/** One block that opens and closes smoothly. */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Meter({ label, used, limit, note, testId }: { label: string; used: number; limit: number | null; note: string; testId: string }) {
  const reduce = useReducedMotion();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = limit && used >= limit ? maroon : limit && used >= limit * 0.8 ? "#B45309" : "#1F6B45";
  return (
    <div data-testid={testId}>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="tabular-nums font-semibold">{num(used)}{limit != null ? ` / ${num(limit)}` : ""}</span>
      </div>
      {limit != null && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(23,18,8,.08)" }}>
          <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ height: "100%", background: tone }} />
        </div>
      )}
      <div className="text-[11px] mt-1" style={{ color: muted }}>{note}</div>
    </div>
  );
}

/** Plan, credits and this month's usage for one firm, with the changes an admin may make. */
export function FirmBillingPanel({ firmId, canAdjust }: { firmId: string; canAdjust: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "firm-billing", firmId], queryFn: () => adminCall(() => adminFirmBilling({ data: { firmId } })) });
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  // plan form
  const [plan, setPlan] = useState<PlanKey | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [endsOn, setEndsOn] = useState(plusDays(30));
  const [byHand, setByHand] = useState(false);
  const [endRz, setEndRz] = useState(false);
  // credits form
  const [mode, setMode] = useState<"add" | "take">("add");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [waive, setWaive] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState("");

  const b = q.data;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin", "firm-billing", firmId] }), qc.invalidateQueries({ queryKey: ["admin", "firm", firmId] }), qc.invalidateQueries({ queryKey: ["admin", "firms"] })]);
  const close = () => { setOpen(null); setConfirming(false); setReason(""); setAmount(""); setPlan(null); setCycle(null); setByHand(false); setEndRz(false); };
  const toggle = (o: Exclude<Open, null>) => { setConfirming(false); setReason(""); setOpen((cur) => (cur === o ? null : o)); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await adminCall(fn);
      toast.success(ok);
      close();
      await refresh();
    } catch (e) {
      toast.error(adminError(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (q.error) return <ErrorNote error={q.error} />;
  if (!b) return <div className="rounded-xl p-3 text-sm" style={{ border: `1px solid ${line}`, color: muted }}>Loading plan and credits…</div>;

  const st = STATUS[b.status] ?? { label: b.status, tone: "info" as const };
  const shownPlan = PLANS[b.onTrial ? "professional" : b.plan];
  const clientLimit = b.onTrial ? TRIAL_MAX_ACTIVE_CLIENTS : shownPlan.maxActiveClients;
  const docLimit = b.onTrial ? TRIAL_MAX_DOCUMENTS : documentAllowance(b.plan, b.usage.activeClients);

  /* plan preview */
  const toPlan = plan ?? b.plan;
  const toCycle = cycle ?? b.cycle;
  // A firm paying through Razorpay can be switched there, or given a manual plan (which ends that subscription).
  const paysRz = b.route === "razorpay";
  const manualMode = byHand || b.route !== "razorpay";
  const razorpay = paysRz && !manualMode;
  const timing = razorpay ? changeTiming({ plan: b.plan, cycle: b.cycle }, { plan: toPlan, cycle: toCycle }) : null;
  const misfit = planFitsUsage(toPlan, b.usage.activeClients);
  const end = manualMode ? manualPlanEnd(endsOn) : null;
  const needEndRz = paysRz && manualMode;
  const planProblem = razorpay && timing === "same" ? "The firm is already on this plan." : misfit ?? (end && !end.ok ? end.problem : null);
  const planReasonOk = cleanReason(reason).length >= MIN_REASON;
  const planPreview = razorpay
    ? timing === "now"
      ? `Upgrade now. Razorpay charges only the pro-rated difference, and the firm is emailed. This month's extra credits are not added: use Add credits if you want to.`
      : `Takes effect at the next renewal${b.periodEnd ? ` (${day(b.periodEnd)})` : ""}. Nothing is charged or refunded now, and the firm is emailed.`
    : `Gives ${PLANS[toPlan].name} (${cycleLabel(toCycle)}) until ${end?.ok ? day(end.endsAt) : "the date you choose"}. It is not billed and never renews. The firm can still choose its own paid plan. It is not emailed: tell them.`;

  /* credits preview */
  const n = Math.abs(Math.round(Number(amount) || 0));
  const delta = mode === "add" ? n : -n;
  const creditProblem = n === 0 ? null : creditAdjustProblem(delta, reason || "ok-reason", b.credits.balance);
  const creditReady = n > 0 && !creditProblem && planReasonOk;

  return (
    <div className="rounded-xl p-3" style={{ border: `1px solid ${line}` }} data-testid="firm-billing">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="font-semibold">Plan, credits and usage</div>
        {b.isTest && <Pill tone="info">Test firm: never billed</Pill>}
      </div>

      <div className="text-sm mb-3" data-testid="firm-plan-summary">
        <b>{shownPlan.name}</b>{b.onTrial ? " (trial)" : `, ${cycleLabel(b.cycle)}`} <Pill tone={st.tone}>{st.label}</Pill>
        {b.periodEnd && !b.onTrial && <span style={{ color: muted }}> · {b.cancelAtPeriodEnd || b.status === "cancelled" ? "ends" : "renews"} {day(b.periodEnd)}</span>}
        {b.scheduled && <div className="text-xs mt-1" style={{ color: muted }}>Switches to {PLANS[b.scheduled.plan].name} ({cycleLabel(b.scheduled.cycle)}) at renewal.</div>}
        <div className="text-xs mt-1" style={{ color: muted }}>{b.route === "razorpay" ? "Pays through Razorpay: switch the plan there, or assign one manually (that ends the subscription)." : b.route === "manual" ? "No Razorpay subscription: a plan given here is manual, dated and never billed." : "Cancelled and ending: a plan can still be assigned manually."}</div>
      </div>

      <div className="grid gap-3 mb-3 sm:grid-cols-2">
        <Meter testId="firm-usage-clients" label={`Active clients, ${monthName(b.usage.month)}`} used={b.usage.activeClients} limit={clientLimit ?? null} note={b.onTrial ? `The trial covers ${TRIAL_MAX_ACTIVE_CLIENTS}.` : `${shownPlan.clientsIncluded} included, then ${inr(shownPlan.extraClient)} each.`} />
        <Meter testId="firm-usage-docs" label="Documents this month" used={b.usage.documents} limit={docLimit} note={b.onTrial ? `The trial covers ${TRIAL_MAX_DOCUMENTS}.` : "Past the allowance, ₹499 per 250 on the next invoice."} />
      </div>
      <p className="text-[11px] mb-3" style={{ color: muted }}>Usage is counted from what the firm actually did, so it cannot be edited. A charge for it that failed to go out can be waived below.</p>

      <div className="flex items-baseline gap-2 mb-1" data-testid="firm-credits">
        <span className="text-2xl font-semibold tabular-nums">{num(b.credits.balance)}</span>
        <span className="text-xs" style={{ color: muted }}>WhatsApp credits · plan adds {num(b.credits.monthly)} a month</span>
      </div>

      {canAdjust && !b.isTest && !b.isDemo && (
        <div className="flex flex-wrap gap-2 my-3">
          <Btn kind={open === "plan" ? "primary" : undefined} onClick={() => toggle("plan")} testId="open-change-plan">Change plan</Btn>
          <Btn kind={open === "credits" ? "primary" : undefined} onClick={() => toggle("credits")} testId="open-adjust-credits">Add or take back credits</Btn>
        </div>
      )}

      <Reveal show={open === "plan"}>
        <div className="rounded-lg p-3 mb-3 grid gap-2" style={{ background: "rgba(23,18,8,.03)" }} data-testid="plan-form">
          {paysRz && (
            <div role="group" aria-label="How to change the plan" className="inline-flex rounded-lg overflow-hidden justify-self-start" style={{ border: `1px solid ${line}` }}>
              {([false, true] as const).map((hand) => (
                <button key={String(hand)} type="button" aria-pressed={byHand === hand} onClick={() => { setByHand(hand); setConfirming(false); setEndRz(false); }} className="px-3 py-1.5 text-sm font-semibold" style={{ background: byHand === hand ? maroon : "#fff", color: byHand === hand ? "#fff" : "#171208" }} data-testid={hand ? "plan-mode-manual" : "plan-mode-razorpay"}>
                  {hand ? "Assign manually" : "Switch in Razorpay"}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <select className="rounded-lg border px-3 py-2 text-sm" aria-label="Plan" value={toPlan} onChange={(e) => { setPlan(e.target.value as PlanKey); setConfirming(false); }} data-testid="plan-select">
              {(Object.keys(PLANS) as PlanKey[]).map((k) => <option key={k} value={k}>{PLANS[k].name}</option>)}
            </select>
            <select className="rounded-lg border px-3 py-2 text-sm" aria-label="Billing period" value={toCycle} onChange={(e) => { setCycle(e.target.value as Cycle); setConfirming(false); }}>
              <option value="monthly">Monthly</option>
              <option value="annual">Yearly</option>
            </select>
            {manualMode && (
              <label className="flex items-center gap-2 text-sm">Ends on <input type="date" className="rounded-lg border px-2 py-1.5" min={plusDays(1)} value={endsOn} onChange={(e) => { setEndsOn(e.target.value); setConfirming(false); }} data-testid="plan-ends" /></label>
            )}
          </div>
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Reason (required, kept in the audit log)" value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} maxLength={300} data-testid="plan-reason" />
          <p className="text-xs" style={{ color: planProblem ? maroon : muted }} data-testid="plan-preview">{planProblem ?? planPreview}</p>
          {needEndRz && (
            <label className="flex items-start gap-2 text-xs" style={{ color: maroon }}>
              <input type="checkbox" className="mt-0.5" checked={endRz} onChange={(e) => { setEndRz(e.target.checked); setConfirming(false); }} data-testid="plan-end-razorpay" />
              <span>This firm pays through Razorpay. Assigning by hand <b>cancels its Razorpay subscription now</b>, so it is not billed twice. No refund is issued. I understand.</span>
            </label>
          )}
          <div className="flex gap-2">
            {!confirming ? (
              <Btn kind="primary" disabled={busy || !!planProblem || !planReasonOk || (needEndRz && !endRz)} onClick={() => setConfirming(true)} testId="plan-review">Review change</Btn>
            ) : (
              <Btn kind="danger" disabled={busy} testId="plan-confirm" onClick={() => void run(() => adminSetFirmPlan({ data: { firmId, plan: toPlan, cycle: toCycle, endsOn: manualMode ? endsOn : null, reason, mode: manualMode ? "manual" : "auto", endRazorpay: endRz } }), razorpay ? (timing === "now" ? "Plan upgraded in Razorpay." : "Plan change scheduled for renewal.") : `${PLANS[toPlan].name} given until ${end?.ok ? day(end.endsAt) : ""}.`)}>
                {busy ? "Working…" : `Confirm: ${PLANS[toPlan].name}, ${cycleLabel(toCycle)}`}
              </Btn>
            )}
            <Btn disabled={busy} onClick={close}>Cancel</Btn>
          </div>
        </div>
      </Reveal>

      <Reveal show={open === "credits"}>
        <div className="rounded-lg p-3 mb-3 grid gap-2" style={{ background: "rgba(23,18,8,.03)" }} data-testid="credits-form">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Add or take back" className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${line}` }}>
              {(["add", "take"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setConfirming(false); }} className="px-3 py-1.5 text-sm font-semibold" style={{ background: mode === m ? maroon : "#fff", color: mode === m ? "#fff" : "#171208" }} data-testid={`credits-${m}`}>
                  {m === "add" ? "Add" : "Take back"}
                </button>
              ))}
            </div>
            <input type="number" min={1} max={MAX_CREDIT_ADJUST} className="w-28 rounded-lg border px-3 py-2 text-sm tabular-nums" placeholder="Credits" value={amount} onChange={(e) => { setAmount(e.target.value); setConfirming(false); }} data-testid="credits-amount" aria-label="Number of credits" />
            {[100, 500, 2000].map((c) => (
              <button key={c} type="button" className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ border: `1px solid ${line}` }} onClick={() => { setAmount(String(c)); setConfirming(false); }}>{num(c)}</button>
            ))}
          </div>
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Reason (required; the firm sees it in its credit history)" value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} maxLength={300} data-testid="credits-reason" />
          <p className="text-xs tabular-nums" style={{ color: creditProblem ? maroon : muted }} data-testid="credits-preview">
            {creditProblem ?? (n > 0 ? `Balance ${num(b.credits.balance)} → ${num(Math.max(0, b.credits.balance + delta))}.${mode === "add" ? " Added credits last 12 months." : " Credits that expire first are taken first."}` : "Enter how many credits.")}
          </p>
          <div className="flex gap-2">
            {!confirming ? (
              <Btn kind="primary" disabled={busy || !creditReady} onClick={() => setConfirming(true)} testId="credits-review">Review change</Btn>
            ) : (
              <Btn kind="danger" disabled={busy} testId="credits-confirm" onClick={() => void run(() => adminAdjustCredits({ data: { firmId, delta, reason } }), `${mode === "add" ? "Added" : "Took back"} ${num(n)} credits.`)}>
                {busy ? "Working…" : `Confirm: ${mode === "add" ? "add" : "take back"} ${num(n)}`}
              </Btn>
            )}
            <Btn disabled={busy} onClick={close}>Cancel</Btn>
          </div>
        </div>
      </Reveal>

      {b.credits.recent.length > 0 && (
        <details className="text-xs mb-1">
          <summary className="cursor-pointer" style={{ color: muted }}>Recent credit activity</summary>
          <ul className="mt-1 grid gap-0.5">
            {b.credits.recent.map((r, i) => (
              <li key={i} className="flex justify-between gap-3"><span className="truncate">{r.note ?? r.reason}</span><span className="tabular-nums" style={{ color: r.delta > 0 ? "#1F6B45" : undefined }}>{r.delta > 0 ? "+" : ""}{r.delta} · {when(r.at)}</span></li>
            ))}
          </ul>
        </details>
      )}

      {b.charges.length > 0 && (
        <div className="mt-3" data-testid="firm-charges">
          <div className="text-xs font-semibold mb-1">Monthly usage charges</div>
          <ul className="grid gap-1 text-xs">
            {b.charges.map((c) => (
              <li key={c.month}>
                <div className="flex items-center justify-between gap-2">
                  <span>{monthName(c.month)} · {c.activeClients} clients · {num(c.documents)} docs · {c.total > 0 ? `${inr(c.total)} incl. GST` : "inside plan"}</span>
                  <span className="flex items-center gap-2">
                    <Pill tone={c.status === "paid" ? "good" : c.status === "failed" ? "warn" : "info"}>{c.status === "none" ? "inside plan" : c.status}</Pill>
                    {canAdjust && canWaiveCharge(c.status) && <Btn onClick={() => { setWaive(waive === c.month ? null : c.month); setWaiveReason(""); }} testId={`waive-${c.month}`}>Waive</Btn>}
                  </span>
                </div>
                <Reveal show={waive === c.month}>
                  <div className="flex flex-wrap gap-2 py-2">
                    <input className="flex-1 min-w-[180px] rounded-lg border px-3 py-1.5 text-sm" placeholder="Reason (required)" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} maxLength={300} data-testid="waive-reason" />
                    <Btn kind="danger" disabled={busy || cleanReason(waiveReason).length < MIN_REASON} testId="waive-confirm" onClick={() => void run(() => adminWaiveCharge({ data: { firmId, month: c.month, reason: waiveReason } }), `${monthName(c.month)} charge waived.`).then(() => setWaive(null))}>
                      Waive {inr(c.total)}
                    </Btn>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
