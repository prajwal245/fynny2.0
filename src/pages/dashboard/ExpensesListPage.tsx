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
import { useExpenses } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { Receipt } from "lucide-react";

const PAGE_SIZE = 10;

export default function ExpensesListPage() {
  const { data: expenses, isLoading, error } = useExpenses();
  const { open } = useDrawer();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || params.get("vendor") || "");
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "all");
  const [category, setCategory] = useState(params.get("category") || "all");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const categories = useMemo(
    () => Array.from(new Set((expenses || []).map((e) => e.category).filter(Boolean) as string[])).sort(),
    [expenses],
  );

  const filtered = useMemo(() => {
    let list = expenses || [];
    if (statusFilter !== "all") list = list.filter((e) => e.payment_status === statusFilter);
    if (category !== "all") list = list.filter((e) => e.category === category);
    if (debounced) {
      const q = debounced.toLowerCase();
      list = list.filter((e) => (e.description || "").toLowerCase().includes(q) || (e.vendor_name || "").toLowerCase().includes(q));
    }
    return list;
  }, [expenses, statusFilter, category, debounced]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) return <DashboardLayout><FynLoading rows={4} /></DashboardLayout>;
  if (error) return <DashboardLayout><FynEmpty icon={<Receipt size={28} />} title="Couldn't load expenses" description={(error as Error).message} /></DashboardLayout>;

  return (
    <DashboardLayout>
      <ListPageShell
        title="Expenses"
        count={filtered.length}
        controls={
          <>
            <div className="flex-1 min-w-[220px]">
              <FynSearchInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search description or vendor…" />
            </div>
            <FilterChips
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={[
                { value: "all", label: "All" },
                { value: "Paid", label: "Paid" },
                { value: "Pending", label: "Pending" },
              ]}
            />
            <FynSelect value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-auto">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </FynSelect>
          </>
        }
      >
        {paged.length === 0 ? (
          <div className="p-fyn-xl text-center text-fyn-ink-45">No matching expenses.</div>
        ) : (
          <FynTable>
            <thead className="bg-fyn-ink-02">
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Description</FynTH>
                <FynTH>Vendor</FynTH>
                <FynTH>Category</FynTH>
                <FynTH align="right">Amount</FynTH>
                <FynTH>Date</FynTH>
                <FynTH>Status</FynTH>
                <FynTH>Method</FynTH>
                <FynTH align="right">Actions</FynTH>
              </tr>
            </thead>
            <tbody>
              {paged.map((e) => (
                <FynTR key={e.id} className="cursor-pointer" onClick={() => open("expense", e.id)}>
                  <FynTD>{e.description || "—"}</FynTD>
                  <FynTD>{e.vendor_name || "—"}</FynTD>
                  <FynTD>{e.category || "—"}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(e.amount))}</FynTD>
                  <FynTD>{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</FynTD>
                  <FynTD><StatusBadgeFor kind="expense" value={e.payment_status} /></FynTD>
                  <FynTD>{e.payment_method || "—"}</FynTD>
                  <FynTD align="right">
                    <FynButton variant="ghost" onClick={(ev) => { ev.stopPropagation(); open("expense", e.id); }}>View →</FynButton>
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
