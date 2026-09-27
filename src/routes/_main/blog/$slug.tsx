import { createFileRoute } from "@tanstack/react-router";
import BlogArticlePage from "@/pages/BlogArticlePage";

export const Route = createFileRoute("/_main/blog/$slug")({
  component: BlogArticlePage,
});
