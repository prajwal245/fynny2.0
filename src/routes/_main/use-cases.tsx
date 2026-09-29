import { createFileRoute } from "@tanstack/react-router";
import UseCasesPage from "@/pages/UseCasesPage";

export const Route = createFileRoute("/_main/use-cases")({
  component: UseCasesPage,
  head: () => ({
    meta: [
      { title: "Use cases — eight AI finance agents | FynHelp" },
      { name: "description", content: "Cash, revenue, cost, GST, governance, workforce, investor reporting and Ask Fynny. See which FynHelp agent owns your worst week of the month." },
      { property: "og:title", content: "Use cases — eight AI finance agents | FynHelp" },
      { property: "og:description", content: "Cash, revenue, cost, GST, governance, workforce, investor reporting and Ask Fynny. See which FynHelp agent owns your worst week of the month." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
