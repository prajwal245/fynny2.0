import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FYN, MetricCard, WidgetShell, ImpactStat } from "./Shared";

const data = [
  { month: "M1", cash: 8.2, projected: 8.2 },
  { month: "M2", cash: 6.5, projected: 7.4 },
  { month: "M3", cash: 4.8, projected: 6.6 },
  { month: "M4", cash: 3.2, projected: 5.8 },
  { month: "M5", cash: null, projected: 5.0 },
  { month: "M6", cash: null, projected: 4.2 },
  { month: "M7", cash: null, projected: 3.4 },
];

const tooltipStyle = {
  background: FYN.ink,
  color: FYN.white,
  borderRadius: 8,
  padding: 12,
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: 13,
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
};

export default function LiquidityWidget() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="liqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FYN.red} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={FYN.red} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#F3F4F6" strokeDasharray="4 4" />
              <XAxis dataKey="month" stroke={FYN.gray} fontSize={12} />
              <YAxis stroke={FYN.gray} fontSize={12} unit="L" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: FYN.white, fontWeight: 700 }}
                formatter={(v: number) => [`₹${v}L`, "Cash"]}
              />
              <Area
                type="monotone"
                dataKey="cash"
                stroke={FYN.red}
                strokeWidth={2.5}
                fill="url(#liqFill)"
                animationDuration={1000}
              />
              <Area
                type="monotone"
                dataKey="projected"
                stroke={FYN.redBright}
                strokeDasharray="6 4"
                strokeWidth={2}
                fill="none"
                animationDuration={1200}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </WidgetShell>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <MetricCard label="Runway" value="6.8 mo" delta="from 4.2 mo" />
        <MetricCard label="Burn Rate" value="₹2.1L/mo" delta="−18% MoM" />
      </div>

      <ImpactStat stat="Extends runway by 2.6 months on average" source="FYNHelp customer cohort, 2025" />
    </div>
  );
}
