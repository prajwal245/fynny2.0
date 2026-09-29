import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FYN, MetricCard, WidgetShell, ImpactStat } from "./Shared";

const data = [
  { month: "Jan", mrr: 2.5, churn: 12 },
  { month: "Feb", mrr: 2.7, churn: 11 },
  { month: "Mar", mrr: 3.0, churn: 10 },
  { month: "Apr", mrr: 3.2, churn: 9 },
  { month: "May", mrr: 3.5, churn: 8 },
  { month: "Jun", mrr: 3.8, churn: 7 },
];

const tooltipStyle = {
  background: FYN.ink,
  color: FYN.white,
  borderRadius: 8,
  padding: 12,
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
};

export default function RevenueWidget() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FYN.redBright} />
                  <stop offset="100%" stopColor={FYN.red} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#F3F4F6" strokeDasharray="4 4" />
              <XAxis dataKey="month" stroke={FYN.gray} fontSize={12} />
              <YAxis yAxisId="left" stroke={FYN.gray} fontSize={12} unit="L" />
              <YAxis yAxisId="right" orientation="right" stroke={FYN.gray} fontSize={12} unit="%" />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                yAxisId="left"
                dataKey="mrr"
                fill="url(#mrrFill)"
                radius={[6, 6, 0, 0]}
                animationDuration={1000}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="churn"
                stroke={FYN.ink}
                strokeWidth={2.5}
                dot={{ fill: FYN.red, r: 4 }}
                animationDuration={1400}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </WidgetShell>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <MetricCard label="MRR" value="₹3.8L" delta="+52% in 6 mo" />
        <MetricCard label="Churn" value="7%" delta="−5pts" />
      </div>

      <ImpactStat stat="Customers grow MRR 1.5× faster on FYNHelp" source="Internal data, H1 2025" />
    </div>
  );
}
