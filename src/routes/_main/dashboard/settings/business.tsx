import { createFileRoute } from "@tanstack/react-router";
import BusinessProfilePage from "@/pages/dashboard/settings/BusinessProfilePage";

export const Route = createFileRoute("/_main/dashboard/settings/business")({
  component: BusinessProfilePage,
});
