import { createFileRoute } from "@tanstack/react-router";
import AccountingFirmsPage from "@/pages/AccountingFirmsPage";
import { ACCOUNTING_FAQS } from "@/content/accountingFirmsFaqs";
import { breadcrumbLd, faqLd, seo, webPageLd } from "@/lib/seo";

const description =
  "A workspace for every client. FynHelp collects documents, reads statements, matches bank to books and drafts the MIS. A partner signs off before anything is posted or sent.";

export const Route = createFileRoute("/_main/for/accounting-firms")({
  component: AccountingFirmsPage,
  head: () =>
    seo({
      title: "Month-end close for accounting firms",
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
