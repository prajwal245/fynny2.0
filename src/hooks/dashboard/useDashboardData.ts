/**
 * Live data hooks for the dashboard drill-downs.
 *
 * All queries are scoped to the user's business_id (falls back to the
 * seeded demo business id when no profile is loaded so screenshots and
 * preview-only routes still render).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMode } from "@/components/intelligence/DataSource";

const DEMO_BIZ = "4b30494f-4c30-4a74-a6bb-6bf56493a97d";

export function useBusinessId(): string {
  const { businessId } = useAuth();
  const mode = useMode();
  // /demo/* routes wrap children in IntelligenceProvider mode="demo".
  // Force DEMO_BIZ there so list pages always render seeded demo data,
  // even when the visitor is authenticated as a different business.
  if (mode === "demo") return DEMO_BIZ;
  return businessId || DEMO_BIZ;
}

/* ───────────── Customers ───────────── */
export interface Customer {
  id: string;
  customer_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
  payment_terms_days: number | null;
  customer_category: string | null;
  is_active: boolean;
  total_receivable: number;
}

export function useCustomers() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "customers", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customers")
        .select("*")
        .eq("business_id", businessId)
        .order("customer_name");
      if (error) throw error;
      return (data as Customer[]) || [];
    },
  });
}

export function useCustomerDetail(id: string | null) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "customer", id, businessId],
    queryFn: async () => {
      if (!id) return null;
      const { data: customer, error } = await (supabase as any)
        .from("customers")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const { data: invoices } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("customer_id", id)
        .order("invoice_date", { ascending: false });
      let wonDeal: any = null;
      if (customer?.customer_name) {
        const { data: deal } = await (supabase as any)
          .from("sales_pipeline")
          .select("*")
          .eq("business_id", businessId)
          .eq("is_won", true)
          .ilike("customer_name", customer.customer_name)
          .maybeSingle();
        wonDeal = deal;
      }
      return {
        customer: customer as Customer | null,
        invoices: (invoices as Invoice[]) || [],
        wonDeal,
      };
    },
    enabled: !!id,
  });
}

/* ───────────── Vendors ───────────── */
export interface Vendor {
  id: string;
  vendor_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  city: string | null;
  payment_terms_days: number | null;
  vendor_category: string | null;
  is_active: boolean;
  total_outstanding: number;
}

export function useVendors() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "vendors", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendors")
        .select("*")
        .eq("business_id", businessId)
        .order("vendor_name");
      if (error) throw error;
      return (data as Vendor[]) || [];
    },
  });
}

export function useVendorDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "vendor", id],
    queryFn: async () => {
      if (!id) return null;
      const { data: vendor, error } = await (supabase as any)
        .from("vendors")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const { data: expenses } = await (supabase as any)
        .from("expenses")
        .select("*")
        .eq("vendor_id", id)
        .order("date", { ascending: false });
      return { vendor: vendor as Vendor | null, expenses: (expenses as Expense[]) || [] };
    },
    enabled: !!id,
  });
}

/* ───────────── Invoices ───────────── */
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export interface Invoice {
  id: string;
  customer_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: InvoiceStatus;
  payment_date: string | null;
}

export interface InvoiceWithCustomer extends Invoice {
  customer_name: string | null;
}

export function useInvoices() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "invoices", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("*, customers(customer_name)")
        .eq("business_id", businessId)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        customer_name: r.customers?.customer_name ?? null,
      })) as InvoiceWithCustomer[];
    },
  });
}

export function useInvoiceDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "invoice", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("*, customers(customer_name, email, phone)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as (InvoiceWithCustomer & { customers: any }) | null;
    },
    enabled: !!id,
  });
}

/* ───────────── Expenses ───────────── */
export interface Expense {
  id: string;
  vendor_id: string | null;
  category: string | null;
  subcategory: string | null;
  amount: number;
  date: string;
  due_date: string | null;
  description: string | null;
  payment_status: "Paid" | "Pending";
  payment_method: string | null;
}

