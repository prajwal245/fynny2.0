import { createFileRoute } from "@tanstack/react-router";
import AdminSetupPage from "@/pages/admin/AdminSetupPage";

export const Route = createFileRoute("/_adminAuth/admin/setup")({
  component: AdminSetupPage,
});
