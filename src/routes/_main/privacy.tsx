import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/pages/LegalPage";

export const Route = createFileRoute("/_main/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy — FynHelp" }] }),
  component: PrivacyPage,
});
