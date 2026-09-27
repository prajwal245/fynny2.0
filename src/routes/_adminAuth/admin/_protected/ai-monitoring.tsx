import { createFileRoute } from "@tanstack/react-router";
import AdminAIMonitoringPage from "@/pages/admin/AdminAIMonitoringPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/ai-monitoring")({
  component: AdminAIMonitoringPage,
});
