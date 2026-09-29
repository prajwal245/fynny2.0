import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { formatINR } from "@/lib/indian-format";

type Employee = {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  status: string;
  date_of_joining: string | null;
  date_of_exit: string | null;
  ctc_annual: number | null;
  salary_monthly: number | null;
  pf_number: string | null;
  esic_number: string | null;
  created_at: string;
};

const HRPage = () => {
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

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees", businessId],
    queryFn: async (): Promise<Employee[]> => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("employees" as never)
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      return ((data as unknown) as Employee[]) || [];
    },
    enabled: !!businessId,
  });

  const totalEmployees = employees?.length || 0;
  const activeEmps = employees?.filter((e) => e.status === "active") || [];
  const activeEmployees = activeEmps.length;
  const totalMonthlySalary = activeEmps.reduce((sum, e) => sum + Number(e.salary_monthly || 0), 0);
  const totalAnnualCTC = activeEmps.reduce((sum, e) => sum + Number(e.ctc_annual || 0), 0);
  const avgSalary = activeEmployees > 0 ? totalMonthlySalary / activeEmployees : 0;

  const byDepartment = employees?.reduce((acc, e) => {
    if (e.status !== "active") return acc;
    const dept = e.department || "Unassigned";
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const isEmpty = !isLoading && (!employees || employees.length === 0);

  const getStatusClass = (status: string) => {
    switch (status) {
      case "active": return "bg-[#1A6B3C]/10 text-[#1A6B3C]";
      case "resigned": return "bg-[#C41E1E]/10 text-[#C41E1E]";
      default: return "bg-muted text-muted-foreground/70";
    }
  };

  return (
    <DashboardLayout>
      {/* TOP METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">TOTAL EMPLOYEES</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">{totalEmployees}</p>
          <p className="text-white/40 text-[11px] mt-1">{activeEmployees} active</p>
        </div>
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">MONTHLY PAYROLL</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">{formatINR(totalMonthlySalary)}</p>
          <p className="text-white/40 text-[11px] mt-1">Total salary cost</p>
        </div>
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">AVERAGE SALARY</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">{formatINR(Math.round(avgSalary))}</p>
          <p className="text-white/40 text-[11px] mt-1">Per employee / month</p>
        </div>
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">ANNUAL CTC</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">₹{(totalAnnualCTC / 100000).toFixed(1)}L</p>
          <p className="text-white/40 text-[11px] mt-1">Total cost to company</p>
        </div>
      </div>

      {/* LOADING */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* EMPTY STATE */}
      {isEmpty && (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-12 text-center">
          <h3 className="text-fyn-ink text-xl font-serif mb-2">No Employee Data</h3>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Add employees manually or import from your HRMS
          </p>
          <button
            onClick={() => navigate("/dashboard/settings/integrations")}
            className="bg-[#C41E1E] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Connect HRMS →
          </button>
        </div>
      )}

      {/* DEPARTMENT BREAKDOWN */}
      {!isLoading && employees && employees.length > 0 && Object.keys(byDepartment).length > 0 && (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5 mb-6">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">By Department</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(byDepartment).map(([dept, count]) => (
              <div key={dept} className="bg-card rounded-lg p-4 border border-fyn-ink-10">
                <p className="text-fyn-ink text-2xl font-bold font-sans">{count}</p>
                <p className="text-fyn-ink/60 text-xs mt-1">{dept}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TABLE */}
      {!isLoading && employees && employees.length > 0 && (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">Employee List</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-fyn-ink/40 text-xs fyn-label border-b border-fyn-ink-10">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Department</th>
                  <th className="text-left py-2">Designation</th>
                  <th className="text-right py-2">Monthly Salary</th>
                  <th className="text-right py-2">Annual CTC</th>
                  <th className="text-center py-2">Status</th>
                  <th className="text-left py-2">Joining Date</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e, i) => (
                  <tr key={e.id} className={`border-b border-fyn-ink-10 last:border-0 ${i % 2 === 0 ? "bg-[#FAF7F0]" : "bg-card"}`}>
                    <td className="py-3 text-fyn-ink font-medium">{e.name}</td>
                    <td className="py-3 text-fyn-ink/70">{e.email || "-"}</td>
                    <td className="py-3 text-fyn-ink/70">{e.department || "-"}</td>
                    <td className="py-3 text-fyn-ink/70">{e.designation || "-"}</td>
                    <td className="py-3 text-right fyn-metric">{e.salary_monthly ? formatINR(Number(e.salary_monthly)) : "-"}</td>
                    <td className="py-3 text-right fyn-metric">{e.ctc_annual ? formatINR(Number(e.ctc_annual)) : "-"}</td>
                    <td className="py-3 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded ${getStatusClass(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 text-fyn-ink/70 fyn-metric">
                      {e.date_of_joining
                        ? new Date(e.date_of_joining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default HRPage;
