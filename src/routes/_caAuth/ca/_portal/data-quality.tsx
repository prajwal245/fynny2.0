import { createFileRoute } from "@tanstack/react-router";
import CADataQualityPage from "@/pages/ca/os/CADataQualityPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/data-quality")({
  component: CADataQualityPage,
});
