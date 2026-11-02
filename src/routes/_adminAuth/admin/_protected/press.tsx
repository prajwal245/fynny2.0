import { createFileRoute } from "@tanstack/react-router";
import PressAdminPage from "@/pages/admin/control/PressPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/press")({
  component: PressAdminPage,
});
