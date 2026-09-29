import { createFileRoute } from "@tanstack/react-router";
import BlogAdminEditorPage from "@/pages/admin/BlogAdminEditorPage";

export const Route = createFileRoute("/_blogAdmin/blog-admin/editor")({
  component: BlogAdminEditorPage,
});
