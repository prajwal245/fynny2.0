/**
 * Tally posting pages for the screens: a full panel for Settings → Billing (under WhatsApp credits),
 * a compact chip for the Tally approval panel, and one top-up window both open.
 * 1 credit = 1 page of a document posted to Tally.
 */
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { Badge, Card, Modal, V, formatDate, type Tone } from "../ui";
import { useV2 } from "../store";
import { confirmPracticePageTopUp, startPracticePageTopUp } from "@/lib/practice/practice.functions";
import { PAGE_ROWS, pageLowThreshold, type PageLevel } from "@/lib/practice/billing/pageCredits";
import { loadRazorpay } from "../lib/billing";
import { RazorpayIcon } from "./BrandIcons";
import { refreshPages, setPages, usePages, type Pages } from "../lib/pages";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
const LEVEL: Record<PageLevel, { tone: Tone; color: string }> = {
  ok: { tone: "good", color: V.green },
  low: { tone: "warn", color: "#B45309" },
  out: { tone: "bad", color: V.maroon },
};
type PackKey = "regular-200" | "regular-400" | "regular-600" | "pro-3000";
type RzpOrderResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RzpCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: (r: { error?: { description?: string } }) => void) => void };

/** Opens Razorpay for a pack and adds the pages when the payment is verified. */
export function usePageTopUp() {
  const { session } = useV2();
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (pack: PackKey, done?: () => void) => {
    setBusy(pack);
    try {
      const [o] = await Promise.all([startPracticePageTopUp({ data: { pack } }), loadRazorpay()]);
      const Razorpay = (window as unknown as { Razorpay: RzpCtor }).Razorpay;
      const rzp = new Razorpay({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amount,
        currency: "INR",
        name: "FynHelp",
        description: `Tally posting pages: ${o.packLabel}`,
        prefill: { email: session?.email ?? "", name: session?.name ?? "" },
        notes: { firm: o.firmName },
        theme: { color: "#8A1E18" },
        modal: { ondismiss: () => setBusy(null) },
        handler: async (r: RzpOrderResponse) => {
          try {
            setPages(await confirmPracticePageTopUp({ data: r }));
            toast.success(`${o.packLabel} added. You can approve entries for Tally again.`);
            done?.();
          } catch (e) {
            toast.error(errMsg(e));
            void refreshPages();
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

/** The window to add pages: the packs, the price per page, and how pages are counted. */
export function PagesTopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePages(open);
  const { busy, buy } = usePageTopUp();
  return (
    <Modal open={open} onClose={onClose} title="Add Tally posting pages">
      {!p ? (
        <div style={{ color: V.muted, fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 13.5, color: V.body, lineHeight: 1.6 }}>
            1 credit is 1 page of a document posted to Tally. You have <b style={{ color: V.ink }}>{p.balance.toLocaleString("en-IN")}</b> now. Pages last 12 months, so nothing is wasted in a quiet month.
          </div>
          <div style={{ display: "grid", gap: 10 }} data-testid="page-packs">
            {p.packs.map((k, i) => (
              <motion.button
                key={k.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                disabled={!!busy || !p.paymentsReady}
                onClick={() => buy(k.key as PackKey, onClose)}
                style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderRadius: 14, border: `1px solid ${k.name === "Pro" ? V.coral : V.line}`, background: V.card, cursor: busy ? "wait" : "pointer", font: "inherit", color: V.ink }}
              >
                <span style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontWeight: 650, fontSize: 15 }}>
                    {k.pages.toLocaleString("en-IN")} pages {k.name === "Pro" && <Badge tone="good">Best value</Badge>}
                  </span>
                  <span style={{ fontSize: 12, color: V.muted }}>{inr(k.perPage)} per page · {inr(k.totalWithGst)} with GST</span>
                </span>
                <span style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{busy === k.key ? "Opening…" : inr(k.price)}</span>
              </motion.button>
            ))}
          </div>
          {!p.paymentsReady && <div style={{ fontSize: 12.5, color: V.muted }}>Online payments are being set up. Email support@fynhelp.com and we will add pages for you.</div>}
          <div style={{ fontSize: 12, color: V.muted, lineHeight: 1.6 }}>
            Pages are counted once for each document you approve entries from. A PDF counts its pages; an Excel or CSV file counts 1 page for every {PAGE_ROWS} lines. Approving more lines from the same document costs nothing more.
          </div>
          <div style={{ fontSize: 12, color: V.muted, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><RazorpayIcon size={14} /> Secure payment by Razorpay (UPI, cards, netbanking). Prices exclude {p.gstPercent}% GST.</div>
        </div>
      )}
    </Modal>
  );
}

/** Small balance chip for the Tally approval panel. */
export function PagesChip({ onAdd }: { onAdd: () => void }) {
  const p = usePages();
  if (!p || p.unmetered) return null;
  const L = LEVEL[p.level];
  return (
    <div role="status" data-testid="pages-chip" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 12px", borderRadius: 999, background: p.level === "ok" ? V.gray : p.level === "low" ? V.warnBg : "rgba(180,36,36,0.10)", color: L.color, fontSize: 12.5, fontWeight: 600 }}>
      <FileText size={14} />
      {p.level === "out" ? "No posting pages left" : `${p.balance.toLocaleString("en-IN")} pages left`}
      <button className="v2-btn v2-btn-ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={onAdd}>Add pages</button>
    </div>
  );
}

/** Settings → Billing, under WhatsApp credits: balance, what it is for, expiry, top-up and history. */
export function PagesPanel() {
  const p = usePages();
  const [open, setOpen] = useState(false);
  if (!p) return null;
  const L = LEVEL[p.level];
  const pct = p.monthly ? Math.min(100, Math.round((p.balance / Math.max(p.monthly, p.balance)) * 100)) : 0;
  const reason: Record<string, string> = { grant: "Added", spend: "Document posted", refund: "Returned" };
  return (
    <Card style={{ marginBottom: 16 }} data-testid="pages-panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={{ fontSize: 15.5, margin: 0, display: "flex", gap: 8, alignItems: "center" }}><FileText size={18} /> Tally posting pages</h3>
          <div style={{ fontSize: 13, color: V.body, maxWidth: 520, lineHeight: 1.6 }}>
            1 credit = 1 page of a document posted to Tally. Reading, matching and the MIS use your document allowance, not these pages.
          </div>
        </div>
        {p.unmetered ? <Badge tone="info">Test account: not charged</Badge> : <button className="v2-btn v2-btn-primary" onClick={() => setOpen(true)}>Add pages</button>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "16px 0 8px" }}>
        <motion.span key={p.balance} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em", color: p.unmetered ? V.ink : L.color, fontVariantNumeric: "tabular-nums" }} data-testid="pages-balance">{p.balance.toLocaleString("en-IN")}</motion.span>
        <span style={{ color: V.muted, fontSize: 13 }}>pages</span>
        {!p.unmetered && p.level !== "ok" && <Badge tone={L.tone}>{p.level === "out" ? "Out of pages" : "Running low"}</Badge>}
      </div>
      {!p.unmetered && (
        <div style={{ height: 6, borderRadius: 6, background: "rgba(23,18,8,.08)", overflow: "hidden", marginBottom: 8 }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ height: "100%", background: L.color, borderRadius: 6 }} />
        </div>
      )}
      <div style={{ fontSize: 12.5, color: V.muted, lineHeight: 1.6 }}>
        Your plan adds {p.monthly.toLocaleString("en-IN")} pages each month. Unused pages roll over for 12 months
        {p.nextExpiry ? `; the next ${p.nextExpiry.pages.toLocaleString("en-IN")} expire on ${formatDate(p.nextExpiry.expiresAt)}` : ""}. We warn you at {pageLowThreshold(p.monthly)} left.
      </div>

      {p.recent.length > 0 && (
        <div style={{ marginTop: 16 }} data-testid="pages-history">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Recent activity</div>
          <div style={{ display: "grid", gap: 4 }}>
            {p.recent.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: V.body }}>
                <span>{reason[r.reason] ?? r.reason}{r.note ? `: ${r.note}` : ""}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: r.delta > 0 ? V.green : V.body }}>{r.delta > 0 ? "+" : ""}{r.delta} · {formatDate(r.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <PagesTopUpModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
export type { Pages };
