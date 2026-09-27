import { createFileRoute } from "@tanstack/react-router";
import CAMastersPage from "@/pages/ca/os/CAMastersPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/masters")({
  component: CAMastersPage,
});
