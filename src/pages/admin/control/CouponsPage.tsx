import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminCoupons, adminCreateCoupon, adminSetCoupon } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { Btn, Empty, ErrorNote, PageHead, Panel, Pill, Table, Td, day, inr, line, muted } from "./ui";

type Kind = "percent" | "flat" | "trial_days";
const PLANS = ["starter", "professional", "scale"] as const;
const CYCLES = ["monthly", "annual"] as const;

export default function CouponsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "coupons"], queryFn: () => adminCall(() => adminCoupons()) });
  const [form, setForm] = useState({
    code: "",
    kind: "trial_days" as Kind,
    value: 14,
    razorpayOfferId: "",
    plans: [] as string[],
    cycles: [] as string[],
    expiresAt: "",
    maxRedemptions: "",
    perFirmLimit: 1,
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "plans" | "cycles", v: string) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);

  const create = async () => {
    setBusy(true);
    try {
      await adminCall(() =>
        adminCreateCoupon({
          data: {
            code: form.code,
            kind: form.kind,
            value: Number(form.value),
            razorpayOfferId: form.kind === "trial_days" ? null : form.razorpayOfferId || null,
            plans: form.plans.length ? (form.plans as never) : null,
            cycles: form.cycles.length ? (form.cycles as never) : null,
            expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+05:30`).toISOString() : null,
            maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
            perFirmLimit: Number(form.perFirmLimit) || 1,
            note: form.note || null,
          },
        }),
      );
      toast.success(`Code ${form.code.toUpperCase()} created.`);
      set("code", "");
      await qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };

  const flip = async (code: string, active: boolean) => {
    try {
      await adminCall(() => adminSetCoupon({ data: { code, active } }));
      await qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    } catch (e) {
      toast.error(adminError(e));
    }
  };

  return (
    <div>
      <PageHead title="Coupons" sub="Extra trial days, or discounts applied by a Razorpay Offer. Firms enter the code in Settings, Billing." />
      <Panel title="New code" testId="coupon-form">
        <div className="grid gap-3 text-sm" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <label className="grid gap-1">Code
            <input className="rounded-lg border px-3 py-2 uppercase" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="ICAI30" data-testid="coupon-code" />
          </label>
          <label className="grid gap-1">Type
            <select className="rounded-lg border px-3 py-2" value={form.kind} onChange={(e) => set("kind", e.target.value as Kind)} data-testid="coupon-kind">
              <option value="trial_days">Extra free-trial days (fee waiver)</option>
              <option value="percent">% off (Razorpay Offer)</option>
              <option value="flat">Flat ₹ off (Razorpay Offer)</option>
            </select>
          </label>
          <label className="grid gap-1">{form.kind === "trial_days" ? "Days" : form.kind === "percent" ? "Percent off" : "₹ off"}
            <input type="number" min={1} className="rounded-lg border px-3 py-2" value={form.value} onChange={(e) => set("value", Number(e.target.value))} data-testid="coupon-value" />
          </label>
          {form.kind !== "trial_days" && (
            <label className="grid gap-1">Razorpay offer ID
              <input className="rounded-lg border px-3 py-2 font-mono" value={form.razorpayOfferId} onChange={(e) => set("razorpayOfferId", e.target.value)} placeholder="offer_…" />
            </label>
          )}
          <label className="grid gap-1">Expires on (optional)
            <input type="date" className="rounded-lg border px-3 py-2" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
          </label>
          <label className="grid gap-1">Total uses (optional)
            <input type="number" min={1} className="rounded-lg border px-3 py-2" value={form.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} />
          </label>
          <label className="grid gap-1">Uses per firm
            <input type="number" min={1} className="rounded-lg border px-3 py-2" value={form.perFirmLimit} onChange={(e) => set("perFirmLimit", Number(e.target.value))} />
          </label>
          <label className="grid gap-1">Note (internal)
            <input className="rounded-lg border px-3 py-2" value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="ICAI Pune chapter event" />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <span style={{ color: muted }}>Only for plans:</span>
          {PLANS.map((p) => <label key={p} className="flex items-center gap-1 capitalize"><input type="checkbox" checked={form.plans.includes(p)} onChange={() => toggle("plans", p)} />{p}</label>)}
          <span style={{ color: muted }}>Billing:</span>
          {CYCLES.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={form.cycles.includes(c)} onChange={() => toggle("cycles", c)} />{c === "annual" ? "yearly" : "monthly"}</label>)}
        </div>
        {form.kind !== "trial_days" && (
          <p className="text-xs mt-3" style={{ color: muted }}>
            Razorpay applies money discounts to subscriptions through Offers. Create the Offer in the Razorpay Dashboard (Subscriptions → Offers) with the same discount, then paste its ID here.
          </p>
        )}
        <div className="mt-3" style={{ borderTop: `1px solid ${line}`, paddingTop: 12 }}>
          <Btn kind="primary" disabled={busy || form.code.trim().length < 3} onClick={() => void create()} testId="coupon-create">{busy ? "Creating…" : "Create code"}</Btn>
        </div>
      </Panel>
      <Panel title="Codes and how they perform">
        <ErrorNote error={list.error} />
        {list.data?.length === 0 && <Empty>No codes yet.</Empty>}
        {!!list.data?.length && (
          <Table head={["Code", "Gives", "Limits", "Used", "Revenue started", "Discount given", "ROI", ""]} testId="coupons-table">
            {list.data.map((c) => (
              <tr key={c.code}>
                <Td><b className="font-mono">{c.code}</b>{c.note && <div className="text-xs" style={{ color: muted }}>{c.note}</div>}</Td>
                <Td>{c.kind === "trial_days" ? `${c.value} trial days` : c.kind === "percent" ? `${c.value}% off` : `${inr(Number(c.value))} off`}</Td>
                <Td className="text-xs">
                  {c.plans?.length ? c.plans.join(", ") : "all plans"} · {c.cycles?.length ? c.cycles.join(", ") : "any billing"}
                  <div>{c.max_redemptions ? `${c.max_redemptions} total` : "no cap"} · {c.per_firm_limit}/firm · {c.expires_at ? `to ${day(c.expires_at)}` : "no expiry"}</div>
                </Td>
                <Td className="tabular-nums">{c.uses}{c.paidUses ? ` (${c.paidUses} paid)` : ""}</Td>
                <Td className="tabular-nums">{c.revenue ? inr(c.revenue) : "—"}</Td>
                <Td className="tabular-nums">{c.discount ? inr(c.discount) : "—"}</Td>
                <Td>{c.roi != null ? `${c.roi}×` : "—"}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Pill tone={c.active ? "good" : "info"}>{c.active ? "active" : "off"}</Pill>
                    <Btn onClick={() => void flip(c.code, !c.active)}>{c.active ? "Turn off" : "Turn on"}</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
