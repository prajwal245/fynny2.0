import { createFileRoute } from "@tanstack/react-router";
import AdminCAInvitesPage from "@/pages/admin/AdminCAInvitesPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/ca-invites")({
  component: AdminCAInvitesPage,
});
