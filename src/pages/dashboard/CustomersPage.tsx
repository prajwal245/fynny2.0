import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ListPageShell, FilterChips, Pagination, useDebounced,
  FynSearchInput, FynSelect,
} from "@/components/dashboard/ListPageShell";
import { FynTable, FynTH, FynTR, FynTD, FynBadge, FynLoading, FynEmpty, FynButton } from "@/components/dashboard/ui";
import DetailDrawer, { useDrawer } from "@/components/dashboard/DetailDrawer";
import { useCustomers, useInvoices } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { Users } from "lucide-react";

const PAGE_SIZE = 10;

export default function CustomersPage() {
  const { data: customers, isLoading, error } = useCustomers();
  const { data: invoices } = useInvoices();
  const { open } = useDrawer();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [filter, setFilter] = useState(params.get("filter") || "all");
  const [sort, setSort] = useState(params.get("sort") || "name");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const overdueCustomerIds = useMemo(
    () => new Set((invoices || []).filter((i) => i.status === "overdue").map((i) => i.customer_id).filter(Boolean) as string[]),
    [invoices],
  );

  const filtered = useMemo(() => {
    let list = customers || [];
    if (filter === "active") list = list.filter((c) => c.is_active);
    if (filter === "inactive") list = list.filter((c) => !c.is_active);
    if (filter === "overdue") list = list.filter((c) => overdueCustomerIds.has(c.id));
    if (debounced) {
      const q = debounced.toLowerCase();
      list = list.filter((c) => c.customer_name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "revenue":
        case "outstanding":
          return Number(b.total_receivable) - Number(a.total_receivable);
        case "terms":
          return (b.payment_terms_days || 0) - (a.payment_terms_days || 0);
        default:
          return a.customer_name.localeCompare(b.customer_name);
      }
    });
    return list;
  }, [customers, filter, debounced, sort, overdueCustomerIds]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) return <DashboardLayout><FynLoading rows={4} /></DashboardLayout>;
  if (error) return <DashboardLayout><FynEmpty icon={<Users size={28} />} title="Couldn't load customers" description={(error as Error).message} /></DashboardLayout>;

  return (
    <DashboardLayout>
      <ListPageShell
        title="Customers"
        count={filtered.length}
        controls={
          <>
            <div className="flex-1 min-w-[220px]">
              <FynSearchInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name…" />
            </div>
            <FilterChips
              value={filter}
              onChange={(v) => { setFilter(v); setPage(1); }}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "overdue", label: "Overdue" },
              ]}
            />
            <FynSelect value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
              <option value="name">Sort: Name</option>
              <option value="revenue">Sort: Receivable</option>
              <option value="terms">Sort: Payment Days</option>
            </FynSelect>
          </>
        }
      >
        {paged.length === 0 ? (
          <div className="p-fyn-xl text-center text-fyn-ink-45">No matching customers.</div>
        ) : (
          <FynTable>
            <thead className="bg-fyn-ink-02">
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Customer</FynTH>
                <FynTH>City</FynTH>
                <FynTH>Category</FynTH>
                <FynTH align="right">Total Receivable</FynTH>
                <FynTH>Status</FynTH>
                <FynTH align="right">Actions</FynTH>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <FynTR key={c.id} className="cursor-pointer" onClick={() => open("customer", c.id)}>
                  <FynTD>
                    <div className="text-fyn-ink font-medium">{c.customer_name}</div>
                    <div className="text-fyn-tiny text-fyn-ink-45">{c.contact_person || "—"}</div>
                  </FynTD>
                  <FynTD>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</FynTD>
                  <FynTD>{c.customer_category || "—"}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(c.total_receivable))}</FynTD>
                  <FynTD>
                    <FynBadge tone={c.is_active ? "success" : "danger"}>
                      {c.is_active ? "Active" : "Inactive"}
                    </FynBadge>
                  </FynTD>
                  <FynTD align="right">
                    <FynButton variant="ghost" onClick={(e) => { e.stopPropagation(); open("customer", c.id); }}>View →</FynButton>
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
