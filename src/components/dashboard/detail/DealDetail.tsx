import { X } from "lucide-react";
import { useDealDetail } from "@/hooks/dashboard/useDashboardData";
import { useMode } from "@/components/intelligence/DataSource";
import { formatINR } from "@/lib/indian-format";
import { FynLoading, FynButton } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";
import { useDrawer } from "../DetailDrawer";

export default function DealDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useDealDetail(id);
  const { open } = useDrawer();
  const mode = useMode();
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const d = data.deal as any;
  if (!d) return <div className="p-fyn-lg text-fyn-ink-60">Deal not found.</div>;
  const weighted = Number(d.deal_value) * Number(d.probability) / 100;
  const isClosed = d.is_won || d.is_lost;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={d.deal_name}
        subtitle={d.customer_name || "—"}
        badges={<StatusBadgeFor kind="deal" value={d.is_won ? "Closed Won" : d.is_lost ? "Closed Lost" : d.stage} />}
        meta={[
          { label: "Owner", value: d.owner_name || "—" },
          { label: "Close date", value: d.close_date ? new Date(d.close_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
        ]}
      />

      <DrawerSection>
        <DrawerMetricRow
          items={[
            { label: "Deal Value", value: formatINR(Number(d.deal_value)) },
            { label: "Probability", value: `${Number(d.probability).toFixed(0)}%` },
            { label: "Weighted", value: formatINR(weighted), sub: isClosed ? undefined : "value × probability" },
          ]}
        />
      </DrawerSection>

      {d.is_won && data.customer && (
        <DrawerSection title="Linked customer">
          <p className="text-fyn-small text-fyn-ink-60 mb-fyn-sm">
            This deal closed-won and the customer is active in your book.
          </p>
          <FynButton variant="secondary" onClick={() => open("customer", data.customer.id)}>
            View {data.customer.customer_name} →
          </FynButton>
        </DrawerSection>
      )}

      {d.is_lost && (
        <DrawerSection title="Outcome">
          <p className="text-fyn-small text-fyn-ink-60">
            Marked closed-lost. Pipeline value excluded from forecasts.
          </p>
        </DrawerSection>
      )}
    </div>
  );
}
