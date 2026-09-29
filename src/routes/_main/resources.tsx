import { createFileRoute } from "@tanstack/react-router";
import ResourcesPage from "@/pages/ResourcesPage";

export const Route = createFileRoute("/_main/resources")({
  component: ResourcesPage,
});
