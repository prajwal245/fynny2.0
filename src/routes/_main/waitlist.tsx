import { createFileRoute } from "@tanstack/react-router";
import WaitlistPage from "@/pages/WaitlistPage";

export const Route = createFileRoute("/_main/waitlist")({
  component: WaitlistPage,
});
