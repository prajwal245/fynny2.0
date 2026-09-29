import { createFileRoute } from "@tanstack/react-router";
import AdminSubscriptionsPage from "@/pages/admin/AdminSubscriptionsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/subscriptions")({
  component: AdminSubscriptionsPage,
});
