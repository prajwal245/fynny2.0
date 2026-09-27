import { X } from "lucide-react";
import { useEmployeeDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";

export default function EmployeeDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useEmployeeDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const e = data.employee as any;
  if (!e) return <div className="p-fyn-lg text-fyn-ink-60">Employee not found.</div>;

  const tenureDays = e.joining_date ? Math.floor((Date.now() - new Date(e.joining_date).getTime()) / 86400000) : 0;
  const tenureYears = (tenureDays / 365).toFixed(1);

  const g = data.grant;
  const b = data.benchmark;
  const cliffPassed = g?.cliff_date ? new Date(g.cliff_date) < new Date() : false;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={e.name}
        subtitle={[e.designation, e.department].filter(Boolean).join(" · ")}
        badges={<StatusBadgeFor kind="employee" value={e.status} />}
        meta={[
          { label: "Joined", value: e.joining_date ? new Date(e.joining_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
          { label: "Tenure", value: `${tenureYears} years` },
        ]}
      />

      <DrawerSection>
        <DrawerMetricRow
          items={[
            { label: "Monthly Salary", value: formatINR(Number(e.salary)) },
            { label: "Annual CTC", value: formatINR(Number(e.cost_to_company) * 12) },
            { label: "Department", value: e.department || "—" },
          ]}
        />
      </DrawerSection>

      {g && (
        <DrawerSection title="ESOP Grant">
          <dl className="space-y-fyn-xs text-fyn-body">
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Total options</dt><dd className="font-mono text-fyn-ink">{Number(g.total_options).toLocaleString("en-IN")}</dd></div>
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Vested</dt><dd className="font-mono text-fyn-ink">{Number(g.vested_options).toLocaleString("en-IN")}</dd></div>
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Strike price</dt><dd className="font-mono text-fyn-ink">₹{g.strike_price}</dd></div>
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Current fair value</dt><dd className="font-mono text-fyn-ink">₹{g.current_fair_value}</dd></div>
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Cliff</dt><dd className="text-fyn-ink">{g.cliff_date ? new Date(g.cliff_date).toLocaleDateString("en-IN") : "—"}</dd></div>
          </dl>
          {!cliffPassed && g.cliff_date && Number(g.vested_options) === 0 && (
            <p className="mt-fyn-sm text-fyn-tiny text-fyn-ink-60">
              Pre-cliff: vesting begins on {new Date(g.cliff_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.
            </p>
          )}
        </DrawerSection>
      )}

      {b && (
        <DrawerSection title="Compensation Benchmark">
          <dl className="space-y-fyn-xs text-fyn-body">
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Market 50th percentile</dt><dd className="font-mono text-fyn-ink">{formatINR(Number(b.market_50th))}</dd></div>
            <div className="flex justify-between"><dt className="text-fyn-ink-60">Market 75th percentile</dt><dd className="font-mono text-fyn-ink">{formatINR(Number(b.market_75th))}</dd></div>
            <div className="flex justify-between"><dt className="text-fyn-ink-60">This employee at</dt><dd className="font-mono text-fyn-ink">P{Number(b.percentile_position).toFixed(0)}</dd></div>
            <div className="flex justify-between items-center"><dt className="text-fyn-ink-60">Position</dt><dd>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-fyn-tiny font-medium ${
                /below|under/i.test(b.competitiveness) ? "bg-[#FEF3E2] text-[#8B5A00]" :
                /above|over/i.test(b.competitiveness) ? "bg-[#DCFCE7] text-[#16A34A]" :
                "bg-[#F1F5F9] text-[#475569]"
              }`}>{b.competitiveness}</span>
            </dd></div>
          </dl>
          {/below|under/i.test(b.competitiveness || "") && (
            <p className="mt-fyn-sm text-fyn-tiny text-fyn-ink-60">
              Compensation is below market median for this role — flag for next comp review.
            </p>
          )}
        </DrawerSection>
      )}
    </div>
  );
}
