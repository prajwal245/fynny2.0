import { createFileRoute } from "@tanstack/react-router";
import AdminBlogListPage from "@/pages/admin/AdminBlogListPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/blog/")({
  component: AdminBlogListPage,
});
