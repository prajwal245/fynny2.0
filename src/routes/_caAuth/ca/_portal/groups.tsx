import { createFileRoute } from "@tanstack/react-router";
import CAEntityGroupsPage from "@/pages/ca/os/CAEntityGroupsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/groups")({
  component: CAEntityGroupsPage,
});
