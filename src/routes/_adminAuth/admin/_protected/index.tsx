import { createFileRoute } from "@tanstack/react-router";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/")({
  component: AdminDashboardPage,
});
