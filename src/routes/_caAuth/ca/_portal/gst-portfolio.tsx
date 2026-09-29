import { createFileRoute } from "@tanstack/react-router";
import CAGstPortfolioPage from "@/pages/ca/CAGstPortfolioPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/gst-portfolio")({
  component: CAGstPortfolioPage,
});
