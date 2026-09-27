import { createFileRoute } from "@tanstack/react-router";
import CAClientDetailPage from "@/pages/ca/CAClientDetailPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/clients/$clientId")({
  component: CAClientDetailPage,
});
