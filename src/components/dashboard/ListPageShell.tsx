/**
 * Shared shell for list views (Customers, Vendors, Invoices, Expenses, Employees).
 * Provides breadcrumb, back-link, count, search/filter/sort row, pagination.
 */
import { ReactNode, useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { ChevronLeft } from "lucide-react";
import { FynPage, FynCard, FynSearchInput, FynSelect } from "@/components/dashboard/ui";
import { useMode } from "@/components/intelligence/DataSource";
import { cn } from "@/lib/utils";

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-fyn-xs flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-fyn-tiny font-medium border transition-colors",
            value === o.value
              ? "bg-fyn-red text-white border-fyn-red"
              : "bg-fyn-beige-card text-fyn-ink-60 border-fyn-ink-10 hover:text-fyn-ink hover:border-fyn-ink-25",
          )}
        >
          {o.label}
          {typeof o.count === "number" && (
            <span className="ml-1 opacity-60">({o.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-fyn-md text-fyn-small text-fyn-ink-60">
      <span>
        Page {page} of {pages} • {total} rows
      </span>
      <div className="flex gap-fyn-xs">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="px-3 py-1 rounded border border-fyn-ink-10 disabled:opacity-40 hover:bg-fyn-ink-05"
        >
          Prev
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="px-3 py-1 rounded border border-fyn-ink-10 disabled:opacity-40 hover:bg-fyn-ink-05"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function ListPageShell({
  title,
  count,
  controls,
  children,
}: {
  title: string;
  count: number;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const base = useMode() === "demo" ? "/demo" : "/dashboard";
  return (
    <FynPage>
      <div className="flex items-center gap-fyn-sm text-fyn-tiny text-fyn-ink-45">
        <Link to={`${base}/cockpit`} className="hover:text-fyn-ink inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Cockpit
        </Link>
        <span>/</span>
        <span className="text-fyn-ink-60">{title}</span>
      </div>
      <header className="flex items-end justify-between gap-fyn-md flex-wrap">
        <h1 className="font-serif text-fyn-h1 text-fyn-ink">
          {title} <span className="text-fyn-ink-45 font-normal">({count})</span>
        </h1>
      </header>
      {controls && <FynCard className="!p-fyn-md flex gap-fyn-md flex-wrap items-end">{controls}</FynCard>}
      <FynCard className="!p-0 overflow-hidden">{children}</FynCard>
    </FynPage>
  );
}

export { FynSearchInput, FynSelect };
