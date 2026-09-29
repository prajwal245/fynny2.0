import { createFileRoute } from "@tanstack/react-router";
import CAFirmsPage from "@/pages/CAFirmsPage";

export const Route = createFileRoute("/_main/ca-firms")({
  component: CAFirmsPage,
});
