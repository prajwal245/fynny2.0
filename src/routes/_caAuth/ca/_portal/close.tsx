import { createFileRoute } from "@tanstack/react-router";
import CAClosePage from "@/pages/ca/os/CAClosePage";

export const Route = createFileRoute("/_caAuth/ca/_portal/close")({
  component: CAClosePage,
});
