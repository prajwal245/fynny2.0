/**
 * Live cockpit panel — wired to the new seeded tables (customers, invoices,
 * expenses, bank_transactions, vendors, employees_demo, gst_filings_demo).
 *
 * Every metric card is clickable and either navigates to its list page or
 * opens the detail drawer. Drives the drill-down UX from the cockpit.
 */
import { Link, useNavigate } from "@/lib/router-compat";
import { ArrowUpRight, TrendingDown, Wallet, Clock, Users, AlertTriangle, Receipt } from "lucide-react";
import {
  FynCard, FynCardTitle, FynLabel, FynBadge, FynSectionTitle, FynLoading,
} from "@/components/dashboard/ui";
import { StatusBadgeFor } from "@/components/dashboard/detail/parts";
import DetailDrawer, { useDrawer } from "@/components/dashboard/DetailDrawer";
import {
  useLiquiditySummary, useInvoices, useExpenses,
  useTopCustomers, useVendorSpend, usePersonnelCosts, useExpensesByCategory,
} from "@/hooks/dashboard/useDashboardData";
import { useMode } from "@/components/intelligence/DataSource";
import { formatINR, getRunwayColor } from "@/lib/indian-format";
import { cn } from "@/lib/utils";

function ClickCard({
  label, value, sub, onClick, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  onClick: () => void;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative text-left bg-fyn-beige-card border border-fyn-ink-10 rounded-lg p-fyn-md w-full",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(196,30,30,0.12)] hover:border-fyn-ink-25",
      )}
    >
      <ArrowUpRight size={14} className="absolute top-3 right-3 text-fyn-ink-40 opacity-30" />
      <FynLabel>{label}</FynLabel>
      <p className={cn(
        "font-mono text-fyn-metric mt-fyn-xs",
        tone === "danger" ? "text-fyn-red" : tone === "success" ? "text-fyn-success" : "text-fyn-ink",
      )}>
        {value}
      </p>
      {sub && <p className="text-fyn-tiny text-fyn-ink-45 mt-fyn-xs">{sub}</p>}
    </button>
  );
}

function ViewAllLink({ to }: { to: string }) {
  return (
    <Link to={to} className="text-fyn-tiny text-fyn-red hover:underline inline-flex items-center gap-1">
      View all →
    </Link>
  );
}

