import { useEffect, useMemo, useState } from "react";
import { CreditCard, IndianRupee, TrendingUp, TrendingDown, Search, MoreVertical, X, Download } from "lucide-react";
import { exportToCsv } from "@/utils/csvExport";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, PageHeader } from "./AdminDashboardPage";
import { logAdminAction } from "@/lib/adminAudit";
import { toast } from "sonner";

type Sub = {
  id: string; user_id: string | null; business_id: string | null;
  plan_type: string; status: string; mrr: number;
  billing_cycle: string; next_billing_date: string | null;
  started_at: string;
};

const PLAN_COLORS: Record<string, string> = {
  free_trial: "#8B6914", starter: "#3B82F6", pro: "#1F5A46", enterprise: "#C41E1E",
};
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active:    { bg: "rgba(16,185,129,0.15)",  fg: "#0F8F65" },
  cancelled: { bg: "rgba(23,18,8,0.1)",      fg: "hsl(var(--fyn-ink))" },
  suspended: { bg: "rgba(196,30,30,0.15)",   fg: "#C41E1E" },
  past_due:  { bg: "rgba(234,140,30,0.15)",  fg: "#C26B00" },
};

const REVENUE_TREND: { m: string; mrr: number }[] = [];

const fmtINR = (n: number) =>
  n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n}`;

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Sub | null>(null);
  const [refunding, setRefunding] = useState<Sub | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("subscriptions")
      .select("id,user_id,business_id,plan_type,status,mrr,billing_cycle,next_billing_date,started_at")
      .order("started_at", { ascending: false }).limit(200);
    setSubs((data as Sub[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const cancelSubscription = async (subId: string) => {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", subId);
    if (error) { toast.error(error.message); return; }
    await logAdminAction({ action: "subscription_cancelled", target_type: "subscription", target_id: subId });
    toast.success("Subscription cancelled");
    load();
  };
  const suspendSubscription = async (subId: string) => {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "suspended" })
      .eq("id", subId);
    if (error) { toast.error(error.message); return; }
    await logAdminAction({ action: "subscription_suspended", target_type: "subscription", target_id: subId });
    toast.success("Subscription suspended");
    load();
  };

  const metrics = useMemo(() => {
    const active = subs.filter((s) => s.status === "active");
    const mrr = active.reduce((a, s) => a + Number(s.mrr || 0), 0);
    const arr = mrr * 12;
    const cancelled30 = subs.filter((s) => s.status === "cancelled").length;
    const churn = subs.length ? (cancelled30 / subs.length) * 100 : 0;
    return { active: active.length, mrr, arr, churn };
  }, [subs]);

  const planDist = useMemo(() => {
    const buckets: Record<string, { count: number; mrr: number }> = {
      free_trial: { count: 0, mrr: 0 }, starter: { count: 0, mrr: 0 },
      pro: { count: 0, mrr: 0 }, enterprise: { count: 0, mrr: 0 },
    };
    subs.forEach((s) => {
      const k = (s.plan_type in buckets) ? s.plan_type : "starter";
      buckets[k].count += 1;
      buckets[k].mrr += Number(s.mrr || 0);
    });
    return buckets;
  }, [subs]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return subs.filter((row) => {
      if (plan !== "all" && row.plan_type !== plan) return false;
      if (status !== "all" && row.status !== status) return false;
      if (!s) return true;
      return [row.id, row.user_id, row.business_id, row.plan_type].some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [subs, q, plan, status]);

  const exportSubscriptions = () => {
    exportToCsv(visible.map((s) => ({
      id: s.id,
      business_id: s.business_id ?? "",
      user_id: s.user_id ?? "",
      plan: s.plan_type,
      status: s.status,
      mrr: Number(s.mrr || 0).toFixed(2),
      billing_cycle: s.billing_cycle,
      next_billing: s.next_billing_date ?? "",
      started: new Date(s.started_at).toLocaleDateString(),
    })), "fynhelp-subscriptions");
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader title="Subscriptions & Billing" subtitle="Manage user subscriptions and revenue" />
        <button onClick={exportSubscriptions} className="flex items-center gap-2 px-4 py-2 rounded-lg hover:opacity-80"
          style={{ background: "rgba(139,105,20,0.1)", border: "1px solid rgba(139,105,20,0.2)", fontFamily: "Raleway, sans-serif", fontSize: 13, fontWeight: 600, color: "#8B6914" }}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Metric label="Active Subscriptions" value={String(metrics.active)} icon={<CreditCard size={22} color="#8B6914" />} />
        <Metric label="Monthly Recurring Revenue" value={fmtINR(metrics.mrr)} icon={<IndianRupee size={22} color="#8B6914" />} />
        <Metric label="Annual Recurring Revenue" value={fmtINR(metrics.arr)} icon={<TrendingUp size={22} color="#8B6914" />} />
        <Metric label="Churn Rate (30 days)" value={`${metrics.churn.toFixed(1)}%`} icon={<TrendingDown size={22} color="#8B6914" />} />
      </div>

      {/* Revenue trend */}
      <Card style={{ marginTop: 32, padding: 32, height: 400 }}>
        <h3 style={{ fontFamily:"Raleway, sans-serif", fontWeight:600, fontSize:20, color:"hsl(var(--fyn-ink))" }}>
          Revenue Trend (Last 12 Months)
        </h3>
        <div style={{ width:"100%", height:300, marginTop:12 }}>
          <ResponsiveContainer>
            <AreaChart data={REVENUE_TREND} margin={{ top:16,right:16,left:0,bottom:0 }}>
              <defs>
                <linearGradient id="subsRevenue" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#C41E1E" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#8B6914" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
              <XAxis dataKey="m" stroke="rgba(23,18,8,0.5)" tickLine={false} axisLine={false} style={{ fontFamily:"DM Sans, sans-serif", fontSize:12 }} />
              <YAxis stroke="rgba(23,18,8,0.5)" tickLine={false} axisLine={false} style={{ fontFamily:"DM Sans, sans-serif", fontSize:12 }} unit="L" />
              <Tooltip contentStyle={{ background:"#171208", border:"none", borderRadius:8, color:"#fff", fontFamily:"Roboto, sans-serif", fontSize:13 }} formatter={(v: any) => [`₹${v}L`, "MRR"]} />
              <Area type="monotone" dataKey="mrr" stroke="#C41E1E" strokeWidth={3} fill="url(#subsRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Plan breakdown */}
      <h3 className="mt-10 mb-4" style={{ fontFamily:"Raleway, sans-serif", fontWeight:600, fontSize:20, color:"hsl(var(--fyn-ink))" }}>
        Plan Distribution
      </h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card style={{ height: 340 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={Object.entries(planDist).map(([k,v]) => ({ name: k === "free_trial" ? "Free Trial" : k.charAt(0).toUpperCase()+k.slice(1), value:v.count, key:k }))}
                dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110}>
                {Object.keys(planDist).map((k) => <Cell key={k} fill={PLAN_COLORS[k]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"rgba(23,18,8,0.04)" }}>
                {["Plan","Users","MRR","Avg/User"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(planDist).map(([k,v]) => (
                <tr key={k} style={{ borderTop:"1px solid rgba(23,18,8,0.06)" }}>
                  <td style={td}><PlanBadge plan={k} /></td>
                  <td style={td}>{v.count}</td>
                  <td style={td}>{fmtINR(v.mrr)}</td>
                  <td style={td}>{v.count ? fmtINR(Math.round(v.mrr / v.count)) : "-"}</td>
                </tr>
              ))}
              <tr style={{ borderTop:"2px solid rgba(139,105,20,0.3)", background:"rgba(244,237,218,0.5)" }}>
                <td style={{...td, fontWeight:700}}>TOTAL</td>
                <td style={{...td, fontWeight:700}}>{subs.length}</td>
                <td style={{...td, fontWeight:700}}>{fmtINR(Object.values(planDist).reduce((a,v)=>a+v.mrr,0))}</td>
                <td style={td}>-</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      {/* Subscriptions list */}
      <h3 className="mt-10 mb-4" style={{ fontFamily:"Raleway, sans-serif", fontWeight:600, fontSize:20, color:"hsl(var(--fyn-ink))" }}>
        All Subscriptions
      </h3>
      <Card style={{ marginBottom: 16 }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative" style={{ minWidth:240, flex:"1 1 280px" }}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color="hsl(var(--fyn-ink) / 0.4)" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by user, business, or ID…" style={inputStyle} />
          </div>
          <select value={plan} onChange={(e)=>setPlan(e.target.value)} style={selectStyle}>
            <option value="all">All Plans</option>
            <option value="free_trial">Free Trial</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select value={status} onChange={(e)=>setStatus(e.target.value)} style={selectStyle}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Suspended</option>
            <option value="past_due">Past Due</option>
          </select>
        </div>
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth: 960 }}>
            <thead>
              <tr style={{ background:"rgba(23,18,8,0.04)", borderBottom:"2px solid rgba(139,105,20,0.2)" }}>
                {["User","Business","Plan","Status","MRR","Cycle","Next Billing","Started","Actions"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <tr key={s.id} style={{
                  background: i%2 ? "rgba(244,237,218,0.3)" : "#fff",
                  borderBottom: "1px solid rgba(23,18,8,0.06)",
                }}>
                  <td style={td}>{s.user_id ? s.user_id.slice(0,8) : "-"}</td>
                  <td style={td}>{s.business_id ? s.business_id.slice(0,8) : "-"}</td>
                  <td style={td}><PlanBadge plan={s.plan_type} /></td>
                  <td style={td}><StatusBadge status={s.status} /></td>
                  <td style={{ ...td, textAlign:"right", fontFamily:"JetBrains Mono, monospace" }}>{fmtINR(Number(s.mrr))}</td>
                  <td style={td}>{s.billing_cycle}</td>
                  <td style={td}>{s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString("en-IN",{ day:"2-digit", month:"short" }) : "-"}</td>
                  <td style={td}>{new Date(s.started_at).toLocaleDateString("en-IN",{ day:"2-digit", month:"short" })}</td>
                  <td style={td}>
                    <ActionsMenu
                      onChangePlan={()=>setEditing(s)}
                      onRefund={()=>setRefunding(s)}
                      onSuspend={()=>suspendSubscription(s.id)}
                      onCancel={()=>cancelSubscription(s.id)}
                    />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign:"center", padding:32, color:"hsl(var(--fyn-ink) / 0.5)" }}>No subscriptions match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <ChangePlanModal sub={editing} onClose={()=>setEditing(null)} />}
      {refunding && <RefundModal sub={refunding} onClose={()=>setRefunding(null)} />}
    </div>
  );
}

function Metric({ label, value, trend, icon }: { label: string; value: string; trend?: number; icon: React.ReactNode }) {
  return (
    <Card style={{ minHeight: 140, position:"relative" }}>
      <div className="flex items-start justify-between">
        <span className="grid place-items-center rounded-full"
          style={{ width:48, height:48, background:"linear-gradient(135deg, rgba(196,30,30,0.1), rgba(139,105,20,0.1))" }}>{icon}</span>
        {typeof trend === "number" && (
          <span style={{ color: trend >= 0 ? "#1F5A46" : "#DC2626", fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:13 }}>
            {trend > 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <div className="mt-4" style={{ fontFamily:"Oswald, sans-serif", fontWeight:700, fontSize:38, color:"hsl(var(--fyn-ink))", lineHeight:1 }}>{value}</div>
      <div className="mt-2" style={{ fontFamily:"Raleway, sans-serif", fontSize:14, color:"hsl(var(--fyn-ink) / 0.6)" }}>{label}</div>
    </Card>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const label = plan === "free_trial" ? "Free Trial" : plan.charAt(0).toUpperCase()+plan.slice(1);
  const color = PLAN_COLORS[plan] ?? "#8B6914";
  return (
    <span style={{ display:"inline-block", padding:"4px 10px", borderRadius:6,
      background: `${color}1F`, color, fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:12 }}>
      {label}
    </span>
  );
}
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.cancelled;
  return (
    <span style={{ display:"inline-block", padding:"4px 10px", borderRadius:6,
      background:c.bg, color:c.fg, fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:12,
      textTransform:"capitalize" }}>{status.replace("_"," ")}</span>
  );
}

function ActionsMenu({ onChangePlan, onRefund, onSuspend, onCancel }: { onChangePlan: () => void; onRefund: () => void; onSuspend: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={()=>setOpen((s)=>!s)} style={{ background:"transparent", border:"none", cursor:"pointer", padding:6 }}>
        <MoreVertical size={18} color="hsl(var(--fyn-ink))" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={()=>setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden"
            style={{ width:200, background:"#fff", border:"1px solid rgba(139,105,20,0.2)", boxShadow:"0 12px 32px rgba(23,18,8,0.15)" }}>
            {[
              { l:"Change Plan",  fn:onChangePlan },
              { l:"Suspend",      fn:onSuspend },
              { l:"Cancel",       fn:onCancel },
              { l:"Issue Refund", fn:onRefund },
            ].map((it) => (
              <button key={it.l} onClick={()=>{ setOpen(false); it.fn(); }}
                className="w-full text-left px-4 py-2.5 hover:bg-[hsl(var(--fyn-ink)/0.04)]"
                style={{ fontFamily:"Roboto, sans-serif", fontSize:13, color:"hsl(var(--fyn-ink))" }}>
                {it.l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChangePlanModal({ sub, onClose }: { sub: Sub; onClose: () => void }) {
  const [newPlan, setNewPlan] = useState(sub.plan_type);
  const [reason, setReason] = useState("");
  return (
    <ModalShell title="Change Plan" onClose={onClose}>
      <Field label="Current Plan" value={`${sub.plan_type}, ${fmtINR(Number(sub.mrr))} / ${sub.billing_cycle}`} />
      <label style={lbl}>New Plan</label>
      <select value={newPlan} onChange={(e)=>setNewPlan(e.target.value)} style={{ ...selectStyle, width:"100%" }}>
        <option value="free_trial">Free Trial, ₹0</option>
        <option value="starter">Starter, ₹2,500</option>
        <option value="pro">Pro, ₹7,500</option>
        <option value="enterprise">Enterprise, ₹15,000</option>
      </select>
      <label style={lbl}>Effective Date</label>
      <div className="flex gap-4" style={{ fontFamily:"Roboto, sans-serif", fontSize:14 }}>
        <label className="flex items-center gap-2"><input type="radio" name="eff" defaultChecked /> Immediately</label>
        <label className="flex items-center gap-2"><input type="radio" name="eff" /> Next billing cycle</label>
      </div>
      <label className="flex items-center gap-2 mt-3" style={{ fontFamily:"Roboto, sans-serif", fontSize:14 }}>
        <input type="checkbox" defaultChecked /> Pro-rate the difference
      </label>
      <label style={lbl}>Reason</label>
      <textarea value={reason} onChange={(e)=>setReason(e.target.value)} rows={3} placeholder="Why are you changing this plan?"
        style={{ width:"100%", padding:12, borderRadius:12, border:"1px solid rgba(23,18,8,0.15)", fontFamily:"Roboto, sans-serif", fontSize:14, outline:"none" }} />
      <div className="flex justify-end gap-3 mt-6">
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <PrimaryBtn onClick={async () => {
          await logAdminAction({ action:"subscription_plan_changed", target_type:"subscription", target_id:sub.id, details:{ from:sub.plan_type, to:newPlan, reason } });
          toast.success("Plan changed successfully");
          onClose();
        }}>Change Plan</PrimaryBtn>
      </div>
    </ModalShell>
  );
}

function RefundModal({ sub, onClose }: { sub: Sub; onClose: () => void }) {
  const [amount, setAmount] = useState(String(sub.mrr));
  const [why, setWhy] = useState("Customer request");
  const [notes, setNotes] = useState("");
  return (
    <ModalShell title="Issue Refund" onClose={onClose}>
      <label style={lbl}>Refund Amount (₹)</label>
      <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="₹7,500" style={{ ...inputStyle, width:"100%" }} />
      <label style={lbl}>Refund Reason</label>
      <select value={why} onChange={(e)=>setWhy(e.target.value)} style={{ ...selectStyle, width:"100%" }}>
        {["Cancellation","Service issue","Billing error","Customer request","Other"].map((o)=><option key={o}>{o}</option>)}
      </select>
      <label style={lbl}>Notes</label>
      <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3} placeholder="Internal notes about refund"
        style={{ width:"100%", padding:12, borderRadius:12, border:"1px solid rgba(23,18,8,0.15)", fontFamily:"Roboto, sans-serif", fontSize:14, outline:"none" }} />
      <div className="flex justify-end gap-3 mt-6">
        <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
        <button onClick={async () => {
            await logAdminAction({ action:"refund_issued", target_type:"subscription", target_id:sub.id, details:{ amount, why, notes } });
            toast.success("Refund issued successfully");
            onClose();
          }}
          style={{ height:44, padding:"0 18px", borderRadius:12, background:"#C41E1E", color:"#fff", border:"none", cursor:"pointer", fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:14 }}>
          Issue Refund
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:"rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} className="w-full max-w-[500px]" style={{
        background:"rgba(255,255,255,0.98)", backdropFilter:"blur(20px)",
        borderRadius:20, border:"1px solid rgba(139,105,20,0.2)",
        boxShadow:"0 24px 60px rgba(23,18,8,0.25)", maxHeight:"90vh", overflow:"auto",
      }}>
        <div className="flex items-center justify-between p-6" style={{ borderBottom:"1px solid rgba(23,18,8,0.08)" }}>
          <h3 style={{ fontFamily:"Oswald, sans-serif", fontWeight:700, fontSize:24, color:"hsl(var(--fyn-ink))" }}>{title}</h3>
          <button onClick={onClose} style={{ background:"transparent", border:"none", cursor:"pointer" }}><X size={22} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily:"Roboto, sans-serif", fontSize:12, color:"hsl(var(--fyn-ink) / 0.55)" }}>{label}</div>
      <div style={{ fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:15, color:"hsl(var(--fyn-ink))" }}>{value}</div>
    </div>
  );
}
const PrimaryBtn = (p: any) => <button {...p} style={{ height:44, padding:"0 22px", borderRadius:12, background:"linear-gradient(135deg,#C41E1E,#8B6914)", color:"#fff", border:"none", cursor:"pointer", fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:14 }}>{p.children}</button>;
const SecondaryBtn = (p: any) => <button {...p} style={{ height:44, padding:"0 22px", borderRadius:12, background:"transparent", border:"2px solid rgba(23,18,8,0.15)", color:"hsl(var(--fyn-ink))", cursor:"pointer", fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:14 }}>{p.children}</button>;
const lbl: React.CSSProperties = { display:"block", fontFamily:"Roboto, sans-serif", fontSize:13, color:"hsl(var(--fyn-ink) / 0.7)", marginTop:14, marginBottom:6 };
const th: React.CSSProperties = { padding:"14px 16px", textAlign:"left", fontFamily:"Raleway, sans-serif", fontWeight:600, fontSize:13, color:"hsl(var(--fyn-ink))" };
const td: React.CSSProperties = { padding:"14px 16px", fontFamily:"Roboto, sans-serif", fontSize:14, color:"hsl(var(--fyn-ink) / 0.85)" };
const inputStyle: React.CSSProperties = { height:48, padding:"0 14px 0 38px", borderRadius:12, border:"1px solid rgba(23,18,8,0.15)", background:"#fff", fontFamily:"Roboto, sans-serif", fontSize:15, color:"hsl(var(--fyn-ink))", outline:"none", width:"100%" };
const selectStyle: React.CSSProperties = { height:48, padding:"0 14px", borderRadius:12, border:"1px solid rgba(23,18,8,0.15)", background:"#fff", fontFamily:"Roboto, sans-serif", fontSize:14, color:"hsl(var(--fyn-ink))", minWidth:160 };
