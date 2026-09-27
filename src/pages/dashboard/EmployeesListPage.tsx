import DashboardLayout from "@/components/DashboardLayout";
import { ListPageShell } from "@/components/dashboard/ListPageShell";
import { FynTable, FynTH, FynTR, FynTD, FynBadge, FynLoading, FynEmpty } from "@/components/dashboard/ui";
import { useEmployeesDemo } from "@/hooks/dashboard/useDashboardData";
import { formatINR } from "@/lib/indian-format";
import { UsersRound } from "lucide-react";

export default function EmployeesListPage() {
  const { data: emps, isLoading, error } = useEmployeesDemo();

  if (isLoading) return <DashboardLayout><FynLoading rows={4} /></DashboardLayout>;
  if (error) return <DashboardLayout><FynEmpty icon={<UsersRound size={28} />} title="Couldn't load employees" description={(error as Error).message} /></DashboardLayout>;

  return (
    <DashboardLayout>
      <ListPageShell title="Employees" count={emps?.length || 0}>
        {!emps || emps.length === 0 ? (
          <div className="p-fyn-xl text-center text-fyn-ink-45">No employees yet.</div>
        ) : (
          <FynTable>
            <thead className="bg-fyn-ink-02">
              <tr className="border-b border-fyn-ink-10">
                <FynTH>Name</FynTH>
                <FynTH>Department</FynTH>
                <FynTH>Designation</FynTH>
                <FynTH align="right">Salary</FynTH>
                <FynTH align="right">CTC</FynTH>
                <FynTH>Joining Date</FynTH>
                <FynTH>Status</FynTH>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <FynTR key={e.id}>
                  <FynTD>{e.name}</FynTD>
                  <FynTD>{e.department || "—"}</FynTD>
                  <FynTD>{e.designation || "—"}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(e.salary))}</FynTD>
                  <FynTD align="right" mono>{formatINR(Number(e.cost_to_company))}</FynTD>
                  <FynTD>{e.joining_date ? new Date(e.joining_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</FynTD>
                  <FynTD>
                    <FynBadge tone={e.status === "Active" ? "success" : "neutral"}>{e.status}</FynBadge>
                  </FynTD>
                </FynTR>
              ))}
            </tbody>
          </FynTable>
        )}
      </ListPageShell>
    </DashboardLayout>
  );
}
