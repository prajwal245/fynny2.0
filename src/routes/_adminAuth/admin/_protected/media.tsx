import { createFileRoute } from "@tanstack/react-router";
import AdminMediaLibraryPage from "@/pages/admin/AdminMediaLibraryPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/media")({
  component: AdminMediaLibraryPage,
});
