import { createFileRoute } from "@tanstack/react-router";
import AdminAICreditsPage from "@/pages/admin/AdminAICreditsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/ai-credits")({
  component: AdminAICreditsPage,
});
