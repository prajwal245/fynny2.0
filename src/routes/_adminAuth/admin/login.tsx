import { createFileRoute } from "@tanstack/react-router";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";

export const Route = createFileRoute("/_adminAuth/admin/login")({
  component: AdminLoginPage,
});
