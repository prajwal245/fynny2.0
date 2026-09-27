import { createFileRoute } from "@tanstack/react-router";
import CADocumentRequestsPage from "@/pages/ca/os/CADocumentRequestsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/intake/requests")({
  component: CADocumentRequestsPage,
});
