import { createFileRoute } from "@tanstack/react-router";
import AdminBlogEditorPage from "@/pages/admin/AdminBlogEditorPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/blog/$postId/edit")({
  component: AdminBlogEditorPage,
});
