import { X } from "lucide-react";
import { useInvoiceDetail } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FynButton, FynLoading } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, StatusBadgeFor } from "./parts";

export default function InvoiceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useInvoiceDetail(id);
  if (isLoading || !data) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;

  const inv = data as any;
  const customerName = inv.customers?.customer_name || "Unknown customer";
  const daysOverdue =
    inv.due_date && inv.status === "overdue"
      ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000))
      : 0;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={inv.invoice_number}
        subtitle={customerName}
        badges={<StatusBadgeFor kind="invoice" value={inv.status} />}
        meta={[
          { label: "Invoice", value: new Date(inv.invoice_date).toLocaleDateString("en-IN") },
          { label: "Due", value: inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-IN") : "—" },
          ...(daysOverdue > 0
            ? [{ label: "Overdue", value: <span className="text-fyn-red font-semibold">{daysOverdue} days</span> }]
            : []),
        ]}
      />

      <DrawerSection title="Amounts">
        <dl className="space-y-fyn-xs text-fyn-body">
          {[
            ["Subtotal", Number(inv.subtotal)],
            ["Tax (18%)", Number(inv.tax_amount)],
            ["Total", Number(inv.total_amount)],
            ["Paid", Number(inv.paid_amount)],
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between">
              <dt className="text-fyn-ink-60">{label as string}</dt>
              <dd className="font-mono text-fyn-ink">{formatINR(val as number)}</dd>
            </div>
          ))}
          <div className="flex justify-between pt-fyn-xs border-t border-fyn-ink-10">
            <dt className="text-fyn-ink-60 font-semibold">Outstanding</dt>
            <dd className={`font-mono font-semibold ${Number(inv.outstanding_amount) > 0 ? "text-fyn-red" : "text-fyn-ink"}`}>
              {formatINR(Number(inv.outstanding_amount))}
            </dd>
          </div>
        </dl>
      </DrawerSection>

      {inv.payment_date && (
        <DrawerSection title="Payment">
          <p className="text-fyn-small text-fyn-ink-60">
            Paid on {new Date(inv.payment_date).toLocaleDateString("en-IN")}
          </p>
        </DrawerSection>
      )}

      <div className="p-fyn-lg flex gap-fyn-sm flex-wrap">
        {inv.status === "overdue" && (
          <FynButton variant="primary" onClick={() => alert("Reminder sent (demo)")}>Send Reminder</FynButton>
        )}
        {inv.status !== "paid" && inv.status !== "cancelled" && (
          <FynButton variant="secondary" onClick={() => alert("Marked paid (demo)")}>Mark as Paid</FynButton>
        )}
        <FynButton variant="ghost" onClick={() => alert("PDF download not implemented in demo")}>Download PDF</FynButton>
      </div>
    </div>
  );
}
