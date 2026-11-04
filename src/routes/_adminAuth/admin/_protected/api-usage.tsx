import { createFileRoute } from "@tanstack/react-router";
import ApiUsagePage from "@/pages/admin/control/ApiUsagePage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/api-usage")({
  component: ApiUsagePage,
});
