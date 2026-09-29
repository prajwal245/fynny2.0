import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { FYN, ImpactStat, WidgetShell } from "./Shared";

const alerts = [
  { icon: CheckCircle2, color: FYN.green, text: "₹1.2L ITC Recovered" },
  { icon: AlertTriangle, color: "#F59E0B", text: "3 Pending Invoices" },
  { icon: CheckCircle2, color: FYN.green, text: "GSTR-2B fully reconciled" },
];

export default function GstWidget() {
  const days = 8;
  const total = 30;
  const pct = ((total - days) / total) * 100;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          {/* Countdown ring */}
          <div style={{ position: "relative", width: 160, height: 160 }}>
            <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={FYN.red} />
                  <stop offset="100%" stopColor={FYN.redBright} />
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r={radius} stroke="#F3F4F6" strokeWidth="10" fill="none" />
              <motion.circle
                cx="80"
                cy="80"
                r={radius}
                stroke="url(#ringGrad)"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
                style={{ strokeDasharray: circumference }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 36,
                  color: FYN.red,
                  lineHeight: 1,
                }}
              >
                {days}
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
                Days to filing
              </div>
            </div>
          </div>

          {/* Alerts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((a, i) => {
              const Icon = a.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.12, duration: 0.4 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: FYN.beige,
                    borderRadius: 10,
                    border: `1px solid rgba(107,114,128,0.1)`,
                  }}
                >
                  <Icon size={18} color={a.color} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      fontFamily: "'Roboto', sans-serif",
                      fontWeight: 500,
                      fontSize: 13,
                      color: FYN.ink,
                    }}
                  >
                    {a.text}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </WidgetShell>

      <ImpactStat stat="Zero missed filings, 100% ITC recovered" source="FYNHelp pilot customers" />
    </div>
  );
}
