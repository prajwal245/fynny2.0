/**
 * WhatsApp credits for the screens: a compact chip for the Chaser, a full panel for Settings → Billing,
 * and one top-up window that both open. 1 credit = 1 WhatsApp reminder from FynHelp's number.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Coins, MessageCircle, Zap } from "lucide-react";
import { Badge, Card, Modal, V, formatDate, type Tone } from "../ui";
import { useV2 } from "../store";
import { confirmPracticeCreditTopUp, savePracticeCreditSettings, startPracticeCreditTopUp } from "@/lib/practice/practice.functions";
import { AUTO_MAX_CHOICES, lowThreshold, pricePerCredit, remindersLeft, type CreditLevel } from "@/lib/practice/billing/credits";
import { loadRazorpay } from "../lib/billing";
import { refreshCredits, setCredits, useCredits, type Credits } from "../lib/credits";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const LEVEL: Record<CreditLevel, { tone: Tone; color: string }> = {
  ok: { tone: "good", color: V.green },
  low: { tone: "warn", color: "#B45309" },
  out: { tone: "bad", color: V.maroon },
};

type RzpOrderResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RzpCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: (r: { error?: { description?: string } }) => void) => void };

/** Opens Razorpay for a pack and adds the credits when the payment is verified. */
export function useTopUp() {
  const { session } = useV2();
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (pack: "c500" | "c2000" | "c5000", done?: () => void) => {
    setBusy(pack);
    try {
      const [o] = await Promise.all([startPracticeCreditTopUp({ data: { pack } }), loadRazorpay()]);
      const Razorpay = (window as unknown as { Razorpay: RzpCtor }).Razorpay;
      const rzp = new Razorpay({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amount,
        currency: "INR",
        name: "FynHelp",
        description: `WhatsApp credits: ${o.packLabel}`,
        prefill: { email: session?.email ?? "", name: session?.name ?? "" },
        notes: { firm: o.firmName },
        theme: { color: "#8A1E18" },
        modal: { ondismiss: () => setBusy(null) },
        handler: async (r: RzpOrderResponse) => {
          try {
            setCredits(await confirmPracticeCreditTopUp({ data: r }));
            toast.success(`${o.packLabel} added. Reminders will keep going out.`);
            done?.();
          } catch (e) {
            toast.error(errMsg(e));
            void refreshCredits();
          } finally {
            setBusy(null);
          }
        },
      });
      rzp.on("payment.failed", (r) => {
        toast.error(r.error?.description ?? "The payment did not go through. Try again or use another method.");
        setBusy(null);
      });
      rzp.open();
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(null);
    }
  };
  return { busy, buy };
}

/** The window to add credits: three packs, the price per reminder, and the optional automatic top-up. */
export function TopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCredits(open);
  const { busy, buy } = useTopUp();
  return (
    <Modal open={open} onClose={onClose} title="Add WhatsApp credits">
      {!c ? (
        <div style={{ color: V.muted, fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 13.5, color: V.body, lineHeight: 1.6 }}>
            1 credit sends 1 WhatsApp reminder from FynHelp's number. You have <b style={{ color: V.ink }}>{c.balance.toLocaleString("en-IN")}</b> now. Credits last 12 months, so nothing is wasted in a quiet month.
          </div>
          <div style={{ display: "grid", gap: 10 }} data-testid="credit-packs">
            {c.packs.map((p) => (
              <button
                key={p.key}
                className="v2-lift"
                disabled={!!busy || !c.paymentsReady}
                onClick={() => buy(p.key, onClose)}
                style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderRadius: 14, border: `1px solid ${p.tag === "Most popular" ? V.coral : V.line}`, background: V.card, cursor: busy ? "wait" : "pointer", font: "inherit" }}
              >
                <span style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontWeight: 650, fontSize: 15 }}>
                    {p.label} {p.tag && <Badge tone={p.tag === "Most popular" ? "info" : "good"}>{p.tag}</Badge>}
                  </span>
                  <span style={{ fontSize: 12, color: V.muted }}>{inr(pricePerCredit(p))} per reminder · {inr(p.totalWithGst)} with GST</span>
                </span>
                <span style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{busy === p.key ? "Opening…" : inr(p.price)}</span>
              </button>
            ))}
          </div>
          {!c.paymentsReady && <div style={{ fontSize: 12.5, color: V.muted }}>Online payments are being set up. Email support@fynhelp.com and we will add credits for you.</div>}
          <AutoTopUp c={c} compact />
          <div style={{ fontSize: 12, color: V.muted }}>Prices exclude {c.gstPercent}% GST. Email reminders are always free, and so are WhatsApp messages from your own linked number.</div>
        </div>
      )}
    </Modal>
  );
}

