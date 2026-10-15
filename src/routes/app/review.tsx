import { createFileRoute } from "@tanstack/react-router";
import ReviewPage from "@/v2/pages/ReviewPage";

export const Route = createFileRoute("/app/review")({ component: ReviewPage });
