import { Sparkles } from "lucide-react";
import { FYN, ImpactStat, WidgetShell } from "./Shared";

export default function GenericWidget({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <WidgetShell>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 16px",
            gap: 14,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${FYN.red}, ${FYN.redBright})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 12px 28px rgba(196,30,30,0.3)",
            }}
          >
            <Sparkles size={32} color={FYN.white} />
          </div>
          <div
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontWeight: 700,
              fontSize: 22,
              color: FYN.ink,
            }}
          >
            {name} is on the way
          </div>
          <div
            style={{
              fontFamily: "'Roboto', sans-serif",
              fontSize: 14,
              color: FYN.gray,
              maxWidth: 380,
              lineHeight: 1.55,
            }}
          >
            Join the waitlist to get early access and lifetime perks when this suite goes live.
          </div>
        </div>
      </WidgetShell>

      <ImpactStat stat="Be first in line for early access" source="Limited to first 100 businesses" />
    </div>
  );
}
