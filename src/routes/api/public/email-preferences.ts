/**
 * The "Stop these emails" link in lifecycle emails. GET shows a confirm page
 * (so mail scanners that open links do not unsubscribe anyone); POST, from
 * that page or a mail app's one-click List-Unsubscribe, turns them off.
 * The link is signed per firm, so it only works for the firm it was sent to.
 */
import { createFileRoute } from "@tanstack/react-router";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · FynHelp</title>
<style>body{margin:0;background:#F2EDE4;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#171208}main{max-width:440px;margin:12vh auto;padding:0 16px}.card{background:#FFFDF9;border:1px solid #E9E1D3;border-radius:18px;padding:28px}h1{font-size:22px;margin:0 0 10px}p{color:#3A342C;line-height:1.6}button{background:#E2673F;color:#fff;border:0;border-radius:999px;padding:12px 22px;font:600 15px system-ui,sans-serif;cursor:pointer}a{color:#7A1F1F}</style></head>
<body><main><div class="card">${body}</div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function check(url: URL) {
  const firmId = url.searchParams.get("f") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const { optOutTokenValid } = await import("@/lib/practice/lifecycle/optout.server");
  return /^[0-9a-f-]{36}$/i.test(firmId) && optOutTokenValid(firmId, token) ? firmId : null;
}

const invalid = () =>
  page("Link not valid", `<h1>This link is not valid</h1><p>It may have been copied incompletely. A partner can turn these emails off in <a href="/app/settings">Settings</a>.</p>`, 400);

export const Route = createFileRoute("/api/public/email-preferences")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!(await check(url))) return invalid();
        return page(
          "Email preferences",
          `<h1>Stop FynHelp tips and reminders?</h1><p>You will no longer get trial reminders, usage summaries without charges, or tips. Billing emails, such as charges and renewals, still come.</p>
<form method="post" action="${esc(url.pathname + url.search)}"><button type="submit">Stop these emails</button></form>`,
        );
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const firmId = await check(url);
        if (!firmId) return invalid();
        const { adminDb } = await import("@/lib/practice/db.server");
        const { setLifecycleEmails } = await import("@/lib/practice/lifecycle/optout.server");
        await setLifecycleEmails(await adminDb(), firmId, false);
        return page("Emails stopped", `<h1>Done. These emails are off.</h1><p>A partner can turn them back on any time in <a href="/app/settings">Settings</a>.</p>`);
      },
    },
  },
});
