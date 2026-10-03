import { createFileRoute } from "@tanstack/react-router";
import BookDemoPage from "@/pages/BookDemoPage";

export const Route = createFileRoute("/_main/book-demo")({
  component: BookDemoPage,
  head: () => ({
    meta: [
      { title: "Book a FynHelp demo — free 30-minute walkthrough" },
      { name: "description", content: "Tell us a little about your firm, then pick a time. A free 30-minute live walkthrough of FynHelp for CA firms." },
      { property: "og:title", content: "Book a FynHelp demo — free 30-minute walkthrough" },
      { property: "og:description", content: "Tell us a little about your firm, then pick a time. A free 30-minute live walkthrough of FynHelp for CA firms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
