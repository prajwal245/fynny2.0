import { X, AlertTriangle } from "lucide-react";
import { useInsuranceDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";

export default function InsuranceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useInsuranceDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const p = data as any;
  const daysToExpiry = p.expiry_date ? Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / 86400000) : null;
  const premiumRate = Number(p.coverage_amount) > 0 ? (Number(p.annual_premium) / Number(p.coverage_amount)) * 100 : 0;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={p.policy_type}
        subtitle={p.provider}
        badges={
          <>
            <StatusBadgeFor kind="policy" value={p.status} />
            {!p.is_adequate && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-fyn-tiny font-medium bg-[#FEF3E2] text-[#8B5A00]">
                <AlertTriangle size={11} /> Underinsured
              </span>
            )}
          </>
        }
        meta={[
          { label: "Expiry", value: p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
          ...(daysToExpiry !== null ? [{ label: "Renews in", value: daysToExpiry > 0 ? `${daysToExpiry} days` : `${Math.abs(daysToExpiry)} days ago` }] : []),
        ]}
      />

      <DrawerSection>
        <DrawerMetricRow
          items={[
            { label: "Coverage", value: formatINR(Number(p.coverage_amount)) },
            { label: "Annual Premium", value: formatINR(Number(p.annual_premium)) },
            { label: "Rate", value: `${premiumRate.toFixed(2)}%`, sub: "of coverage" },
          ]}
        />
      </DrawerSection>

      {!p.is_adequate && (
        <DrawerSection title="Adequacy Review">
          <div className="bg-[#FEF3E2] border border-[#F5C97A] rounded-md p-fyn-md">
            <p className="text-fyn-small text-[#8B5A00] leading-relaxed">
              <strong>This policy is flagged as underinsured.</strong> The current coverage of {formatINR(Number(p.coverage_amount))} is below the recommended level for a business of this size and risk profile. Review with your broker before the next renewal.
            </p>
          </div>
        </DrawerSection>
      )}
    </div>
  );
}
