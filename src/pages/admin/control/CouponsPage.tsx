import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { adminCoupons, adminCreateCoupon, adminSetCoupon } from "@/lib/admin/admin.functions";
import { adminCall, adminError } from "@/components/admin/adminClient";
import { PLANS, couponAmountPaise, GST_PERCENT } from "@/lib/practice/billing/plans";
import { Btn, Empty, ErrorNote, PageHead, Panel, Pill, Table, Td, day, ink, inr, line, muted } from "./ui";

type Kind = "percent" | "flat" | "trial_days";
type Duration = "first" | "forever";
const PLAN_KEYS = ["starter", "professional", "scale"] as const;
const CYCLES = ["monthly", "annual"] as const;

const KINDS: { key: Kind; title: string; sub: string; unit: string }[] = [
  { key: "trial_days", title: "Free trial days", sub: "Extends the trial. No payment needed.", unit: "days" },
  { key: "percent", title: "Percent off", sub: "A % off the plan price.", unit: "% off" },
  { key: "flat", title: "Rupees off", sub: "A fixed amount off the plan price.", unit: "₹ off" },
];

/** One-click starting points. */
const PRESETS: { label: string; kind: Kind; value: number; duration: Duration; prefix: string }[] = [
  { label: "14 more trial days", kind: "trial_days", value: 14, duration: "first", prefix: "TRIAL14" },
  { label: "20% off the first payment", kind: "percent", value: 20, duration: "first", prefix: "SAVE20" },
  { label: "₹500 off the first payment", kind: "flat", value: 500, duration: "first", prefix: "OFF500" },
  { label: "10% off for good", kind: "percent", value: 10, duration: "forever", prefix: "LOYAL10" },
];

