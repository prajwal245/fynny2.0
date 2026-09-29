import { createFileRoute } from "@tanstack/react-router";
import AdminCommunicationsPage from "@/pages/admin/AdminCommunicationsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/communications")({
  component: AdminCommunicationsPage,
});
