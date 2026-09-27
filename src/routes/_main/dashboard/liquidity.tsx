import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import IntelligencePage from "@/pages/intelligence/IntelligencePage";

export const Route = createFileRoute("/_main/dashboard/liquidity")({
  component: () => (
    <DashboardLayout>
      <IntelligencePage mode="live" tab="liquidity" />
    </DashboardLayout>
  ),
});
