import { createFileRoute } from "@tanstack/react-router";
import ReportsPage from "@/pages/intelligence/ReportsPage";

export const Route = createFileRoute("/_main/dashboard/reports/")({
  component: () => <ReportsPage mode="live" />,
});
