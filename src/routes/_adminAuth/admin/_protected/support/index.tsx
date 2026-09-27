import { createFileRoute } from "@tanstack/react-router";
import AdminSupportPage from "@/pages/admin/AdminSupportPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/support/")({
  component: AdminSupportPage,
});
