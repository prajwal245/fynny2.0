import { createFileRoute } from "@tanstack/react-router";
import ControlCenterPage from "@/pages/admin/control/ControlCenterPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/")({
  component: ControlCenterPage,
});
