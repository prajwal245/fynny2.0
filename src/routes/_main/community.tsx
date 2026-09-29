import { createFileRoute } from "@tanstack/react-router";
import CommunityPage from "@/pages/CommunityPage";

export const Route = createFileRoute("/_main/community")({
  component: CommunityPage,
  head: () => ({
    meta: [
      { title: "FynHelp community — coming soon" },
      { name: "description", content: "Practice circles, a monthly GST clinic and owner office hours. Request an invite to the first FynHelp community intake." },
      { property: "og:title", content: "FynHelp community — coming soon" },
      { property: "og:description", content: "Practice circles, a monthly GST clinic and owner office hours. Request an invite to the first FynHelp community intake." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