const randomSuffix = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export default function CouponsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "coupons"], queryFn: () => adminCall(() => adminCoupons()) });
  const [form, setForm] = useState({
    code: "",
    kind: "trial_days" as Kind,
    value: 14,
    duration: "first" as Duration,
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
  const money = form.kind !== "trial_days";
  const unit = KINDS.find((k) => k.key === form.kind)!.unit;

  // What a firm will actually see: the sentence, and the price on each plan.
  const preview = useMemo(() => {
    const v = Number(form.value);
    if (!(v > 0)) return null;
    const when = form.duration === "forever" ? "every payment" : "their first payment";
    if (!money) return { line: `Firms who enter this code get ${v} more day${v === 1 ? "" : "s"} of free trial.`, rows: [] as { name: string; was: number; now: number | null }[] };
    const plans = form.plans.length ? (form.plans as (typeof PLAN_KEYS)[number][]) : [...PLAN_KEYS];
    const cycle = form.cycles.length === 1 ? (form.cycles[0] as (typeof CYCLES)[number]) : "monthly";
    const rows = plans.map((p) => {
      const was = cycle === "annual" ? PLANS[p].annual : PLANS[p].monthly;
      const paise = couponAmountPaise(p, cycle, 0, { kind: form.kind, value: v });
      return { name: PLANS[p].name, was, now: paise === null ? null : Math.round(paise / 100) };
    });
    return { line: `Firms who enter this code get ${form.kind === "percent" ? `${v}%` : inr(v)} off ${when}, before GST (${GST_PERCENT}% is added on top).`, rows, cycle };
  }, [form.kind, form.value, form.duration, form.plans, form.cycles, money]);

  const applyPreset = (p: (typeof PRESETS)[number]) =>
    setForm((f) => ({ ...f, kind: p.kind, value: p.value, duration: p.duration, code: f.code || `${p.prefix}`, plans: [], cycles: [] }));

  const create = async () => {
    setBusy(true);
    try {
      const r = await adminCall(() =>
        adminCreateCoupon({
          data: {
            code: form.code,
            kind: form.kind,
            value: Number(form.value),
            duration: money ? form.duration : undefined,
            plans: form.plans.length ? (form.plans as never) : null,
            cycles: form.cycles.length ? (form.cycles as never) : null,
            expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+05:30`).toISOString() : null,
            maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
            perFirmLimit: Number(form.perFirmLimit) || 1,
            note: form.note || null,
          },
        }),
      );
      toast.success(`Code ${form.code.toUpperCase()} is live.${money && r.prepared ? " Set up in Razorpay automatically." : ""}`);
      if (r.warning) toast.info(r.warning);
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
      <PageHead title="Coupons" sub="Pick what it gives and who it is for. FynHelp sets up everything else, including the discount in Razorpay. Firms enter the code in Settings, Billing." />
      <Panel title="New code" testId="coupon-form">
        <div className="flex flex-wrap gap-2 mb-4" aria-label="Quick start">
          <span className="text-xs self-center" style={{ color: muted }}>Quick start:</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="rounded-full px-3 py-1 text-xs font-semibold" style={{ border: `1px solid ${line}`, background: "#fff", color: ink }} onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="What does it give" className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          {KINDS.map((k) => {
            const on = form.kind === k.key;
            return (
              <button key={k.key} type="button" role="radio" aria-checked={on} onClick={() => setForm((f) => ({ ...f, kind: k.key, value: k.key === "trial_days" ? 14 : k.key === "percent" ? 20 : 500 }))} data-testid={`coupon-kind-${k.key}`}
                className="text-left rounded-xl p-3" style={{ border: `${on ? 2 : 1}px solid ${on ? "#8A1E18" : line}`, background: on ? "rgba(138,30,24,.05)" : "#fff" }}>
                <div className="font-semibold text-sm" style={{ color: ink }}>{k.title}</div>
                <div className="text-xs mt-0.5" style={{ color: muted }}>{k.sub}</div>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 text-sm" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <label className="grid gap-1">Code
            <div className="flex gap-2">
              <input className="rounded-lg border px-3 py-2 uppercase flex-1 min-w-0" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="ICAI30" data-testid="coupon-code" />
              <button type="button" className="rounded-lg border px-2 text-xs font-semibold" style={{ borderColor: line }} title="Make up a code" onClick={() => set("code", `${money ? (form.kind === "percent" ? `SAVE${form.value}` : "OFF") : "TRIAL"}${randomSuffix()}`.slice(0, 32))}>
                <Sparkles size={13} className="inline mr-1" aria-hidden />Make one
              </button>
            </div>
          </label>
          <label className="grid gap-1">{unit === "days" ? "How many days" : unit === "% off" ? "How many percent" : "How many rupees"}
            <input type="number" min={1} max={form.kind === "percent" ? 90 : undefined} className="rounded-lg border px-3 py-2" value={form.value} onChange={(e) => set("value", Number(e.target.value))} data-testid="coupon-value" />
          </label>
          {money && (
            <label className="grid gap-1">For how long
              <select className="rounded-lg border px-3 py-2" value={form.duration} onChange={(e) => set("duration", e.target.value as Duration)} data-testid="coupon-duration">
                <option value="first">First payment only</option>
                <option value="forever">Every payment</option>
              </select>
            </label>
          )}
          <label className="grid gap-1">Expires on (optional)
            <input type="date" className="rounded-lg border px-3 py-2" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
          </label>
          <label className="grid gap-1">Total uses (optional)
            <input type="number" min={1} className="rounded-lg border px-3 py-2" value={form.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} placeholder="No limit" />
          </label>
        </div>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer" style={{ color: muted }}>More options: plans, billing, uses per firm, note</summary>
          <div className="flex flex-wrap gap-4 mt-3">
            <span style={{ color: muted }}>Only for plans:</span>
            {PLAN_KEYS.map((p) => <label key={p} className="flex items-center gap-1 capitalize"><input type="checkbox" checked={form.plans.includes(p)} onChange={() => toggle("plans", p)} />{PLANS[p].name}</label>)}
            <span style={{ color: muted }}>Billing:</span>
            {CYCLES.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={form.cycles.includes(c)} onChange={() => toggle("cycles", c)} />{c === "annual" ? "yearly" : "monthly"}</label>)}
            <span style={{ color: muted }}>(none ticked: all)</span>
          </div>
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <label className="grid gap-1">Uses per firm
              <input type="number" min={1} className="rounded-lg border px-3 py-2" value={form.perFirmLimit} onChange={(e) => set("perFirmLimit", Number(e.target.value))} />
            </label>
            <label className="grid gap-1">Note (internal)
              <input className="rounded-lg border px-3 py-2" value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="ICAI Pune chapter event" />
            </label>
          </div>
        </details>

        {preview && (
          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(23,18,8,.04)" }} data-testid="coupon-preview">
            <div style={{ color: ink }}>{preview.line}</div>
            {preview.rows.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: muted }}>
                {preview.rows.map((r) => (
                  <span key={r.name}>{r.name} ({preview.cycle === "annual" ? "yearly" : "monthly"}): <s>{inr(r.was)}</s> → <b style={{ color: ink }}>{r.now === null ? "too much off" : inr(r.now)}</b></span>
                ))}
              </div>
            )}
          </div>
        )}
        {money && <p className="text-xs mt-3" style={{ color: muted }}>Nothing to create in Razorpay: FynHelp sets up the discounted plan itself{form.duration === "first" ? " and moves the firm back to the normal price after the first payment" : ""}.</p>}

        <div className="mt-3" style={{ borderTop: `1px solid ${line}`, paddingTop: 12 }}>
          <Btn kind="primary" disabled={busy || form.code.trim().length < 3 || !(Number(form.value) > 0)} onClick={() => void create()} testId="coupon-create">{busy ? "Setting it up…" : "Create code"}</Btn>
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
                <Td>
                  {c.kind === "trial_days" ? `${c.value} trial days` : c.kind === "percent" ? `${c.value}% off` : `${inr(Number(c.value))} off`}
                  {c.kind !== "trial_days" && <div className="text-xs" style={{ color: muted }}>{c.razorpay_offer_id ? "via a Razorpay offer" : c.duration === "forever" ? "every payment" : "first payment"}</div>}
                </Td>
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