/** Switch automatic top-up on or off, choose the pack and the monthly limit. */
function AutoTopUp({ c, compact = false }: { c: Credits; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const s = c.settings;
  const save = async (next: Partial<typeof s>) => {
    setBusy(true);
    try {
      setCredits(await savePracticeCreditSettings({ data: { ...s, ...next } }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  if (c.unmetered) return null;
  const pack = c.packs.find((p) => p.key === s.autoPack) ?? c.packs[0];
  return (
    <div style={{ background: V.gray, borderRadius: 14, padding: compact ? "12px 14px" : "14px 16px", display: "grid", gap: 10 }} data-testid="auto-topup">
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: c.autoAvailable ? "pointer" : "not-allowed", opacity: c.autoAvailable ? 1 : 0.65 }}>
        <input type="checkbox" checked={s.autoTopup} disabled={busy || !c.autoAvailable} onChange={(e) => save({ autoTopup: e.target.checked })} style={{ marginTop: 3 }} />
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, display: "flex", gap: 6, alignItems: "center" }}><Zap size={14} /> Top up automatically</span>
          <span style={{ fontSize: 12.5, color: V.body, lineHeight: 1.5 }}>
            {c.autoAvailable
              ? `When credits run low, add ${pack.label} (${inr(pack.totalWithGst)} with GST), charged with your next plan payment. Reminders never silently stop.`
              : "Available on a monthly plan, because it is charged with your plan payment. On a yearly plan, add credits yourself when you need them."}
          </span>
        </span>
      </label>
      {s.autoTopup && c.autoAvailable && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }}>
          <label>
            Pack{" "}
            <select value={s.autoPack} disabled={busy} onChange={(e) => save({ autoPack: e.target.value as typeof s.autoPack })} className="v2-input" style={{ padding: "6px 8px" }}>
              {c.packs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <label>
            At most{" "}
            <select value={s.autoMaxPerMonth} disabled={busy} onChange={(e) => save({ autoMaxPerMonth: Number(e.target.value) })} className="v2-input" style={{ padding: "6px 8px" }}>
              {AUTO_MAX_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>{" "}
            a month: your spending limit is {inr(pack.totalWithGst * s.autoMaxPerMonth)} with GST
          </label>
        </div>
      )}
    </div>
  );
}

/** Small balance chip for the Chaser: "~N reminders left", with a button to add credits. */
export function CreditsChip({ onAdd }: { onAdd: () => void }) {
  const c = useCredits();
  if (!c || c.unmetered) return null;
  const L = LEVEL[c.level];
  return (
    <div
      role="status"
      data-testid="credits-chip"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 12px", borderRadius: 999, background: c.level === "ok" ? V.gray : c.level === "low" ? V.warnBg : "rgba(180,36,36,0.10)", color: L.color, fontSize: 12.5, fontWeight: 600 }}
    >
      <Coins size={14} />
      {c.level === "out" ? "No WhatsApp credits" : `~${remindersLeft(c.balance)}`}
      <button className="v2-btn v2-btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={onAdd}>
        Add credits
      </button>
    </div>
  );
}

