import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import IntelligencePage from "@/pages/intelligence/IntelligencePage";

export const Route = createFileRoute("/_main/dashboard/revenue-intelligence")({
  component: () => (
    <DashboardLayout>
      <IntelligencePage mode="live" tab="revenue" />
    </DashboardLayout>
  ),
});
