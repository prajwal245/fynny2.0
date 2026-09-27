import { useNavigate } from "@/lib/router-compat";
import { X } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCustomerDetail } from "@/hooks/dashboard/useDashboardData";
import { useMode } from "@/components/intelligence/DataSource";
import { formatINR } from "@/lib/indian-format";
import { FynButton, FynLoading, FynTable, FynTH, FynTR, FynTD, FynLabel } from "@/components/dashboard/ui";
import { DrawerHeader, DrawerSection, DrawerMetricRow, StatusBadgeFor } from "./parts";
import { useDrawer } from "../DetailDrawer";

export default function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useCustomerDetail(id);
  const { open } = useDrawer();
  const navigate = useNavigate();
  const base = useMode() === "demo" ? "/demo" : "/dashboard";

  if (isLoading || !data?.customer) return <div className="p-fyn-lg"><FynLoading rows={4} /></div>;
  const c = data.customer;
  const invoices = data.invoices;
  const wonDeal = data.wonDeal;
  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.paid_amount || 0), 0);
  const outstanding = invoices.reduce((s, i) => s + Number(i.outstanding_amount || 0), 0);
  const hasOverdue = invoices.some((i) => i.status === "overdue");

  // On-time payment rate (paid invoices only)
  const paidInvoices = invoices.filter((i) => i.status === "paid" && i.payment_date && i.due_date);
  const onTime = paidInvoices.filter((i) => new Date(i.payment_date!) <= new Date(i.due_date!)).length;
  const late = paidInvoices.length - onTime;
  const hasPaymentHistory = paidInvoices.length > 0;
  const onTimeRate = hasPaymentHistory ? (onTime / paidInvoices.length) * 100 : 0;
  const lowOnTime = hasPaymentHistory && onTimeRate < 70;

  // Sparkline data (asc by invoice_date, ≥3 invoices)
  const sparkData = [...invoices]
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))
    .map((i) => ({
      date: i.invoice_date,
      amount: Number(i.total_amount || 0),
      label: new Date(i.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    }));
  const showSpark = sparkData.length >= 3;

  return (
    <div className="relative">
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-fyn-md top-fyn-md text-fyn-ink-60 hover:text-fyn-ink z-10"
      >
        <X size={20} />
      </button>

      <DrawerHeader
        title={c.customer_name}
        subtitle={[c.customer_category, c.city, c.state].filter(Boolean).join(" • ")}
        meta={[
          { label: "Contact", value: c.contact_person || "—" },
          { label: "Email", value: c.email || "—" },
          { label: "Phone", value: c.phone || "—" },
          { label: "GSTIN", value: c.gstin || "—" },
        ]}
      />

      <DrawerSection>
        <DrawerMetricRow
          items={[
            { label: "Total Revenue", value: formatINR(totalRevenue) },
            { label: "Outstanding", value: formatINR(outstanding) },
            { label: "Terms", value: `${c.payment_terms_days || 30}d` },
          ]}
        />
      </DrawerSection>

      <DrawerSection title="Payment behavior">
        {hasPaymentHistory ? (
          <div className={`rounded-md p-fyn-sm border ${lowOnTime ? "border-fyn-red/40 bg-fyn-red/5" : "bg-fyn-beige-card border-fyn-ink-10"}`}>
            <FynLabel>On-time payment rate</FynLabel>
            <p className={`font-mono text-fyn-h2 mt-1 ${lowOnTime ? "text-fyn-red" : "text-fyn-ink"}`}>
              {onTimeRate.toFixed(1)}%
            </p>
            <p className="text-fyn-small text-fyn-ink-60 mt-1">
              {onTime} of {paidInvoices.length} invoice{paidInvoices.length === 1 ? "" : "s"} paid on time
              {late > 0 ? ` • ${late} late` : ""}
            </p>
            {lowOnTime && (
              <p className="text-fyn-tiny text-fyn-red mt-fyn-xs">
                Below 70% — factor extended DSO into cash-flow planning for this customer.
              </p>
            )}
          </div>
        ) : (
          <p className="text-fyn-small text-fyn-ink-45">Not enough payment history yet.</p>
        )}
      </DrawerSection>

      {showSpark && (
        <DrawerSection title="Invoice history">
          <div className="h-32 -mx-fyn-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(24 53% 7% / 0.45)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: any) => formatINR(Number(v))}
                  labelStyle={{ fontSize: 11 }}
                  contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                />
                <Line type="monotone" dataKey="amount" stroke="hsl(0 73% 44%)" strokeWidth={2} dot={{ r: 2.5, fill: "hsl(0 73% 44%)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DrawerSection>
      )}

      {wonDeal && (
        <DrawerSection title="How this customer was acquired">
          <dl className="grid grid-cols-2 gap-fyn-xs text-fyn-small">
            <div><dt className="text-fyn-ink-45">Deal</dt><dd className="text-fyn-ink font-medium">{wonDeal.deal_name}</dd></div>
            <div><dt className="text-fyn-ink-45">Deal value</dt><dd className="text-fyn-ink font-medium font-mono">{formatINR(Number(wonDeal.deal_value || 0))}</dd></div>
            <div><dt className="text-fyn-ink-45">Closed</dt><dd className="text-fyn-ink">{wonDeal.close_date ? new Date(wonDeal.close_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</dd></div>
            <div><dt className="text-fyn-ink-45">Owner</dt><dd className="text-fyn-ink">{wonDeal.owner_name || "—"}</dd></div>
          </dl>
          <FynButton variant="secondary" onClick={() => open("deal", wonDeal.id)}>
            View deal →
          </FynButton>
        </DrawerSection>
      )}

      <DrawerSection title="Invoice History">
        {invoices.length === 0 ? (
          <p className="text-fyn-small text-fyn-ink-45">No invoices yet.</p>
        ) : (
          <FynTable>
            <thead>
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Invoice #</FynTH>
                <FynTH>Date</FynTH>
                <FynTH align="right">Amount</FynTH>
                <FynTH>Status</FynTH>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <FynTR
                  key={i.id}
                  className="cursor-pointer"
                  onClick={() => open("invoice", i.id)}
                >
                  <FynTD mono>{i.invoice_number}</FynTD>
                  <FynTD>{new Date(i.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(i.total_amount))}</FynTD>
                  <FynTD><StatusBadgeFor kind="invoice" value={i.status} /></FynTD>
                </FynTR>
              ))}
            </tbody>
          </FynTable>
        )}
      </DrawerSection>

      <div className="p-fyn-lg flex gap-fyn-sm flex-wrap">
        {hasOverdue && (
          <FynButton variant="primary" onClick={() => alert("Reminder sent (demo)")}>
            Send Reminder
          </FynButton>
        )}
        <FynButton
          variant="secondary"
          onClick={() => navigate(`${base}/invoices?customer=${encodeURIComponent(c.customer_name)}`)}
        >
          View All Invoices →
        </FynButton>
      </div>
    </div>
  );
}
