import { useEffect, useMemo, useState } from "react";
import { COLORS, PageWrap, PageHeader, Card, MetricCard } from "@/components/ca/ui";
import UploadDataPrompt from "@/components/ca/UploadDataPrompt";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { inrCompact } from "@/components/ca/portalUi";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type InvoiceRow = { id: string; business_id: string; total: number; status: string; paid_at: string | null; created_at: string };

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });

export default function CARevenuePage() {
  const { caFirm } = useCAAuth();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caFirm?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setMonth(since.getMonth() - 11);
      since.setDate(1);
      const { data } = await supabase
        .from("ca_invoices")
        .select("id, business_id, total, status, paid_at, created_at")
        .eq("ca_firm_id", caFirm.id)
        .gte("created_at", since.toISOString());
      if (!cancelled) {
        setRows((data as InvoiceRow[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caFirm?.id]);

  const { series, annual, perClient, growth, pipeline, clientCount } = useMemo(() => {
    const months: { key: string; m: string }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), m: monthLabel(d) });
    }
    const bucket = new Map(months.map((x) => [x.key, 0]));
    let annualTotal = 0;
    let pipelineTotal = 0;
    const clients = new Set<string>();

    for (const r of rows) {
      const paid = r.status === "paid" || !!r.paid_at;
      const when = new Date(r.paid_at || r.created_at);
      const k = monthKey(when);
      if (paid) {
        annualTotal += Number(r.total) || 0;
        if (bucket.has(k)) bucket.set(k, (bucket.get(k) || 0) + (Number(r.total) || 0));
        clients.add(r.business_id);
      } else {
        pipelineTotal += Number(r.total) || 0;
      }
    }

    const s = months.map((x) => ({ m: x.m, rev: bucket.get(x.key) || 0 }));
    const last = s[s.length - 1]?.rev || 0;
    const prev = s[s.length - 2]?.rev || 0;
    const g = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;

    return {
      series: s,
      annual: annualTotal,
      perClient: clients.size > 0 ? annualTotal / clients.size : 0,
      growth: g,
      pipeline: pipelineTotal,
      clientCount: clients.size,
    };
  }, [rows]);

  const empty = !loading && rows.length === 0;

  return (
    <PageWrap>
      <UploadDataPrompt
        pageId="ca-revenue"
        show={empty}
        message="No practice invoices yet. Raise invoices in Billing, or upload your client data, to see real revenue here."
      />
      <PageHeader title="Revenue Analytics" sub="Your practice revenue from FynHelp clients." />
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Collected (12m)" value={inrCompact(annual)} sub={`From ${clientCount} paying client${clientCount === 1 ? "" : "s"}`} />
        <MetricCard label="Avg per client" value={inrCompact(perClient)} sub="Last 12 months" />
        <MetricCard
          label="MoM Growth"
          value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`}
          valueColor={growth !== null && growth < 0 ? COLORS.redSoft : COLORS.greenSoft}
          sub={growth === null ? "Not enough history" : "Versus last month"}
        />
        <MetricCard label="Unpaid invoices" value={inrCompact(pipeline)} valueColor={COLORS.amberSoft} sub="Awaiting collection" />
      </div>
      <Card>
        <h3 className="text-[15px] font-semibold mb-4">Monthly collections</h3>
        {loading ? (
          <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>Loading...</div>
        ) : empty ? (
          <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>
            Nothing to chart yet. Revenue appears here once invoices are raised and paid.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBD8" />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inrCompact(Number(v))} />
              <Tooltip formatter={(v) => inrCompact(Number(v))} />
              <Line type="monotone" dataKey="rev" stroke={COLORS.red} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </PageWrap>
  );
}
