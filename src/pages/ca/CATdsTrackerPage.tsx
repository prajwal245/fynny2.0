import { useEffect, useMemo, useState } from "react";
import { COLORS, PageWrap, PageHeader, Card, MetricCard, Chip } from "@/components/ca/ui";
import { GspLimitationBanner } from "@/components/ca/GspLimitationBanner";
import UploadDataPrompt from "@/components/ca/UploadDataPrompt";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { inr, inrCompact, dateIN } from "@/components/ca/portalUi";

type TdsRow = {
  id: string;
  business_id: string;
  quarter: string | null;
  section_code: string | null;
  deductee_name: string | null;
  payment_date: string | null;
  tds_amount: number | null;
  deposited_amount: number | null;
  challan_date: string | null;
  return_filed: boolean | null;
};

export default function CATdsTrackerPage() {
  const { caFirm } = useCAAuth();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<TdsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caFirm?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("ca_tds_records")
        .select("id, business_id, quarter, section_code, deductee_name, payment_date, tds_amount, deposited_amount, challan_date, return_filed")
        .eq("ca_firm_id", caFirm.id)
        .order("payment_date", { ascending: false })
        .limit(500);
      if (!cancelled) { setRows((data as TdsRow[]) || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [caFirm?.id]);

  const nameOf = useMemo(() => {
    const m = new Map(clients.map((c) => [c.business_id, c.client_name]));
    return (id: string) => m.get(id) || "Client";
  }, [clients]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let dueThisMonth = 0;
    let depositedYtd = 0;
    let lateCount = 0;
    const dueClients = new Set<string>();

    for (const r of rows) {
      const tds = Number(r.tds_amount) || 0;
      const dep = Number(r.deposited_amount) || 0;
      depositedYtd += dep;
      const pending = Math.max(tds - dep, 0);
      const pay = r.payment_date ? new Date(r.payment_date) : null;
      if (pending > 0 && pay && pay >= monthStart) {
        dueThisMonth += pending;
        dueClients.add(r.business_id);
      }
      if (pay && !r.challan_date) {
        const days = Math.floor((now.getTime() - pay.getTime()) / 86400000);
        if (days > 37 && pending > 0) lateCount += 1;
      }
    }
    return { dueThisMonth, depositedYtd, lateCount, dueClientCount: dueClients.size };
  }, [rows]);

  const empty = !loading && rows.length === 0;

  return (
    <PageWrap>
      <UploadDataPrompt
        pageId="ca-tds"
        show={empty}
        message="No TDS records yet. Upload client payment data or Tally files to see real TDS positions here."
      />
      <GspLimitationBanner />
      <PageHeader title="TDS Tracker" sub="TDS deposits and returns across your portfolio." />
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="TDS Due This Month" value={inrCompact(stats.dueThisMonth)} valueColor={COLORS.amberSoft} sub={`Across ${stats.dueClientCount} client${stats.dueClientCount === 1 ? "" : "s"}`} />
        <MetricCard label="Deposited" value={inrCompact(stats.depositedYtd)} valueColor={COLORS.greenSoft} sub="All recorded challans" />
        <MetricCard label="Late Deposits" value={String(stats.lateCount)} valueColor={stats.lateCount > 0 ? COLORS.redSoft : "#FFFFFF"} sub="Penalty risk" />
        <MetricCard label="Records" value={String(rows.length)} sub="TDS entries on file" />
      </div>
      <Card>
        <h3 className="text-[15px] font-semibold mb-4">Client TDS status</h3>
        {loading ? (
          <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>Loading...</div>
        ) : empty ? (
          <div className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>
            No TDS records for your practice yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase" style={{ color: "rgba(23,18,8,0.50)" }}>
              <th className="py-2">Client</th><th className="py-2">Section</th><th className="py-2">Payment date</th><th className="py-2">TDS</th><th className="py-2">Status</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r) => {
                const pending = (Number(r.tds_amount) || 0) - (Number(r.deposited_amount) || 0);
                const status = r.return_filed ? "Filed" : pending > 0 ? "Pending" : "Deposited";
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.divider}` }}>
                    <td className="py-3 font-medium">{nameOf(r.business_id)}</td>
                    <td className="py-3 text-[12px] font-mono">{r.section_code || "—"}</td>
                    <td className="py-3 text-[13px]">{dateIN(r.payment_date)}</td>
                    <td className="py-3 font-semibold">{inr(r.tds_amount)}</td>
                    <td className="py-3"><Chip tone={status === "Filed" ? "green" : status === "Pending" ? "amber" : "blue"}>{status}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PageWrap>
  );
}
