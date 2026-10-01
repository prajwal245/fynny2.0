import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/pages/LegalPage";

export const Route = createFileRoute("/_main/terms")({
  head: () => ({ meta: [{ title: "Terms of service — FynHelp" }] }),
  component: TermsPage,
});
