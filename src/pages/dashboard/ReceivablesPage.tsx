import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

const ReceivablesPage = () => {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusiness = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_id) setBusinessId(data.business_id);
    };
    fetchBusiness();
  }, []);

  const { data: receivables, isLoading } = useQuery({
    queryKey: ["receivables", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("receivables")
        .select("*")
        .eq("business_id", businessId)
        .order("due_date", { ascending: false });
      return data || [];
    },
    enabled: !!businessId,
  });

  const now = new Date();
  const totalReceivables =
    receivables?.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) || 0;
  const totalOutstanding =
    receivables?.reduce((sum, r) => sum + (Number(r.outstanding) || 0), 0) || 0;

  const overdue =
    receivables?.filter((r) => {
      if (!r.due_date) return false;
      const dueDate = new Date(r.due_date);
      return dueDate < now && r.status !== "paid";
    }) || [];

  const dueSoon =
    receivables?.filter((r) => {
      if (!r.due_date) return false;
      const dueDate = new Date(r.due_date);
      const daysUntil = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysUntil <= 7 && daysUntil >= 0 && r.status !== "paid";
    }) || [];

  const overdueAmount = overdue.reduce(
    (sum, r) => sum + (Number(r.outstanding) || 0),
    0,
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </DashboardLayout>
    );
  }

  if (!receivables || receivables.length === 0) {
    return (
      <DashboardLayout>
        <Card className="p-12 text-center bg-fyn-beige-dark border-fyn-ink-10">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-fyn-beige flex items-center justify-center">
              <FileText className="w-7 h-7 text-fyn-ink/50" />
            </div>
          </div>
          <h3 className="font-serif text-xl text-fyn-ink mb-2">
            No Receivables Data
          </h3>
          <p className="text-sm text-fyn-ink/60 mb-6 max-w-md mx-auto">
            Upload invoices to track outstanding payments from customers
          </p>
          <button
            onClick={() => navigate("/dashboard/data-import")}
            className="inline-flex items-center gap-2 transition-colors hover:opacity-90"
            style={{
              background: "#C41E1E",
              color: "#FFFFFF",
              padding: "10px 20px",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Upload Data →
          </button>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-5 bg-fyn-beige-card border-fyn-ink-10">
          <p className="text-[13px] fyn-label text-secondary-foreground">
            Total Receivables
          </p>
          <p className="text-fyn-ink text-[28px] font-bold mt-1 font-sans">
            ₹{totalReceivables.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-fyn-ink/60 mt-1">Total invoiced</p>
        </Card>

        <Card className="p-5 bg-fyn-beige-card border-fyn-ink-10">
          <p className="text-[13px] fyn-label text-secondary-foreground">
            Outstanding
          </p>
          <p className="text-fyn-ink text-[28px] font-bold mt-1 font-sans">
            ₹{totalOutstanding.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-fyn-ink/60 mt-1">Yet to collect</p>
        </Card>

        <Card className="p-5 bg-fyn-beige-card border-fyn-ink-10">
          <p className="text-[13px] fyn-label text-secondary-foreground">
            Overdue
          </p>
          <p
            className="text-[28px] font-bold mt-1 font-sans"
            style={{ color: overdue.length > 0 ? "#C41E1E" : "#171208" }}
          >
            {overdue.length}
          </p>
          <p className="text-xs text-fyn-ink/60 mt-1">
            ₹{overdueAmount.toLocaleString("en-IN")} overdue
          </p>
        </Card>

        <Card className="p-5 bg-fyn-beige-card border-fyn-ink-10">
          <p className="text-[13px] fyn-label text-secondary-foreground">
            Due Soon
          </p>
          <p className="text-fyn-ink text-[28px] font-bold mt-1 font-sans">
            {dueSoon.length}
          </p>
          <p className="text-xs text-fyn-ink/60 mt-1">Next 7 days</p>
        </Card>
      </div>

      <Card className="bg-fyn-beige-dark border-fyn-ink-10">
        <div className="p-5 border-b border-fyn-ink-10">
          <h3 className="font-serif text-lg text-fyn-ink">Receivables</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receivables.map((item) => {
              const dueDate = item.due_date ? new Date(item.due_date) : null;
              const isOverdue =
                dueDate && dueDate < now && item.status !== "paid";

              const statusBadge =
                item.status === "paid"
                  ? { variant: "default" as const, label: "Paid" }
                  : item.status === "partial"
                  ? { variant: "secondary" as const, label: "Partial" }
                  : isOverdue
                  ? { variant: "destructive" as const, label: "Overdue" }
                  : { variant: "outline" as const, label: "Pending" };

              return (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">
                    {item.invoice_number || "-"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {item.customer_name || "-"}
                  </TableCell>
                  <TableCell className="text-right fyn-metric">
                    ₹{(Number(item.amount) || 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right fyn-metric font-semibold">
                    ₹{(Number(item.outstanding) || 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {dueDate
                      ? dueDate.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge.variant}>
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </DashboardLayout>
  );
};

export default ReceivablesPage;
