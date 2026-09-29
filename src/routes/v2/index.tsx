import { createFileRoute } from "@tanstack/react-router";
import PortfolioPage from "@/v2/pages/PortfolioPage";

export const Route = createFileRoute("/v2/")({
  component: PortfolioPage,
});
