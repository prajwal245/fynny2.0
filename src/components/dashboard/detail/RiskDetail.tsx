import { X } from "lucide-react";
import { useRiskDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";

function RiskHeatmap({ likelihood, impact }: { likelihood: number; impact: number }) {
  // 5x5 grid; impact rows (top=5), likelihood cols (left=1)
  return (
    <div className="inline-grid grid-cols-5 gap-[3px] p-fyn-sm bg-fyn-beige-card border border-fyn-ink-10 rounded-md">
      {Array.from({ length: 25 }).map((_, idx) => {
        const col = (idx % 5) + 1; // likelihood
        const row = 5 - Math.floor(idx / 5); // impact
        const sev = col * row; // 1..25
        const here = col === likelihood && row === impact;
        const bg = sev >= 15 ? "#A93838" : sev >= 9 ? "#D97706" : sev >= 4 ? "#8B6914" : "#1F5A46";
        return (
          <div
            key={idx}
            className="w-5 h-5 rounded-sm"
            style={{
              background: bg,
              opacity: here ? 1 : 0.18,
              outline: here ? "2px solid #171208" : "none",
            }}
            title={`L${col} × I${row} = ${sev}`}
          />
        );
      })}
    </div>
  );
}

export default function RiskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useRiskDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const r = data as any;
  const score = Number(r.risk_score);
  const severity = score >= 15 ? "Critical" : score >= 9 ? "High" : score >= 4 ? "Medium" : "Low";

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={r.risk_name}
        subtitle={r.risk_category}
        badges={
          <>
            <StatusBadgeFor kind="mitigation" value={r.mitigation_status} />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-fyn-tiny font-medium bg-[#F1F5F9] text-[#475569]">
              Severity: {severity}
            </span>
          </>
        }
      />

      <DrawerSection title="Risk Score">
        <DrawerMetricRow
          items={[
            { label: "Likelihood", value: `${r.likelihood} / 5` },
            { label: "Impact", value: `${r.impact} / 5` },
            { label: "Composite", value: score.toFixed(0), sub: severity },
          ]}
        />
      </DrawerSection>

      <DrawerSection title="Heatmap position">
        <div className="flex items-start gap-fyn-md">
          <RiskHeatmap likelihood={Number(r.likelihood)} impact={Number(r.impact)} />
          <div className="text-fyn-tiny text-fyn-ink-45 space-y-1">
            <p>← Likelihood (1–5)</p>
            <p>↑ Impact (1–5)</p>
            <p className="pt-2 text-fyn-ink-60">Position: L{r.likelihood} × I{r.impact}</p>
          </div>
        </div>
      </DrawerSection>

      {Number(r.current_exposure) > 0 && (
        <DrawerSection title="Current Exposure">
          <p className="font-mono text-fyn-h1 text-fyn-ink">{formatINR(Number(r.current_exposure))}</p>
          <p className="text-fyn-small text-fyn-ink-60 mt-fyn-xs">
            Estimated financial exposure if this risk materialises before mitigation.
          </p>
        </DrawerSection>
      )}
    </div>
  );
}
