import { createFileRoute } from "@tanstack/react-router";
import CAAccessPage from "@/pages/dashboard/settings/CAAccessPage";

export const Route = createFileRoute("/_main/dashboard/settings/ca-access")({
  component: CAAccessPage,
});
