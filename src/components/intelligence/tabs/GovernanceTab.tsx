import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useBalanceSheet } from "../DataSource";
import { IntelCard, fmtCompact, ACCENT, CHART, ChartGradients, WithData } from "../_primitives";
import { BalanceSheetSection, RiskRegisterSection, InsuranceSection } from "./sections/NewSections";
import { EmptyCard } from "@/components/intelligence/EmptyCard";

export default function GovernanceTab() {
  const { data: snapshots } = useBalanceSheet();

  const trend = useMemo(() => {
    return (snapshots ?? []).slice().sort((a: any, b: any) => a.snapshot_date.localeCompare(b.snapshot_date)).map((s: any) => ({
      month: new Date(s.snapshot_date).toLocaleString("en", { month: "short" }),
      Assets: Number(s.total_assets),
      Liabilities: Number(s.total_liabilities),
      Equity: Number(s.total_equity),
    }));
  }, [snapshots]);

  const riskScore = NaN;
  const fxExposure = NaN;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <EmptyCard title="Risk Score" hint="Available once financial history is established." />
        <EmptyCard title="Forecast Accuracy" hint="Available once financial history is established." />
        <EmptyCard title="Budget Adherence" hint="Available once financial history is established." />
        <EmptyCard title="Audit Readiness" hint="Available once financial history is established." />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <EmptyCard title="Risk Categories" hint="Risk register will populate as financial data is imported and analysed." />
        <EmptyCard title="Audit Readiness" hint="Document checklist completion will appear once your compliance data is connected." />
      </div>

      <IntelCard title="Balance Sheet Trend" sub="Assets, Liabilities & Equity — last 3 snapshots">
        <WithData data={trend} emptyTitle="No snapshots yet" emptyDescription="Balance sheet snapshots will appear here." cta={null}>
          {(d) => (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <ChartGradients />
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
                  <Tooltip contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 6, fontSize: 12 }} formatter={(v: number) => fmtCompact(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Assets" fill={ACCENT.green} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Liabilities" fill={ACCENT.red} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Equity" fill={ACCENT.gold} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </WithData>
      </IntelCard>

      <BalanceSheetSection />
      <RiskRegisterSection />
      <InsuranceSection />
    </div>
  );
}
