import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Circle } from "lucide-react";

const AuditReadinessPage = () => {
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

  const { data: auditMetrics, isLoading } = useQuery({
    queryKey: ["audit-readiness", businessId],
    queryFn: async () => {
      if (!businessId) return null;

      const [transactions, receivables, payables, gstFilings] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("id")
            .eq("business_id", businessId)
            .limit(1),
          supabase
            .from("receivables")
            .select("id")
            .eq("business_id", businessId)
            .limit(1),
          supabase
            .from("payables")
            .select("id")
            .eq("business_id", businessId)
            .limit(1),
          supabase
            .from("gst_filings")
            .select("id")
            .eq("business_id", businessId)
            .limit(1),
        ]);

      return {
        hasTransactions: (transactions.data?.length || 0) > 0,
        hasReceivables: (receivables.data?.length || 0) > 0,
        hasPayables: (payables.data?.length || 0) > 0,
        hasGSTFilings: (gstFilings.data?.length || 0) > 0,
      };
    },
    enabled: !!businessId,
  });

  const checklist = [
    {
      label: "Bank Transactions Recorded",
      completed: auditMetrics?.hasTransactions || false,
    },
    {
      label: "Invoices & Receivables Tracked",
      completed: auditMetrics?.hasReceivables || false,
    },
    {
      label: "Vendor Bills & Payables Tracked",
      completed: auditMetrics?.hasPayables || false,
    },
    {
      label: "GST Returns Filed",
      completed: auditMetrics?.hasGSTFilings || false,
    },
  ];

  const completedItems = checklist.filter((c) => c.completed).length;
  const readinessScore = Math.round((completedItems / checklist.length) * 100);
  const scoreColor =
    readinessScore > 75
      ? "#16A34A"
      : readinessScore > 50
      ? "#8B5A00"
      : "#C41E1E";

  if (isLoading) {
    return (
      <DashboardLayout>
        <Skeleton className="h-40 rounded-lg mb-6" />
        <Skeleton className="h-80 rounded-lg" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Card className="p-6 mb-6 bg-fyn-beige-card border-fyn-ink-10">
        <p className="text-[13px] fyn-label text-secondary-foreground">
          Audit Readiness Score
        </p>
        <p
          className="text-[40px] font-bold mt-1 font-sans"
          style={{ color: scoreColor }}
        >
          {readinessScore}%
        </p>
        <Progress value={readinessScore} className="mt-3 h-2" />
        <p className="text-xs text-fyn-ink/60 mt-2">
          {completedItems} of {checklist.length} requirements met
        </p>
      </Card>

      <Card className="p-6 bg-fyn-beige-dark border-fyn-ink-10">
        <h3 className="font-serif text-lg text-fyn-ink mb-4">
          Readiness Checklist
        </h3>
        <ul className="space-y-3">
          {checklist.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-3 p-3 rounded-md bg-fyn-beige border border-fyn-ink-10"
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full"
                style={{
                  background: item.completed ? "#16A34A" : "transparent",
                  border: item.completed ? "none" : "1.5px solid #17120833",
                  color: item.completed ? "#FFFFFF" : "#17120866",
                }}
              >
                {item.completed ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </span>
              <span
                className="text-sm"
                style={{
                  color: item.completed ? "#171208" : "#17120899",
                  textDecoration: item.completed ? "none" : "none",
                  fontWeight: item.completed ? 500 : 400,
                }}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        {readinessScore < 100 && (
          <div className="mt-6">
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
              Upload Missing Data →
            </button>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
};

export default AuditReadinessPage;
