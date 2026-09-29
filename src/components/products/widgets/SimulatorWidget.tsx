import { useState } from "react";
import { motion } from "framer-motion";
import { FYN, MetricCard, WidgetShell, ImpactStat } from "./Shared";

export default function SimulatorWidget() {
  const [hires, setHires] = useState(2);

  const baseRunway = 6.8;
  const baseBurn = 210; // K
  const perHireBurn = 45; // K/month

  const newBurn = baseBurn + hires * perHireBurn;
  const newRunway = (baseRunway * baseBurn) / newBurn;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div
              style={{
                fontFamily: "'Raleway', sans-serif",
                fontWeight: 600,
                fontSize: 12,
                color: FYN.gray,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              New hires
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 36,
                color: FYN.red,
                lineHeight: 1,
                marginBottom: 16,
              }}
            >
              0 → {hires}
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={hires}
              onChange={(e) => setHires(Number(e.target.value))}
              className="fyn-sim-slider"
              style={{
                width: "100%",
                accentColor: FYN.red,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                color: FYN.gray,
                marginTop: 6,
              }}
            >
              <span>0</span>
              <span>10</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <motion.div key={`r-${hires}`} initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
              <MetricCard
                label="Runway"
                value={`${newRunway.toFixed(1)} mo`}
                delta={`from ${baseRunway} mo`}
                deltaPositive={newRunway >= baseRunway}
              />
            </motion.div>
            <motion.div key={`b-${hires}`} initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
              <MetricCard
                label="Burn Rate"
                value={`₹${(newBurn / 100).toFixed(1)}L`}
                delta={hires > 0 ? `+₹${hires * perHireBurn}K/mo` : "no change"}
                deltaPositive={hires === 0}
              />
            </motion.div>
          </div>
        </div>
      </WidgetShell>

      <ImpactStat stat="Test any decision before you spend a rupee" source="Live in beta, Q4 2026" />
    </div>
  );
}
