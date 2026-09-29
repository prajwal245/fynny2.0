import { X } from "lucide-react";
import { toast } from "sonner";
import { useGstFilingDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynButton, FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";

export default function GstFilingDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useGstFilingDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const f = data as any;
  const isFiled = /filed/i.test(f.status);
  const daysToDue = f.due_date && !isFiled
    ? Math.ceil((new Date(f.due_date).getTime() - Date.now()) / 86400000)
    : null;
  const itcInsight = Number(f.itc_claimed) > 0 && Number(f.tax_liability) > 0
    ? `Input Tax Credit reduced this period's liability by ${formatINR(Number(f.itc_claimed))} (${((Number(f.itc_claimed) / Number(f.tax_liability)) * 100).toFixed(0)}% offset).`
    : null;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={`${f.filing_type} · ${f.period}`}
        subtitle={isFiled ? "Filed return" : "Pending return"}
        badges={
          <>
            <StatusBadgeFor kind="filing" value={f.status} />
            {daysToDue !== null && daysToDue >= 0 && daysToDue <= 7 && (
              <StatusBadgeFor kind="filing" value="overdue" />
            )}
          </>
        }
        meta={[
          { label: "Due date", value: f.due_date ? new Date(f.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
          { label: "Filed on", value: f.filed_date ? new Date(f.filed_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
          ...(daysToDue !== null ? [{ label: "Window", value: daysToDue >= 0 ? `${daysToDue} days remaining` : `${Math.abs(daysToDue)} days overdue` }] : []),
        ]}
      />

      <DrawerSection title="Liability">
        <DrawerMetricRow
          items={[
            { label: "Tax Liability", value: formatINR(Number(f.tax_liability)) },
            { label: "ITC Claimed", value: formatINR(Number(f.itc_claimed)) },
            { label: "Net Payable", value: formatINR(Number(f.net_payable)) },
          ]}
        />
      </DrawerSection>

      {itcInsight && (
        <DrawerSection>
          <p className="text-fyn-small text-fyn-ink-60 leading-relaxed">{itcInsight}</p>
        </DrawerSection>
      )}

      <div className="p-fyn-lg flex gap-fyn-sm flex-wrap">
        {!isFiled && (
          <FynButton variant="primary" onClick={() => toast.success(`${f.filing_type} for ${f.period} queued for filing`)}>
            File Now
          </FynButton>
        )}
        <FynButton variant="ghost" onClick={() => toast.message("Challan download not available in demo")}>
          Download Challan
        </FynButton>
      </div>
    </div>
  );
}