export interface ExpenseWithVendor extends Expense {
  vendor_name: string | null;
}

export function useExpenses() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "expenses", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("expenses")
        .select("*, vendors(vendor_name)")
        .eq("business_id", businessId)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        vendor_name: r.vendors?.vendor_name ?? null,
      })) as ExpenseWithVendor[];
    },
  });
}

export function useExpenseDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "expense", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("expenses")
        .select("*, vendors(vendor_name, gstin, city)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as (ExpenseWithVendor & { vendors: any }) | null;
    },
    enabled: !!id,
  });
}

/* ───────────── Employees ───────────── */
export interface EmployeeDemo {
  id: string;
  name: string;
  department: string | null;
  designation: string | null;
  salary: number;
  joining_date: string | null;
  status: string;
  cost_to_company: number;
}

export function useEmployeesDemo() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "employees_demo", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employees_demo")
        .select("*")
        .eq("business_id", businessId)
        .order("department")
        .order("name");
      if (error) throw error;
      return (data as EmployeeDemo[]) || [];
    },
  });
}

/* ───────────── Bank transactions ───────────── */
export interface BankTxn {
  id: string;
  date: string;
  description: string | null;
  type: "credit" | "debit";
  amount: number;
  balance: number;
  category: string | null;
  reconciled: boolean;
}

export function useBankTransactions() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "bank_transactions", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bank_transactions")
        .select("*")
        .eq("business_id", businessId)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data as BankTxn[]) || [];
    },
  });
}

/* ───────────── GST filings (demo) ───────────── */
export interface GstFilingDemo {
  id: string;
  filing_type: string;
  period: string;
  due_date: string | null;
  filed_date: string | null;
  status: string;
  tax_liability: number;
  itc_claimed: number;
  net_payable: number;
}

export function useGstFilingsDemo() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "gst_filings_demo", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gst_filings_demo")
        .select("*")
        .eq("business_id", businessId)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data as GstFilingDemo[]) || [];
    },
  });
}

/* ───────────── New detail hooks ───────────── */

export function useGstFilingDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "gst_filing", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("gst_filings_demo").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as GstFilingDemo | null;
    },
    enabled: !!id,
  });
}

export function useRiskDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "risk", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("risk_register").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

export function useInsuranceDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "insurance", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("insurance_policies").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

export function useEmployeeDetail(id: string | null) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "employee", id, businessId],
    queryFn: async () => {
      if (!id) return null;
      const { data: emp, error } = await (supabase as any)
        .from("employees_demo").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!emp) return { employee: null, grant: null, benchmark: null };
      const [grantRes, benchRes] = await Promise.all([
        (supabase as any).from("esop_grants").select("*").eq("business_id", businessId).ilike("employee_name", emp.name).maybeSingle(),
        (supabase as any).from("compensation_benchmarks").select("*").eq("business_id", businessId).ilike("role", emp.designation || "").maybeSingle(),
      ]);
      return { employee: emp as any, grant: grantRes.data as any, benchmark: benchRes.data as any };
    },
    enabled: !!id,
  });
}

export function useDealDetail(id: string | null) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ["dash", "deal", id, businessId],
    queryFn: async () => {
      if (!id) return null;
      const { data: deal, error } = await (supabase as any)
        .from("sales_pipeline").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!deal) return { deal: null, customer: null };
      let customer: any = null;
      if (deal.customer_name) {
        const { data: c } = await (supabase as any)
          .from("customers").select("id, customer_name").eq("business_id", businessId).ilike("customer_name", deal.customer_name).maybeSingle();
        customer = c;
      }
      return { deal: deal as any, customer };
    },
    enabled: !!id,
  });
}

export function useBankTxnDetail(id: string | null) {
  return useQuery({
    queryKey: ["dash", "bank_txn", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("bank_transactions").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as BankTxn | null;
    },
    enabled: !!id,
  });
}

