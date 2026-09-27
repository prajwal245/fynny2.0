import { createFileRoute } from "@tanstack/react-router";
import DocumentsPage from "@/v2/pages/DocumentsPage";

export const Route = createFileRoute("/v2/documents")({ component: DocumentsPage });
