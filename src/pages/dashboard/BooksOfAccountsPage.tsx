import { useState, useEffect, useMemo, Fragment } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Download, FileText, FileSpreadsheet, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/indian-format";
import { downloadBookPdf, BookColumn } from "@/lib/booksReportPdf";
import * as XLSX from "xlsx";

type TabKey = "cash" | "sales" | "purchase" | "ledger";

const TAB_META: { key: TabKey; label: string; filename: string; title: string }[] = [
  { key: "cash", label: "Cash / Bank Book", filename: "cash-bank-book", title: "Cash / Bank Book" },
  { key: "sales", label: "Sales Journal", filename: "sales-journal", title: "Sales Journal" },
  { key: "purchase", label: "Purchase Journal", filename: "purchase-journal", title: "Purchase Journal" },
  { key: "ledger", label: "Ledger Summary", filename: "ledger-summary", title: "Ledger Summary" },
];

const currentFY = () => {
  const now = new Date();
  const y = now.getFullYear();
  const isBeforeApr = now.getMonth() < 3;
  const startYear = isBeforeApr ? y - 1 : y;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const BooksOfAccountsPage = () => {
  const { toast } = useToast();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("cash");
  const fy = useMemo(currentFY, []);
  const [fromDate, setFromDate] = useState(fy.from);
  const [toDate, setToDate] = useState(fy.to);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_id) setBusinessId(data.business_id);
    })();
  }, []);

  // === Queries ===
  const txnQuery = useQuery({
    queryKey: ["books-txn", businessId, fromDate, toDate],
    enabled: !!businessId && (tab === "cash" || tab === "ledger"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, description, counterparty, category, direction, amount")
        .eq("business_id", businessId!)
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const recvQuery = useQuery({
    queryKey: ["books-recv", businessId, fromDate, toDate],
    enabled: !!businessId && (tab === "sales" || tab === "ledger"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receivables")
        .select("id, invoice_date, customer_name, invoice_number, amount, outstanding, status")
        .eq("business_id", businessId!)
        .gte("invoice_date", fromDate)
        .lte("invoice_date", toDate)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const payQuery = useQuery({
    queryKey: ["books-pay", businessId, fromDate, toDate],
    enabled: !!businessId && (tab === "purchase" || tab === "ledger"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payables")
        .select("id, due_date, vendor_name, invoice_number, amount, outstanding, status")
        .eq("business_id", businessId!)
        .gte("due_date", fromDate)
        .lte("due_date", toDate)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const err = txnQuery.error || recvQuery.error || payQuery.error;
    if (err) {
      toast({
        title: "Failed to load books data",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  }, [txnQuery.error, recvQuery.error, payQuery.error, toast]);

  // === Derived rows ===
  const cashRows = useMemo(() => {
    const items = txnQuery.data || [];
    let running = 0;
    return items.map((t: any) => {
      const isIn = t.direction === "credit";
      const debit = isIn ? Number(t.amount) : 0;
      const credit = isIn ? 0 : Number(t.amount);
      running += debit - credit;
      return {
        id: t.id,
        date: t.date,
        particulars: t.description || t.counterparty || t.category || "-",
        debit,
        credit,
        balance: running,
      };
    });
  }, [txnQuery.data]);

  const cashTotals = useMemo(() => {
    const debit = cashRows.reduce((s, r) => s + r.debit, 0);
    const credit = cashRows.reduce((s, r) => s + r.credit, 0);
    return { debit, credit, closing: cashRows.length ? cashRows[cashRows.length - 1].balance : 0 };
  }, [cashRows]);

  const salesTotal = useMemo(
    () => (recvQuery.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
    [recvQuery.data]
  );

  const purchaseTotal = useMemo(
    () => (payQuery.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
    [payQuery.data]
  );

  // Ledger groupings
  const customerLedger = useMemo(() => {
    const map = new Map<string, { name: string; invoiced: number; outstanding: number; items: any[] }>();
    for (const r of recvQuery.data || []) {
      const key = r.customer_name || "Unknown";
      const g = map.get(key) || { name: key, invoiced: 0, outstanding: 0, items: [] };
      g.invoiced += Number(r.amount || 0);
      g.outstanding += Number(r.outstanding || 0);
      g.items.push(r);
      map.set(key, g);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, paid: g.invoiced - g.outstanding }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [recvQuery.data]);

  const vendorLedger = useMemo(() => {
    const map = new Map<string, { name: string; billed: number; outstanding: number; items: any[] }>();
    for (const p of payQuery.data || []) {
      const key = p.vendor_name || "Unknown";
      const g = map.get(key) || { name: key, billed: 0, outstanding: 0, items: [] };
      g.billed += Number(p.amount || 0);
      g.outstanding += Number(p.outstanding || 0);
      g.items.push(p);
      map.set(key, g);
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, paid: g.billed - g.outstanding }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [payQuery.data]);

  // === Export ===
  const buildExport = (): {
    columns: BookColumn[];
    rows: Record<string, any>[];
    totals?: Record<string, any>;
    title: string;
  } | null => {
    if (tab === "cash") {
      return {
        title: "Cash / Bank Book",
        columns: [
          { key: "date", label: "Date", width: 1.2 },
          { key: "particulars", label: "Particulars", width: 4 },
          { key: "debit", label: "Debit (In)", width: 1.5, align: "right", numeric: true },
          { key: "credit", label: "Credit (Out)", width: 1.5, align: "right", numeric: true },
          { key: "balance", label: "Running Balance", width: 1.8, align: "right", numeric: true },
        ],
        rows: cashRows.map((r) => ({
          date: fmtDate(r.date),
          particulars: r.particulars,
          debit: r.debit ? formatINR(r.debit) : "",
          credit: r.credit ? formatINR(r.credit) : "",
          balance: formatINR(r.balance),
        })),
        totals: {
          date: "",
          particulars: "TOTAL / Closing Balance",
          debit: formatINR(cashTotals.debit),
          credit: formatINR(cashTotals.credit),
          balance: formatINR(cashTotals.closing),
        },
      };
    }
    if (tab === "sales") {
      const rows = recvQuery.data || [];
      return {
        title: "Sales Journal",
        columns: [
          { key: "date", label: "Date", width: 1.2 },
          { key: "customer", label: "Customer", width: 3 },
          { key: "invoice", label: "Invoice #", width: 1.5 },
          { key: "amount", label: "Amount", width: 1.5, align: "right", numeric: true },
          { key: "status", label: "Status", width: 1 },
        ],
        rows: rows.map((r: any) => ({
          date: fmtDate(r.invoice_date),
          customer: r.customer_name,
          invoice: r.invoice_number || "-",
          amount: formatINR(Number(r.amount || 0)),
          status: (Number(r.outstanding || 0) <= 0 || r.status === "paid") ? "Paid" : "Outstanding",
        })),
        totals: { date: "", customer: "TOTAL", invoice: "", amount: formatINR(salesTotal), status: "" },
      };
    }
    if (tab === "purchase") {
      const rows = payQuery.data || [];
      return {
        title: "Purchase Journal",
        columns: [
          { key: "date", label: "Date", width: 1.2 },
          { key: "vendor", label: "Vendor", width: 3 },
          { key: "bill", label: "Bill #", width: 1.5 },
          { key: "amount", label: "Amount", width: 1.5, align: "right", numeric: true },
          { key: "status", label: "Status", width: 1 },
        ],
        rows: rows.map((r: any) => ({
          date: fmtDate(r.due_date),
          vendor: r.vendor_name,
          bill: r.invoice_number || "-",
          amount: formatINR(Number(r.amount || 0)),
          status: (Number(r.outstanding || 0) <= 0 || r.status === "paid") ? "Paid" : "Outstanding",
        })),
        totals: { date: "", vendor: "TOTAL", bill: "", amount: formatINR(purchaseTotal), status: "" },
      };
    }
    // ledger summary
    const rows: Record<string, any>[] = [];
    rows.push({
      section: "Bank Ledger",
      name: "Bank / Cash",
      debit: formatINR(cashTotals.debit),
      credit: formatINR(cashTotals.credit),
      outstanding: "",
      closing: formatINR(cashTotals.closing),
    });
    for (const c of customerLedger) {
      rows.push({
        section: "Customer",
        name: c.name,
        debit: formatINR(c.invoiced),
        credit: formatINR(c.paid),
        outstanding: formatINR(c.outstanding),
        closing: "",
      });
    }
    for (const v of vendorLedger) {
      rows.push({
        section: "Vendor",
        name: v.name,
        debit: formatINR(v.billed),
        credit: formatINR(v.paid),
        outstanding: formatINR(v.outstanding),
        closing: "",
      });
    }
    return {
      title: "Ledger Summary",
      columns: [
        { key: "section", label: "Section", width: 1.2 },
        { key: "name", label: "Name", width: 3 },
        { key: "debit", label: "Total Debit / Invoiced / Billed", width: 2, align: "right", numeric: true },
        { key: "credit", label: "Total Credit / Paid", width: 1.6, align: "right", numeric: true },
        { key: "outstanding", label: "Outstanding", width: 1.6, align: "right", numeric: true },
        { key: "closing", label: "Closing", width: 1.6, align: "right", numeric: true },
      ],
      rows,
    };
  };

  const exportPdf = () => {
    const e = buildExport();
    if (!e || e.rows.length === 0) {
      toast({ title: "Nothing to export", description: "No data in selected range." });
      return;
    }
    const meta = TAB_META.find((t) => t.key === tab)!;
    downloadBookPdf({
      title: e.title,
      fromDate,
      toDate,
      columns: e.columns,
      rows: e.rows,
      totals: e.totals,
      filename: `fynhelp-${meta.filename}-${fromDate}-to-${toDate}.pdf`,
    });
  };

  const exportXlsx = () => {
    const e = buildExport();
    if (!e || e.rows.length === 0) {
      toast({ title: "Nothing to export", description: "No data in selected range." });
      return;
    }
    const meta = TAB_META.find((t) => t.key === tab)!;
    const header = e.columns.map((c) => c.label);
    const body = e.rows.map((r) => e.columns.map((c) => r[c.key]));
    const aoa: any[][] = [header, ...body];
    if (e.totals) aoa.push(e.columns.map((c) => e.totals![c.key]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = e.columns.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, e.title.slice(0, 31));
    XLSX.writeFile(wb, `fynhelp-${meta.filename}-${fromDate}-to-${toDate}.xlsx`);
  };

  const loadingActive =
    (tab === "cash" && txnQuery.isLoading) ||
    (tab === "sales" && recvQuery.isLoading) ||
    (tab === "purchase" && payQuery.isLoading) ||
    (tab === "ledger" && (txnQuery.isLoading || recvQuery.isLoading || payQuery.isLoading));

  const errorActive =
    (tab === "cash" && txnQuery.error) ||
    (tab === "sales" && recvQuery.error) ||
    (tab === "purchase" && payQuery.error) ||
    (tab === "ledger" && (txnQuery.error || recvQuery.error || payQuery.error));

  const refetchActive = () => {
    if (tab === "cash" || tab === "ledger") txnQuery.refetch();
    if (tab === "sales" || tab === "ledger") recvQuery.refetch();
    if (tab === "purchase" || tab === "ledger") payQuery.refetch();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-2xl text-fyn-ink">Books of Accounts</h1>
            <p className="text-sm text-fyn-ink/60 mt-1">
              Statutory books generated from your live transaction data.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 bg-fyn-ink text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition">
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={exportPdf}>
                <FileText className="w-4 h-4 mr-2 text-fyn-red" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportXlsx}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filters */}
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs text-fyn-ink/60">From</Label>
            <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs text-fyn-ink/60">To</Label>
            <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-44" />
          </div>
          <button
            onClick={() => { const f = currentFY(); setFromDate(f.from); setToDate(f.to); }}
            className="text-xs text-fyn-red hover:underline pb-2"
          >
            Reset to current FY
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-fyn-ink-10">
          {TAB_META.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.key
                  ? "border-fyn-red text-fyn-ink"
                  : "border-transparent text-fyn-ink/60 hover:text-fyn-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {!businessId ? (
          <div className="text-fyn-ink/60 text-sm p-6">Loading…</div>
        ) : loadingActive ? (
          <div className="text-fyn-ink/60 text-sm p-6">Loading books…</div>
        ) : errorActive ? (
          <ErrorState onRetry={refetchActive} />
        ) : tab === "cash" ? (
          <CashBookView rows={cashRows} totals={cashTotals} />
        ) : tab === "sales" ? (
          <SalesJournalView rows={recvQuery.data || []} total={salesTotal} />
        ) : tab === "purchase" ? (
          <PurchaseJournalView rows={payQuery.data || []} total={purchaseTotal} />
        ) : (
          <LedgerSummaryView
            cashTotals={cashTotals}
            customerLedger={customerLedger}
            vendorLedger={vendorLedger}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

const EmptyState = ({ label }: { label: string }) => (
  <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
    <h2 className="text-fyn-ink text-lg font-serif mb-2">No {label} for this period</h2>
    <p className="text-fyn-ink/60 text-sm mb-4">
      Try widening the date range, or import data to get started.
    </p>
    <Link
      to="/dashboard/data-import"
      className="inline-block bg-fyn-red text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition"
    >
      Go to Data Import
    </Link>
  </div>
);

const ErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
    <h2 className="text-fyn-ink text-lg font-serif mb-2">Could not load data</h2>
    <p className="text-fyn-ink/60 text-sm mb-4">Something went wrong while querying your books.</p>
    <button
      onClick={onRetry}
      className="bg-fyn-red text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition"
    >
      Retry
    </button>
  </div>
);

const num = (n: number) => (n ? formatINR(n) : "—");

const CashBookView = ({
  rows,
  totals,
}: {
  rows: { id: string; date: string; particulars: string; debit: number; credit: number; balance: number }[];
  totals: { debit: number; credit: number; closing: number };
}) => {
  if (rows.length === 0) return <EmptyState label="cash / bank transactions" />;
  return (
    <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Particulars</TableHead>
            <TableHead className="text-right">Debit (In)</TableHead>
            <TableHead className="text-right">Credit (Out)</TableHead>
            <TableHead className="text-right">Running Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="text-fyn-ink/60 italic" colSpan={4}>Opening Balance</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatINR(0)}</TableCell>
          </TableRow>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{fmtDate(r.date)}</TableCell>
              <TableCell className="max-w-md truncate">{r.particulars}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-green-700">{num(r.debit)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-fyn-red">{num(r.credit)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatINR(r.balance)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-fyn-beige font-bold">
            <TableCell colSpan={2} className="font-bold">TOTAL / Closing Balance</TableCell>
            <TableCell className="text-right font-mono tabular-nums font-bold">{formatINR(totals.debit)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums font-bold">{formatINR(totals.credit)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums font-bold">{formatINR(totals.closing)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

const statusOf = (r: any) => (Number(r.outstanding || 0) <= 0 || r.status === "paid" ? "Paid" : "Outstanding");

const SalesJournalView = ({ rows, total }: { rows: any[]; total: number }) => {
  if (rows.length === 0) return <EmptyState label="sales invoices" />;
  return (
    <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const st = statusOf(r);
            return (
              <TableRow key={r.id}>
                <TableCell>{fmtDate(r.invoice_date)}</TableCell>
                <TableCell>{r.customer_name}</TableCell>
                <TableCell className="font-mono">{r.invoice_number || "-"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatINR(Number(r.amount || 0))}</TableCell>
                <TableCell>
                  <Badge variant={st === "Paid" ? "default" : "secondary"}>{st}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-fyn-beige font-bold">
            <TableCell colSpan={3} className="font-bold">TOTAL</TableCell>
            <TableCell className="text-right font-mono tabular-nums font-bold">{formatINR(total)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

const PurchaseJournalView = ({ rows, total }: { rows: any[]; total: number }) => {
  if (rows.length === 0) return <EmptyState label="purchase bills" />;
  return (
    <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Bill #</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const st = statusOf(r);
            return (
              <TableRow key={r.id}>
                <TableCell>{fmtDate(r.due_date)}</TableCell>
                <TableCell>{r.vendor_name}</TableCell>
                <TableCell className="font-mono">{r.invoice_number || "-"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatINR(Number(r.amount || 0))}</TableCell>
                <TableCell>
                  <Badge variant={st === "Paid" ? "default" : "secondary"}>{st}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-fyn-beige font-bold">
            <TableCell colSpan={3} className="font-bold">TOTAL</TableCell>
            <TableCell className="text-right font-mono tabular-nums font-bold">{formatINR(total)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

const LedgerGroup = ({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-fyn-ink-05 transition"
      >
        <span className="font-serif text-fyn-ink text-base">{title}</span>
        <ChevronRight className={`w-4 h-4 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="border-t border-fyn-ink-10">{children}</div>}
    </div>
  );
};

const LedgerSummaryView = ({
  cashTotals,
  customerLedger,
  vendorLedger,
}: {
  cashTotals: { debit: number; credit: number; closing: number };
  customerLedger: { name: string; invoiced: number; outstanding: number; paid: number; items: any[] }[];
  vendorLedger: { name: string; billed: number; outstanding: number; paid: number; items: any[] }[];
}) => {
  const net = cashTotals.debit - cashTotals.credit;
  return (
    <div className="space-y-4">
      <LedgerGroup title="Bank Ledger" defaultOpen>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
          <Stat label="Total Debits (In)" value={formatINR(cashTotals.debit)} tone="pos" />
          <Stat label="Total Credits (Out)" value={formatINR(cashTotals.credit)} tone="neg" />
          <Stat label="Net Movement" value={formatINR(net)} />
          <Stat label="Closing Balance" value={formatINR(cashTotals.closing)} />
        </div>
      </LedgerGroup>

      <LedgerGroup title={`Customer Ledger (Sundry Debtors) · ${customerLedger.length}`}>
        {customerLedger.length === 0 ? (
          <div className="p-6 text-sm text-fyn-ink/60">No customers in this period.</div>
        ) : (
          <CustomerLedgerTable data={customerLedger} />
        )}
      </LedgerGroup>

      <LedgerGroup title={`Vendor Ledger (Sundry Creditors) · ${vendorLedger.length}`}>
        {vendorLedger.length === 0 ? (
          <div className="p-6 text-sm text-fyn-ink/60">No vendors in this period.</div>
        ) : (
          <VendorLedgerTable data={vendorLedger} />
        )}
      </LedgerGroup>
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-fyn-ink/50 mb-1">{label}</div>
    <div
      className={`font-mono tabular-nums text-lg ${
        tone === "pos" ? "text-green-700" : tone === "neg" ? "text-fyn-red" : "text-fyn-ink"
      }`}
    >
      {value}
    </div>
  </div>
);

const CustomerLedgerTable = ({ data }: { data: any[] }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>Customer</TableHead>
          <TableHead className="text-right">Total Invoiced</TableHead>
          <TableHead className="text-right">Total Paid</TableHead>
          <TableHead className="text-right">Total Outstanding</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((c) => (
          <Fragment key={c.name}>
            <TableRow key={c.name} className="cursor-pointer" onClick={() => setExpanded(expanded === c.name ? null : c.name)}>
              <TableCell className="w-8">
                <ChevronRight className={`w-4 h-4 transition ${expanded === c.name ? "rotate-90" : ""}`} />
              </TableCell>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatINR(c.invoiced)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-green-700">{formatINR(c.paid)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-fyn-red">{formatINR(c.outstanding)}</TableCell>
            </TableRow>
            {expanded === c.name && (
              <TableRow key={c.name + "-x"}>
                <TableCell colSpan={5} className="bg-fyn-beige/40">
                  <div className="space-y-1 py-2">
                    {c.items.map((it: any) => (
                      <div key={it.id} className="flex justify-between text-xs text-fyn-ink/70 font-mono">
                        <span>{fmtDate(it.invoice_date)} · {it.invoice_number || "-"}</span>
                        <span>{formatINR(Number(it.amount || 0))} · outstanding {formatINR(Number(it.outstanding || 0))}</span>
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
};

const VendorLedgerTable = ({ data }: { data: any[] }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>Vendor</TableHead>
          <TableHead className="text-right">Total Billed</TableHead>
          <TableHead className="text-right">Total Paid</TableHead>
          <TableHead className="text-right">Total Outstanding</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((v) => (
          <Fragment key={v.name}>
            <TableRow key={v.name} className="cursor-pointer" onClick={() => setExpanded(expanded === v.name ? null : v.name)}>
              <TableCell className="w-8">
                <ChevronRight className={`w-4 h-4 transition ${expanded === v.name ? "rotate-90" : ""}`} />
              </TableCell>
              <TableCell className="font-medium">{v.name}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatINR(v.billed)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-green-700">{formatINR(v.paid)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-fyn-red">{formatINR(v.outstanding)}</TableCell>
            </TableRow>
            {expanded === v.name && (
              <TableRow key={v.name + "-x"}>
                <TableCell colSpan={5} className="bg-fyn-beige/40">
                  <div className="space-y-1 py-2">
                    {v.items.map((it: any) => (
                      <div key={it.id} className="flex justify-between text-xs text-fyn-ink/70 font-mono">
                        <span>{fmtDate(it.due_date)} · {it.invoice_number || "-"}</span>
                        <span>{formatINR(Number(it.amount || 0))} · outstanding {formatINR(Number(it.outstanding || 0))}</span>
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
};

export default BooksOfAccountsPage;
