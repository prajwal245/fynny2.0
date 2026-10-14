import { createFileRoute } from "@tanstack/react-router";
import CouponsPage from "@/pages/admin/control/CouponsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/coupons")({
  component: CouponsPage,
});
