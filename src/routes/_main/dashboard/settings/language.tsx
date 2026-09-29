import { createFileRoute } from "@tanstack/react-router";
import LanguagePage from "@/pages/dashboard/settings/LanguagePage";

export const Route = createFileRoute("/_main/dashboard/settings/language")({
  component: LanguagePage,
});
