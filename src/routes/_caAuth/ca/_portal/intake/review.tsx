import { createFileRoute } from "@tanstack/react-router";
import CAReviewQueuePage from "@/pages/ca/os/CAReviewQueuePage";

export const Route = createFileRoute("/_caAuth/ca/_portal/intake/review")({
  component: CAReviewQueuePage,
});
