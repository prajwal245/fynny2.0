import { createFileRoute } from "@tanstack/react-router";
import CADashboardPage from "@/pages/ca/CADashboardPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/dashboard")({
  component: CADashboardPage,
});
