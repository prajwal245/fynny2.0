import { createFileRoute } from "@tanstack/react-router";
import TeamAccessPage from "@/pages/dashboard/settings/TeamAccessPage";

export const Route = createFileRoute("/_main/dashboard/settings/team")({
  component: TeamAccessPage,
});
