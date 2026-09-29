import { createFileRoute } from "@tanstack/react-router";
import AdminContentPage from "@/pages/admin/AdminContentPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/content")({
  component: AdminContentPage,
});
