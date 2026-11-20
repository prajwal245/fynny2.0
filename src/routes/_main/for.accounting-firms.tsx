import { createFileRoute } from "@tanstack/react-router";
import AccountingFirmsPage from "@/pages/AccountingFirmsPage";
import { ACCOUNTING_FAQS } from "@/content/accountingFirmsFaqs";
import { breadcrumbLd, faqLd, seo, webPageLd } from "@/lib/seo";

const description =
  "A workspace for every client. FynHelp tracks missing documents, chases them on your schedule, and waits for a partner’s sign-off before anything reaches the books.";

export const Route = createFileRoute("/_main/for/accounting-firms")({
  component: AccountingFirmsPage,
  head: () =>
    seo({
      title: "Client document collection for accounting firms",
      description,
      path: "/for/accounting-firms",
      jsonLd: [
        webPageLd({
          name: "FynHelp for accounting firms",
          description,
          path: "/for/accounting-firms",
        }),
        faqLd(ACCOUNTING_FAQS),
        breadcrumbLd([
          { name: "Use cases", path: "/use-cases" },
          { name: "Accounting firms", path: "/for/accounting-firms" },
        ]),
      ],
    }),
});