/* ───────────── Aggregates ───────────── */
export function useLiquiditySummary() {
  const { data: bank } = useBankTransactions();
  const { data: expenses } = useExpenses();
  const { data: invoices } = useInvoices();

  const isLoading = !bank || !expenses || !invoices;
  if (isLoading) {
    return {
      isLoading: true,
      cashBalance: 0,
      grossBurn: 0,
      revenueLast30: 0,
      netBurn: 0,
      runwayMonths: 0,
    } as const;
  }

  const cashBalance = bank[0]?.balance ?? 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const grossBurn = expenses
    .filter((e) => new Date(e.date) >= cutoff)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const revenueLast30 = invoices
    .filter(
      (i) =>
        i.status === "paid" &&
        i.payment_date &&
        new Date(i.payment_date) >= cutoff,
    )
    .reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);

  const netBurn = Math.max(0, grossBurn - revenueLast30);
  const runwayMonths = netBurn > 0 ? cashBalance / netBurn : 99;

  return {
    isLoading: false,
    cashBalance,
    grossBurn,
    revenueLast30,
    netBurn,
    runwayMonths,
  } as const;
}

export function useRevenueTrend() {
  const { data: invoices, isLoading } = useInvoices();
  if (!invoices) return { isLoading, byMonth: [] as { month: string; revenue: number }[] };
  const map = new Map<string, number>();
  for (const i of invoices) {
    if (i.status !== "paid" || !i.payment_date) continue;
    const d = new Date(i.payment_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, (map.get(key) || 0) + Number(i.paid_amount || 0));
  }
  const byMonth = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));
  return { isLoading: false, byMonth };
}

export function useTopCustomers(limit = 5) {
  const { data: invoices, isLoading } = useInvoices();
  if (!invoices) return { isLoading, top: [] as { customer_id: string; customer_name: string; revenue: number }[] };
  const map = new Map<string, { customer_id: string; customer_name: string; revenue: number }>();
  for (const i of invoices) {
    if (i.status !== "paid" || !i.customer_id) continue;
    const cur = map.get(i.customer_id) || {
      customer_id: i.customer_id,
      customer_name: i.customer_name || "Unknown",
      revenue: 0,
    };
    cur.revenue += Number(i.paid_amount || 0);
    map.set(i.customer_id, cur);
  }
  const top = [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  return { isLoading: false, top };
}

export function useExpensesByCategory() {
  const { data: expenses, isLoading } = useExpenses();
  if (!expenses) return { isLoading, categories: [] as { category: string; total: number }[] };
  const map = new Map<string, number>();
  for (const e of expenses) {
    const k = e.category || "Uncategorised";
    map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
  }
  const categories = [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
  return { isLoading: false, categories };
}

export function useVendorSpend(limit = 8) {
  const { data: expenses, isLoading } = useExpenses();
  if (!expenses) return { isLoading, vendors: [] as { vendor_id: string; vendor_name: string; total: number }[] };
  const map = new Map<string, { vendor_id: string; vendor_name: string; total: number }>();
  for (const e of expenses) {
    if (!e.vendor_id) continue;
    const cur = map.get(e.vendor_id) || {
      vendor_id: e.vendor_id,
      vendor_name: e.vendor_name || "Unknown",
      total: 0,
    };
    cur.total += Number(e.amount || 0);
    map.set(e.vendor_id, cur);
  }
  const vendors = [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
  return { isLoading: false, vendors };
}

export function usePersonnelCosts() {
  const { data: emps, isLoading } = useEmployeesDemo();
  if (!emps) return { isLoading, byDepartment: [] as { department: string; total: number }[], total: 0 };
  const map = new Map<string, number>();
  let total = 0;
  for (const e of emps) {
    if (e.status !== "Active") continue;
    const k = e.department || "Unassigned";
    map.set(k, (map.get(k) || 0) + Number(e.cost_to_company || 0));
    total += Number(e.cost_to_company || 0);
  }
  const byDepartment = [...map.entries()]
    .map(([department, total]) => ({ department, total }))
    .sort((a, b) => b.total - a.total);
  return { isLoading: false, byDepartment, total };
}
