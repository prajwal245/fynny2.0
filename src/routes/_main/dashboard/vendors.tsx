import { createFileRoute } from "@tanstack/react-router";
import VendorsPage from "@/pages/dashboard/VendorsPage";

export const Route = createFileRoute("/_main/dashboard/vendors")({
  component: VendorsPage,
});
