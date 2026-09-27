import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ListPageShell, FilterChips, Pagination, useDebounced,
  FynSearchInput, FynSelect,
} from "@/components/dashboard/ListPageShell";
import { FynTable, FynTH, FynTR, FynTD, FynBadge, FynLoading, FynEmpty, FynButton } from "@/components/dashboard/ui";
import DetailDrawer, { useDrawer } from "@/components/dashboard/DetailDrawer";
import { useVendors } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { Building2 } from "lucide-react";

const PAGE_SIZE = 10;

export default function VendorsPage() {
  const { data: vendors, isLoading, error } = useVendors();
  const { open } = useDrawer();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [filter, setFilter] = useState(params.get("filter") || "all");
  const [sort, setSort] = useState(params.get("sort") || "name");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const filtered = useMemo(() => {
    let list = vendors || [];
    if (filter === "active") list = list.filter((v) => v.is_active);
    if (filter === "outstanding") list = list.filter((v) => Number(v.total_outstanding) > 0);
    if (debounced) {
      const q = debounced.toLowerCase();
      list = list.filter((v) => v.vendor_name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "outstanding":
          return Number(b.total_outstanding) - Number(a.total_outstanding);
        case "terms":
          return (b.payment_terms_days || 0) - (a.payment_terms_days || 0);
        default:
          return a.vendor_name.localeCompare(b.vendor_name);
      }
    });
    return list;
  }, [vendors, filter, debounced, sort]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) return <DashboardLayout><FynLoading rows={4} /></DashboardLayout>;
  if (error) return <DashboardLayout><FynEmpty icon={<Building2 size={28} />} title="Couldn't load vendors" description={(error as Error).message} /></DashboardLayout>;

  return (
    <DashboardLayout>
      <ListPageShell
        title="Vendors"
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
                { value: "outstanding", label: "Outstanding > 0" },
              ]}
            />
            <FynSelect value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
              <option value="name">Sort: Name</option>
              <option value="outstanding">Sort: Outstanding</option>
              <option value="terms">Sort: Payment Days</option>
            </FynSelect>
          </>
        }
      >
        {paged.length === 0 ? (
          <div className="p-fyn-xl text-center text-fyn-ink-45">No matching vendors.</div>
        ) : (
          <FynTable>
            <thead className="bg-fyn-ink-02">
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Vendor</FynTH>
                <FynTH>Category</FynTH>
                <FynTH>City</FynTH>
                <FynTH align="right">Outstanding</FynTH>
                <FynTH align="right">Terms</FynTH>
                <FynTH align="right">Actions</FynTH>
              </tr>
            </thead>
            <tbody>
              {paged.map((v) => (
                <FynTR key={v.id} className="cursor-pointer" onClick={() => open("vendor", v.id)}>
                  <FynTD>
                    <div className="text-fyn-ink font-medium">{v.vendor_name}</div>
                    <div className="text-fyn-tiny text-fyn-ink-45">{v.contact_person || "—"}</div>
                  </FynTD>
                  <FynTD>{v.vendor_category || "—"}</FynTD>
                  <FynTD>{v.city || "—"}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(v.total_outstanding))}</FynTD>
                  <FynTD align="right">{v.payment_terms_days || 30}d</FynTD>
                  <FynTD align="right">
                    <FynButton variant="ghost" onClick={(e) => { e.stopPropagation(); open("vendor", v.id); }}>View →</FynButton>
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
