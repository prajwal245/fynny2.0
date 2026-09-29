import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import IntelligencePage from "@/pages/intelligence/IntelligencePage";

export const Route = createFileRoute("/_main/dashboard/fynny-chat")({
  component: () => (
    <DashboardLayout>
      <IntelligencePage mode="live" tab="fynny" />
    </DashboardLayout>
  ),
});
