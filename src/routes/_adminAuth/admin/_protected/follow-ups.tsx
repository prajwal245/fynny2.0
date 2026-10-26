import { createFileRoute } from "@tanstack/react-router";
import FollowUpsPage from "@/pages/admin/control/FollowUpsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/follow-ups")({
  component: FollowUpsPage,
});
