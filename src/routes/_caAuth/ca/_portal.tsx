import { createFileRoute } from "@tanstack/react-router";
import CAPortalLayout from "@/components/ca/CAPortalLayout";

export const Route = createFileRoute("/_caAuth/ca/_portal")({
  component: CAPortalLayout,
});
