import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/pages/HomePage";
import { openDemo } from "@/components/site/BookDemo";

// There is no waitlist any more: sign-up is open. Links already shared (ads,
// emails, posts) land on the home page with the demo calendar already open.
function WaitlistLink() {
  useEffect(() => {
    window.history.replaceState(null, "", "/");
    openDemo("waitlist-link");
  }, []);
  return <HomePage />;
}

export const Route = createFileRoute("/_main/waitlist")({
  head: () => ({ meta: [{ title: "FynHelp — Exception-only close for CA firms" }] }),
  component: WaitlistLink,
});