/** Warning strip above the Chaser: only when credits are low or out. */
export function CreditsAlert({ onAdd }: { onAdd: () => void }) {
  const c = useCredits();
  if (!c || c.unmetered || c.level === "ok") return null;
  const out = c.level === "out";
  return (
    <div
      role="alert"
      data-testid="credits-alert"
      style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", background: out ? "rgba(180,36,36,0.08)" : V.warnBg, color: out ? V.maroon : V.warnFg, borderRadius: 14, padding: "12px 16px", marginBottom: 16, fontSize: 13.5 }}
    >
      <span>
        {out
          ? "WhatsApp credits have run out. WhatsApp reminders are paused; email reminders keep going."
          : `Only ${remindersLeft(c.balance)}. Add credits so WhatsApp reminders keep going out.`}
      </span>
      <button className="v2-btn v2-btn-primary" onClick={onAdd}>Add credits</button>
    </div>
  );
}

/** Settings → Billing: balance, what it is for, expiry, top-up and the history. */
export function CreditsPanel() {
  const c = useCredits();
  const [open, setOpen] = useState(false);
  if (!c) return null;
  const L = LEVEL[c.level];
  const pct = c.monthly ? Math.min(100, Math.round((c.balance / Math.max(c.monthly, c.balance)) * 100)) : 0;
  const reason: Record<string, string> = { grant: "Added", spend: "Reminder sent", refund: "Returned" };
  return (
    <Card style={{ marginBottom: 16 }} data-testid="credits-panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={{ fontSize: 15.5, margin: 0, display: "flex", gap: 8, alignItems: "center" }}><MessageCircle size={16} /> WhatsApp credits</h3>
          <div style={{ fontSize: 13, color: V.body, maxWidth: 520, lineHeight: 1.6 }}>
            1 credit = 1 WhatsApp reminder from FynHelp's number. Email reminders, WhatsApp replies and your own linked number cost nothing.
          </div>
        </div>
        {c.unmetered ? <Badge tone="info">Test account: not charged</Badge> : <button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}>Add credits</button>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "16px 0 8px" }}>
        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em", color: c.unmetered ? V.ink : L.color, fontVariantNumeric: "tabular-nums" }} data-testid="credits-balance">{c.balance.toLocaleString("en-IN")}</span>
        <span style={{ color: V.muted, fontSize: 13 }}>credits · {remindersLeft(c.balance)}</span>
        {!c.unmetered && c.level !== "ok" && <Badge tone={L.tone}>{c.level === "out" ? "Out of credits" : "Running low"}</Badge>}
      </div>
      {!c.unmetered && (
        <div style={{ height: 6, borderRadius: 6, background: "rgba(23,18,8,.08)", overflow: "hidden", marginBottom: 8 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: L.color, borderRadius: 6, transition: "width .6s cubic-bezier(.16,1,.3,1)" }} />
        </div>
      )}
      <div style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.6 }}>
        Your plan adds {c.monthly.toLocaleString("en-IN")} each month. Unused credits roll over for 12 months
        {c.nextExpiry ? `; the next ${c.nextExpiry.credits.toLocaleString("en-IN")} expire on ${formatDate(c.nextExpiry.expiresAt)}` : ""}. We warn you at {lowThreshold(c.monthly)} left.
      </div>

      <div style={{ marginTop: 14 }}><AutoTopUp c={c} /></div>

      {c.recent.length > 0 && (
        <div style={{ marginTop: 16 }} data-testid="credits-history">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Recent activity</div>
          <div style={{ display: "grid", gap: 4 }}>
            {c.recent.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: V.body }}>
                <span>{reason[r.reason] ?? r.reason}{r.note ? `: ${r.note}` : ""}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: r.delta > 0 ? V.green : V.body }}>{r.delta > 0 ? "+" : ""}{r.delta} · {formatDate(r.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <TopUpModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
