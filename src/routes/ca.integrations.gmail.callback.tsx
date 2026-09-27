import { createFileRoute } from "@tanstack/react-router";
import CAGmailCallbackPage from "@/pages/ca/CAGmailCallbackPage";

export const Route = createFileRoute("/ca/integrations/gmail/callback")({
  ssr: false,
  component: CAGmailCallbackPage,
  head: () => ({
    meta: [
      { title: "Connecting Gmail | FynHelp Practice Portal" },
      { name: "description", content: "Finishing the Gmail connection for your FynHelp practice inbox." },
      { name: "robots", content: "noindex" },
    ],
  }),
});
