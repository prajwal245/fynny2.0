import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { FYN, ImpactStat, MetricCard, WidgetShell } from "./Shared";

const data = [
  { name: "Vendor", value: 45 },
  { name: "Payroll", value: 30 },
  { name: "Operations", value: 15 },
  { name: "Marketing", value: 10 },
];

const colors = [FYN.red, FYN.redBright, "#8B6914", FYN.ink];

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

export default function CostWidget() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div style={{ height: 240, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Share"]} />
              <Pie
                data={data}
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                animationDuration={1200}
                animationBegin={200}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i]} stroke={FYN.white} strokeWidth={3} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 28,
                color: FYN.red,
                lineHeight: 1,
              }}
            >
              32%
            </div>
            <div
              style={{
                fontFamily: "'Raleway', sans-serif",
                fontWeight: 600,
                fontSize: 11,
                color: FYN.gray,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginTop: 4,
              }}
            >
              Reduction
            </div>
          </div>
        </div>
      </WidgetShell>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <MetricCard label="Saved Monthly" value="₹45K" delta="vs last quarter" />
        <MetricCard label="Vendors Optimized" value="8" delta="of 24 reviewed" />
      </div>

      <ImpactStat stat="Cuts non-essential spend 32% on average" source="FYNHelp customer benchmarks" />
    </div>
  );
}
