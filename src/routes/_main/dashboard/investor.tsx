import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import InvestorPage from "@/pages/dashboard/InvestorPage";

export const Route = createFileRoute("/_main/dashboard/investor")({
  component: () => (
    <DashboardLayout>
      <InvestorPage />
    </DashboardLayout>
  ),
});
