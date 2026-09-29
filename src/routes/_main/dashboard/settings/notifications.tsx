import { createFileRoute } from "@tanstack/react-router";
import NotificationsPage from "@/pages/dashboard/settings/NotificationsPage";

export const Route = createFileRoute("/_main/dashboard/settings/notifications")({
  component: NotificationsPage,
});
