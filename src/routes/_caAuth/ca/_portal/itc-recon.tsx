import { createFileRoute } from "@tanstack/react-router";
import CAItcReconPage from "@/pages/ca/CAItcReconPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/itc-recon")({
  component: CAItcReconPage,
});
