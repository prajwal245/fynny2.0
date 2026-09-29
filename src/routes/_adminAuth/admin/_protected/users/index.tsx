import { createFileRoute } from "@tanstack/react-router";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/users/")({
  component: AdminUsersPage,
});
