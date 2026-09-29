/**
 * Task 5 — alerts generated from real data (liquidity runway, GST due dates,
 * critical cost anomalies). No hardcoded alerts.
 */
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useGeneratedAlerts, LiveAlert } from "@/hooks/useExternalIntel";
import { useMode } from "./DataSource";
import { ACCENT } from "./_primitives";

const TONE: Record<LiveAlert["severity"], { color: string; Icon: typeof AlertTriangle }> = {
  critical: { color: ACCENT.red, Icon: AlertCircle },
  warning: { color: ACCENT.amber, Icon: AlertTriangle },
  info: { color: "#2563EB", Icon: Info },
};

export default function LiveAlerts({ compact }: { compact?: boolean }) {
  const mode = useMode();
  const alerts = useGeneratedAlerts();
  if (mode !== "live" || alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const { color, Icon } = TONE[a.severity];
        return (
          <div
            key={a.id}
            className="bg-white rounded-md px-4 py-3 flex items-start gap-3"
            style={{ border: "1px solid rgba(23,18,8,0.08)", borderLeft: `4px solid ${color}` }}
          >
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fyn-ink">{a.title}</p>
              {!compact && a.detail && (
                <p className="text-xs text-fyn-ink/60 mt-0.5 leading-relaxed">{a.detail}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
