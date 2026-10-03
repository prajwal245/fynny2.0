import { createFileRoute } from "@tanstack/react-router";
import UseCasesPage from "@/pages/UseCasesPage";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "Where FynHelp saves a CA firm time each month: collecting client statements, reconciling bank to books, clearing exceptions and producing MIS your clients can trace to source.";

export const Route = createFileRoute("/_main/use-cases")({
  component: UseCasesPage,
  head: () =>
    seo({
      title: "Use cases: month-end close for CA practices",
      description,
      path: "/use-cases",
      jsonLd: [
        webPageLd({ name: "FynHelp use cases", description, path: "/use-cases" }),
        breadcrumbLd([{ name: "Use cases", path: "/use-cases" }]),
      ],
    }),
});
