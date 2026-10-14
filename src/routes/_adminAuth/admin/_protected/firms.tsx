import { createFileRoute } from "@tanstack/react-router";
import FirmsPage from "@/pages/admin/control/FirmsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/firms")({
  component: FirmsPage,
});
