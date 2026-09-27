import { createFileRoute } from "@tanstack/react-router";
import AdminWaitlistPage from "@/pages/admin/AdminWaitlistPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/waitlist")({
  component: AdminWaitlistPage,
});
