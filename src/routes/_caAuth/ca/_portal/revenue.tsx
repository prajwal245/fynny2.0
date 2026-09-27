import { createFileRoute } from "@tanstack/react-router";
import CARevenuePage from "@/pages/ca/CARevenuePage";

export const Route = createFileRoute("/_caAuth/ca/_portal/revenue")({
  component: CARevenuePage,
});
