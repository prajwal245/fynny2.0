import { createFileRoute } from "@tanstack/react-router";
import TeamPage from "@/pages/admin/control/TeamPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/team")({
  component: TeamPage,
});