export default function LiveCockpitPanel() {
  const navigate = useNavigate();
  const { open } = useDrawer();
  const mode = useMode();
  const base = mode === "demo" ? "/demo" : "/dashboard";
  const liq = useLiquiditySummary();
  const { data: invoices } = useInvoices();
  const { data: expenses } = useExpenses();
  const { top: topCustomers } = useTopCustomers(5);
  const { vendors: topVendors } = useVendorSpend(5);
  const { byDepartment: personnel, total: personnelTotal } = usePersonnelCosts();
  const { categories } = useExpensesByCategory();

  const overdueInvoices = (invoices || []).filter((i) => i.status === "overdue").slice(0, 5);
  const upcomingPayments = (expenses || []).filter((e) => e.payment_status === "Pending").slice(0, 5);

  if (liq.isLoading) return <FynLoading rows={3} />;

  const runwayDays = Math.round(liq.runwayMonths * 30);

  return (
    <section className="space-y-fyn-lg">
      <div className="flex items-center justify-between">
        <FynSectionTitle>Live Snapshot</FynSectionTitle>
        <FynBadge tone="success">Connected · live data</FynBadge>
      </div>

      {/* Liquidity cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-fyn-md">
        <ClickCard
          label="Cash Balance"
          value={formatINR(liq.cashBalance)}
          sub="Latest bank balance"
          onClick={() => navigate(`${base}/banking`)}
        />
        <ClickCard
          label="Gross Burn (30d)"
          value={formatINR(liq.grossBurn)}
          sub="Click to see expenses"
          onClick={() => navigate(`${base}/expenses`)}
        />
        <ClickCard
          label="Net Burn"
          value={formatINR(liq.netBurn)}
          sub={`Revenue: ${formatINR(liq.revenueLast30)}`}
          onClick={() => navigate(`${base}/expenses?status=Pending`)}
        />
        <ClickCard
          label="Runway"
          value={liq.runwayMonths > 90 ? "∞" : `${runwayDays}d`}
          sub={`${liq.runwayMonths.toFixed(1)} months`}
          tone={runwayDays > 90 ? "success" : runwayDays > 30 ? "default" : "danger"}
          onClick={() => navigate(`${base}/liquidity`)}
        />
      </div>

      {/* Overdue invoices & upcoming payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-md">
        <FynCard>
          <div className="flex items-center justify-between mb-fyn-md">
            <FynCardTitle className="!mb-0">
              <span className="inline-flex items-center gap-2"><AlertTriangle size={16} className="text-fyn-red" /> Overdue Invoices</span>
            </FynCardTitle>
            <ViewAllLink to={`${base}/invoices?status=overdue`} />
          </div>
          {overdueInvoices.length === 0 ? (
            <p className="text-fyn-small text-fyn-ink-45">Nothing overdue. Nice.</p>
          ) : (
            <ul className="divide-y divide-fyn-ink-10">
              {overdueInvoices.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => open("invoice", i.id)}
                    className="w-full text-left py-fyn-sm flex items-center justify-between hover:bg-fyn-ink-02 -mx-fyn-md px-fyn-md transition-colors"
                  >
                    <div>
                      <div className="text-fyn-body text-fyn-ink">{i.customer_name || i.invoice_number}</div>
                      <div className="text-fyn-tiny text-fyn-ink-45 font-mono">{i.invoice_number}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-fyn-body text-fyn-red">{formatINR(Number(i.outstanding_amount))}</div>
                      <StatusBadgeFor kind="invoice" value={i.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FynCard>

        <FynCard>
          <div className="flex items-center justify-between mb-fyn-md">
            <FynCardTitle className="!mb-0">
              <span className="inline-flex items-center gap-2"><Clock size={16} className="text-fyn-ink-60" /> Upcoming Payments</span>
            </FynCardTitle>
            <ViewAllLink to={`${base}/expenses?status=Pending`} />
          </div>
          {upcomingPayments.length === 0 ? (
            <p className="text-fyn-small text-fyn-ink-45">No pending payments.</p>
          ) : (
            <ul className="divide-y divide-fyn-ink-10">
              {upcomingPayments.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => open("expense", e.id)}
                    className="w-full text-left py-fyn-sm flex items-center justify-between hover:bg-fyn-ink-02 -mx-fyn-md px-fyn-md transition-colors"
                  >
                    <div>
                      <div className="text-fyn-body text-fyn-ink">{e.vendor_name || e.description}</div>
                      <div className="text-fyn-tiny text-fyn-ink-45">{e.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-fyn-body text-fyn-ink">{formatINR(Number(e.amount))}</div>
                      <div className="text-fyn-tiny text-fyn-ink-45">
                        Due {e.due_date ? new Date(e.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FynCard>
      </div>

      {/* Top customers & Vendor spend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-md">
        <FynCard>
          <div className="flex items-center justify-between mb-fyn-md">
            <FynCardTitle className="!mb-0">Top Customers</FynCardTitle>
            <ViewAllLink to={`${base}/customers`} />
          </div>
          {topCustomers.length === 0 ? (
            <p className="text-fyn-small text-fyn-ink-45">No paid invoices yet.</p>
          ) : (
            <ul className="divide-y divide-fyn-ink-10">
              {topCustomers.map((c) => (
                <li key={c.customer_id}>
                  <button
                    onClick={() => open("customer", c.customer_id)}
                    className="w-full text-left py-fyn-sm flex items-center justify-between hover:bg-fyn-ink-02 -mx-fyn-md px-fyn-md transition-colors"
                  >
                    <span className="text-fyn-body text-fyn-ink">{c.customer_name}</span>
                    <span className="font-mono text-fyn-body text-fyn-ink">{formatINR(c.revenue)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FynCard>

        <FynCard>
          <div className="flex items-center justify-between mb-fyn-md">
            <FynCardTitle className="!mb-0">Top Vendor Spend</FynCardTitle>
            <ViewAllLink to={`${base}/vendors`} />
          </div>
          {topVendors.length === 0 ? (
            <p className="text-fyn-small text-fyn-ink-45">No vendor spend yet.</p>
          ) : (
            <ul className="divide-y divide-fyn-ink-10">
              {topVendors.map((v) => (
                <li key={v.vendor_id}>
                  <button
                    onClick={() => open("vendor", v.vendor_id)}
                    className="w-full text-left py-fyn-sm flex items-center justify-between hover:bg-fyn-ink-02 -mx-fyn-md px-fyn-md transition-colors"
                  >
                    <span className="text-fyn-body text-fyn-ink">{v.vendor_name}</span>
                    <span className="font-mono text-fyn-body text-fyn-ink">{formatINR(v.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FynCard>
      </div>

      {/* Cost mix + personnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-fyn-md">
        <FynCard>
          <div className="flex items-center justify-between mb-fyn-md">
            <FynCardTitle className="!mb-0">Expenses by Category</FynCardTitle>
            <ViewAllLink to={`${base}/expenses`} />
          </div>
          <ul className="space-y-fyn-xs">
            {categories.slice(0, 6).map((c) => (
              <li key={c.category}>
                <Link
                  to={`${base}/expenses?category=${encodeURIComponent(c.category)}`}
                  className="flex items-center justify-between text-fyn-small hover:bg-fyn-ink-02 -mx-fyn-md px-fyn-md py-1 rounded transition-colors"
                >
                  <span className="text-fyn-ink-60">{c.category}</span>
                  <span className="font-mono text-fyn-ink">{formatINR(c.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </FynCard>

        <FynCard>
          <div className="flex items-center justify-between mb-fyn-md">
            <FynCardTitle className="!mb-0">
              <span className="inline-flex items-center gap-2"><Users size={16} className="text-fyn-ink-60" /> Personnel Cost</span>
            </FynCardTitle>
            <ViewAllLink to={`${base}/employees`} />
          </div>
          <p className="font-mono text-fyn-h2 text-fyn-ink mb-fyn-sm">{formatINR(personnelTotal)}</p>
          <ul className="space-y-fyn-xs">
            {personnel.map((d) => (
              <li key={d.department} className="flex items-center justify-between text-fyn-small">
                <span className="text-fyn-ink-60">{d.department}</span>
                <span className="font-mono text-fyn-ink">{formatINR(d.total)}</span>
              </li>
            ))}
          </ul>
        </FynCard>
      </div>

      <DetailDrawer />
    </section>
  );
}
