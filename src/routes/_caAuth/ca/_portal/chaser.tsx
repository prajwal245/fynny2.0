import { createFileRoute } from "@tanstack/react-router";
import CAChaserQueuePage from "@/pages/ca/CAChaserQueuePage";

export const Route = createFileRoute("/_caAuth/ca/_portal/chaser")({
  component: CAChaserQueuePage,
});
