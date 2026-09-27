import { createFileRoute } from "@tanstack/react-router";
import BlogAdminLoginPage from "@/pages/admin/BlogAdminLoginPage";

export const Route = createFileRoute("/_blogAdmin/blog-admin/login")({
  component: BlogAdminLoginPage,
});
