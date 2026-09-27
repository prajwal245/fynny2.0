import { createFileRoute } from "@tanstack/react-router";
import CAPortfolioHealthPage from "@/pages/ca/CAPortfolioHealthPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/portfolio-health")({
  component: CAPortfolioHealthPage,
});
