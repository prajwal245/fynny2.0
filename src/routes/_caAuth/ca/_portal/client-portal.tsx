import { createFileRoute } from "@tanstack/react-router";
import CAClientPortalAdminPage from "@/pages/ca/os/CAClientPortalAdminPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/client-portal")({
  component: CAClientPortalAdminPage,
});
