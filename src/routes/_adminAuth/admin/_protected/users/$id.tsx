import { createFileRoute } from "@tanstack/react-router";
import AdminUserDetailPage from "@/pages/admin/AdminUserDetailPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/users/$id")({
  component: AdminUserDetailPage,
});
