import { createFileRoute } from "@tanstack/react-router";
import InternResourcesPage from "@/pages/intern/InternResourcesPage";

export const Route = createFileRoute("/_blogAdmin/intern/resources")({
  component: InternResourcesPage,
});
