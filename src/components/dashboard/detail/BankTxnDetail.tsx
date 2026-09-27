import { X } from "lucide-react";
import { useBankTxnDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";

export default function BankTxnDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useBankTxnDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const t = data as any;
  const isCredit = t.type === "credit";

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={
          <span className={isCredit ? "text-[#1F5A46]" : "text-fyn-red"}>
            {isCredit ? "+" : "−"}{formatINR(Number(t.amount))}
          </span>
        }
        subtitle={new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
        badges={
          <>
            <StatusBadgeFor kind="txn" value={t.type} />
            {t.category && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-fyn-tiny font-medium bg-[#F1F5F9] text-[#475569]">
                {t.category}
              </span>
            )}
            {t.reconciled && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-fyn-tiny font-medium bg-[#DCFCE7] text-[#16A34A]">
                Reconciled
              </span>
            )}
          </>
        }
      />

      <DrawerSection>
        <DrawerMetricRow
          items={[
            { label: "Amount", value: formatINR(Number(t.amount)) },
            { label: "Running balance", value: formatINR(Number(t.balance)) },
            { label: "Type", value: isCredit ? "Credit" : "Debit" },
          ]}
        />
      </DrawerSection>

      <DrawerSection title="Description">
        <p className="text-fyn-body text-fyn-ink leading-relaxed break-words">
          {t.description || "—"}
        </p>
        <p className="text-fyn-tiny text-fyn-ink-45 mt-fyn-sm">
          Source trace is encoded in the description (e.g. invoice number for customer payments, vendor and category for expenses) so you can match it against your books directly.
        </p>
      </DrawerSection>
    </div>
  );
}
