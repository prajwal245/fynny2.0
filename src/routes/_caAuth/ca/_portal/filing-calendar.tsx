import { createFileRoute } from "@tanstack/react-router";
import CAFilingCalendarPage from "@/pages/ca/CAFilingCalendarPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/filing-calendar")({
  component: CAFilingCalendarPage,
});
