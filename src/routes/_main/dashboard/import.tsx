import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import ImportPage from "@/pages/dashboard/ImportPage";

export const Route = createFileRoute("/_main/dashboard/import")({
  component: () => (
    <DashboardLayout>
      <ImportPage />
    </DashboardLayout>
  ),
});
