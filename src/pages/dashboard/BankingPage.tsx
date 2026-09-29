import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BankingPage = () => {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusiness = async () => {
      const { data: { user } } = await supabase.auth.getUser();
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

  const { data: bankAccounts, isLoading } = useQuery({
    queryKey: ["bank-accounts", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("business_id", businessId);
      return data || [];
    },
    enabled: !!businessId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["banking-transactions", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("business_id", businessId)
        .order("date", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!businessId,
  });

  if (isLoading || !businessId) {
    return (
      <DashboardLayout>
        <div className="text-fyn-ink/60 text-sm">Loading banking…</div>
      </DashboardLayout>
    );
  }

  if (!bankAccounts || bankAccounts.length === 0) {
    return (
      <DashboardLayout>
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
          <h2 className="text-fyn-ink text-2xl font-sans font-semibold mb-2">
            No Banking Data
          </h2>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Upload bank statements to track your accounts
          </p>
          <button
            onClick={() => navigate("/dashboard/data-import")}
            className="bg-fyn-red text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition"
          >
            Upload Data →
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const totalBalance = bankAccounts.reduce(
    (sum, acc: any) => sum + (Number(acc.balance) || 0),
    0
  );
  const accountCount = bankAccounts.length;

  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="bg-fyn-ink p-5 border-0">
          <p className="text-white/40 text-[13px] fyn-label">TOTAL BALANCE</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">
            ₹{totalBalance.toLocaleString("en-IN")}
          </p>
          <p className="text-white/50 text-xs mt-1">
            Across {accountCount} account{accountCount === 1 ? "" : "s"}
          </p>
        </Card>
        <Card className="bg-fyn-ink p-5 border-0">
          <p className="text-white/40 text-[13px] fyn-label">BANK ACCOUNTS</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">
            {accountCount}
          </p>
        </Card>
      </div>

      <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5 mb-6">
        <h3 className="text-fyn-ink text-lg mb-4 font-sans">Bank Accounts</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bank Name</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccounts.map((acc: any) => (
              <TableRow key={acc.id}>
                <TableCell className="font-medium">
                  {acc.bank_name || "-"}
                </TableCell>
                <TableCell>{acc.account_number || "-"}</TableCell>
                <TableCell>
                  {acc.last_sync
                    ? new Date(acc.last_sync).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </TableCell>
                <TableCell className="text-right fyn-metric">
                  ₹{(Number(acc.balance) || 0).toLocaleString("en-IN")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
        <h3 className="text-fyn-ink text-lg mb-4 font-sans">
          Recent Transactions
        </h3>
        {!transactions || transactions.length === 0 ? (
          <p className="text-fyn-ink/60 text-sm">No transactions recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn: any) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    {txn.date
                      ? new Date(txn.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>{txn.description || txn.counterparty || "-"}</TableCell>
                  <TableCell className="capitalize">
                    {txn.direction || "-"}
                  </TableCell>
                  <TableCell
                    className="text-right fyn-metric"
                    style={{
                      color: txn.direction === "credit" ? "#16A34A" : "#C41E1E",
                    }}
                  >
                    ₹{Math.abs(Number(txn.amount) || 0).toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BankingPage;
