import { createFileRoute } from "@tanstack/react-router";
import FilingCalendarPage from "@/pages/dashboard/FilingCalendarPage";

export const Route = createFileRoute("/_main/dashboard/filing-calendar")({
  component: FilingCalendarPage,
});
