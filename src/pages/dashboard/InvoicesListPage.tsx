import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ListPageShell, FilterChips, Pagination, useDebounced,
  FynSearchInput, FynSelect,
} from "@/components/dashboard/ListPageShell";
import { FynTable, FynTH, FynTR, FynTD, FynLoading, FynEmpty, FynButton } from "@/components/dashboard/ui";
import { StatusBadgeFor } from "@/components/dashboard/detail/parts";
import DetailDrawer, { useDrawer } from "@/components/dashboard/DetailDrawer";
import { useInvoices } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { FileText } from "lucide-react";

const PAGE_SIZE = 10;

export default function InvoicesListPage() {
  const { data: invoices, isLoading, error } = useInvoices();
  const { open } = useDrawer();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || params.get("customer") || "");
  const [filter, setFilter] = useState(params.get("status") || "all");
  const [sort, setSort] = useState(params.get("sort") || "date");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const filtered = useMemo(() => {
    let list = invoices || [];
    if (filter !== "all") list = list.filter((i) => i.status === filter);
    if (debounced) {
      const q = debounced.toLowerCase();
      list = list.filter((i) => i.invoice_number.toLowerCase().includes(q) || (i.customer_name || "").toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "amount":
          return Number(b.total_amount) - Number(a.total_amount);
        case "status":
          return a.status.localeCompare(b.status);
        case "customer":
          return (a.customer_name || "").localeCompare(b.customer_name || "");
        default:
          return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
      }
    });
    return list;
  }, [invoices, filter, debounced, sort]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) return <DashboardLayout><FynLoading rows={4} /></DashboardLayout>;
  if (error) return <DashboardLayout><FynEmpty icon={<FileText size={28} />} title="Couldn't load invoices" description={(error as Error).message} /></DashboardLayout>;

  return (
    <DashboardLayout>
      <ListPageShell
        title="Invoices"
        count={filtered.length}
        controls={
          <>
            <div className="flex-1 min-w-[220px]">
              <FynSearchInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search invoice # or customer…" />
            </div>
            <FilterChips
              value={filter}
              onChange={(v) => { setFilter(v); setPage(1); }}
              options={[
                { value: "all", label: "All" },
                { value: "paid", label: "Paid" },
                { value: "sent", label: "Sent" },
                { value: "overdue", label: "Overdue" },
                { value: "draft", label: "Draft" },
              ]}
            />
            <FynSelect value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
              <option value="date">Sort: Date</option>
              <option value="amount">Sort: Amount</option>
              <option value="status">Sort: Status</option>
              <option value="customer">Sort: Customer</option>
            </FynSelect>
          </>
        }
      >
        {paged.length === 0 ? (
          <div className="p-fyn-xl text-center text-fyn-ink-45">No matching invoices.</div>
        ) : (
          <FynTable>
            <thead className="bg-fyn-ink-02">
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Invoice #</FynTH>
                <FynTH>Customer</FynTH>
                <FynTH>Date</FynTH>
                <FynTH>Due</FynTH>
                <FynTH align="right">Amount</FynTH>
                <FynTH align="right">Outstanding</FynTH>
                <FynTH>Status</FynTH>
                <FynTH align="right">Actions</FynTH>
              </tr>
            </thead>
            <tbody>
              {paged.map((i) => (
                <FynTR key={i.id} className="cursor-pointer" onClick={() => open("invoice", i.id)}>
                  <FynTD mono>{i.invoice_number}</FynTD>
                  <FynTD>{i.customer_name || "—"}</FynTD>
                  <FynTD>{new Date(i.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</FynTD>
                  <FynTD>{i.due_date ? new Date(i.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(i.total_amount))}</FynTD>
                  <FynTD align="right" mono className={Number(i.outstanding_amount) > 0 ? "text-fyn-red" : ""}>
                    {formatINR(Number(i.outstanding_amount))}
                  </FynTD>
                  <FynTD><StatusBadgeFor kind="invoice" value={i.status} /></FynTD>
                  <FynTD align="right">
                    <FynButton variant="ghost" onClick={(e) => { e.stopPropagation(); open("invoice", i.id); }}>View →</FynButton>
                  </FynTD>
                </FynTR>
              ))}
            </tbody>
          </FynTable>
        )}
        <div className="p-fyn-md">
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </div>
      </ListPageShell>
      <DetailDrawer />
    </DashboardLayout>
  );
}
