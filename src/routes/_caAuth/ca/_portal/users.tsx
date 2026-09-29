import { createFileRoute } from "@tanstack/react-router";
import CAUsersRolesPage from "@/pages/ca/CAUsersRolesPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/users")({
  component: CAUsersRolesPage,
});
