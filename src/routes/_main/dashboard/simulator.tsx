import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import ArchivedFeaturePage from "@/pages/dashboard/ArchivedFeaturePage";

export const Route = createFileRoute("/_main/dashboard/simulator")({
  component: () => (
    <DashboardLayout>
      <ArchivedFeaturePage />
    </DashboardLayout>
  ),
});
