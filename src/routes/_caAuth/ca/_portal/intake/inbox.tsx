import { createFileRoute } from "@tanstack/react-router";
import CADocumentInboxPage from "@/pages/ca/os/CADocumentInboxPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/intake/inbox")({
  component: CADocumentInboxPage,
});
