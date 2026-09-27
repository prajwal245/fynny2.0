import { createFileRoute } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import IntelligencePage from "@/pages/intelligence/IntelligencePage";

export const Route = createFileRoute("/_main/dashboard/gst")({
  component: () => (
    <DashboardLayout>
      <IntelligencePage mode="live" tab="gst" />
    </DashboardLayout>
  ),
});
