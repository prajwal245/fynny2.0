import { createFileRoute } from "@tanstack/react-router";
import ProfilePage from "@/pages/dashboard/settings/ProfilePage";

export const Route = createFileRoute("/_main/dashboard/settings/personal")({
  component: ProfilePage,
});
