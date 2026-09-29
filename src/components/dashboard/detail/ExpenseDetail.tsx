import { X } from "lucide-react";
import { useExpenseDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynButton, FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, StatusBadgeFor } from "./parts";

export default function ExpenseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useExpenseDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const e = data as any;
  const vendorName = e.vendors?.vendor_name;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={e.description || e.category || "Expense"}
        subtitle={[e.category, e.subcategory].filter(Boolean).join(" → ")}
        badges={<StatusBadgeFor kind="expense" value={e.payment_status} />}
        meta={[
          { label: "Vendor", value: vendorName || "—" },
          { label: "Date", value: new Date(e.date).toLocaleDateString("en-IN") },
          { label: "Due", value: e.due_date ? new Date(e.due_date).toLocaleDateString("en-IN") : "—" },
          { label: "Method", value: e.payment_method || "—" },
        ]}
      />

      <DrawerSection title="Amount">
        <p className="font-mono text-fyn-h1 text-fyn-ink">{formatINR(Number(e.amount))}</p>
      </DrawerSection>

      <div className="p-fyn-lg flex gap-fyn-sm flex-wrap">
        {e.payment_status === "Pending" && (
          <FynButton variant="primary" onClick={() => alert("Marked paid (demo)")}>Mark as Paid</FynButton>
        )}
        <FynButton variant="ghost" onClick={() => alert("Receipt download not implemented in demo")}>Download Receipt</FynButton>
      </div>
    </div>
  );
}
