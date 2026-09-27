import { useNavigate } from "@/lib/router-compat";
import { X } from "lucide-react";
import { useVendorDetail } from "@/hooks/dashboard/useDashboardData";
import { useMode } from "@/components/intelligence/DataSource";
import { formatINR } from "@/lib/indian-format";
import { FynButton, FynLoading, FynTable, FynTH, FynTR, FynTD } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";
import { useDrawer } from "../DetailDrawer";

export default function VendorDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useVendorDetail(id);
  const { open } = useDrawer();
  const navigate = useNavigate();
  const base = useMode() === "demo" ? "/demo" : "/dashboard";

  if (isLoading || !data?.vendor) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const v = data.vendor;
  const expenses = data.expenses;
  const totalSpend = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const months = new Set(expenses.map((e) => e.date.slice(0, 7))).size || 1;
  const avgMonthly = totalSpend / months;

  return (
    <div className="relative">
      <button onClick={onClose} aria-label="Close" className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10">
        <X size={20} />
      </button>

      <DrawerHeader
        title={v.vendor_name}
        subtitle={[v.vendor_category, v.city].filter(Boolean).join(" • ")}
        meta={[
          { label: "Contact", value: v.contact_person || "—" },
          { label: "Email", value: v.email || "—" },
          { label: "Phone", value: v.phone || "—" },
          { label: "GSTIN", value: v.gstin || "—" },
          { label: "Terms", value: `${v.payment_terms_days || 30} days` },
        ]}
      />

      <DrawerSection>
        <DrawerMetricRow
          items={[
            { label: "Total Spend", value: formatINR(totalSpend) },
            { label: "Outstanding", value: formatINR(Number(v.total_outstanding || 0)) },
            { label: "Avg Monthly", value: formatINR(avgMonthly) },
          ]}
        />
      </DrawerSection>

      <DrawerSection title="Expense History">
        {expenses.length === 0 ? (
          <p className="text-fyn-small text-fyn-ink-45">No expenses recorded.</p>
        ) : (
          <FynTable>
            <thead>
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Description</FynTH>
                <FynTH>Date</FynTH>
                <FynTH align="right">Amount</FynTH>
                <FynTH>Status</FynTH>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <FynTR key={e.id} className="cursor-pointer" onClick={() => open("expense", e.id)}>
                  <FynTD>{e.description || e.category}</FynTD>
                  <FynTD>{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(e.amount))}</FynTD>
                  <FynTD><StatusBadgeFor kind="expense" value={e.payment_status} /></FynTD>
                </FynTR>
              ))}
            </tbody>
          </FynTable>
        )}
      </DrawerSection>

      <div className="p-fyn-lg flex gap-fyn-sm flex-wrap">
        {Number(v.total_outstanding || 0) > 0 && (
          <FynButton variant="primary" onClick={() => alert("Payment scheduled (demo)")}>Pay Outstanding</FynButton>
        )}
        <FynButton variant="secondary" onClick={() => navigate(`${base}/expenses?vendor=${encodeURIComponent(v.vendor_name)}`)}>
          View All Expenses →
        </FynButton>
      </div>
    </div>
  );
}
