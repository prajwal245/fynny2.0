import { createFileRoute } from "@tanstack/react-router";
import CATdsTrackerPage from "@/pages/ca/CATdsTrackerPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/tds-tracker")({
  component: CATdsTrackerPage,
});
