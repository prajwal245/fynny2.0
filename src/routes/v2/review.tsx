import { createFileRoute } from "@tanstack/react-router";
import ReviewPage from "@/v2/pages/ReviewPage";

export const Route = createFileRoute("/v2/review")({ component: ReviewPage });
