import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import MyCAPage from "@/pages/dashboard/MyCAPage";

export const Route = createFileRoute("/_main/dashboard/my-ca")({
  component: () => (
    <DashboardLayout>
      <MyCAPage />
    </DashboardLayout>
  ),
});
