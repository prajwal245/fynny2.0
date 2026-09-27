import { motion } from "framer-motion";
import { FYN, ImpactStat, WidgetShell } from "./Shared";

export default function FynnyWidget() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* User bubble */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
          >
            <div
              style={{
                background: "#F3F4F6",
                color: FYN.ink,
                borderRadius: "18px 18px 4px 18px",
                padding: "12px 18px",
                maxWidth: "75%",
                fontFamily: "'Roboto', sans-serif",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              What's my burn rate?
            </div>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: FYN.ink,
                color: FYN.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              You
            </div>
          </motion.div>

          {/* Typing dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.2, delay: 0.4, times: [0, 0.2, 0.85, 1] }}
            style={{ display: "flex", gap: 6, padding: "0 42px" }}
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: FYN.gray,
                  display: "inline-block",
                }}
              />
            ))}
          </motion.div>

          {/* Fynny bubble */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1.6 }}
            style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${FYN.red}, ${FYN.redBright})`,
                color: FYN.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              F
            </div>
            <div
              style={{
                background: `linear-gradient(135deg, ${FYN.red} 0%, ${FYN.redBright} 100%)`,
                color: FYN.white,
                borderRadius: "18px 18px 18px 4px",
                padding: "12px 18px",
                maxWidth: "80%",
                fontFamily: "'Roboto', sans-serif",
                fontWeight: 500,
                fontSize: 14,
                lineHeight: 1.55,
                boxShadow: "0 8px 20px rgba(196,30,30,0.25)",
              }}
            >
              ₹2.1L/month. At current reserves, you have 4.2 months runway. Consider reducing
              vendor X to extend to 5.8 months.
            </div>
          </motion.div>
        </div>
      </WidgetShell>

      <ImpactStat stat="Get CFO-grade answers in seconds, 24/7" source="CFO Fynny, live now" />
    </div>
  );
}
