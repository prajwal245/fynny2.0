import { createFileRoute } from "@tanstack/react-router";
import AdminSupportTicketDetailPage from "@/pages/admin/AdminSupportTicketDetailPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/support/$id")({
  component: AdminSupportTicketDetailPage,
});
