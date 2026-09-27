import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy singular path from the previous portal — kept only as a redirect
 *  so old bookmarks and emailed links still land on the client record. */
export const Route = createFileRoute("/_caAuth/ca/_portal/client/$clientId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/ca/clients/$clientId", params, replace: true });
  },
});
