# SEO

How search and sharing work on fynhelp.com, and what needs setting up outside
the code.

## Positioning

FynHelp is month-end close software for CA firms in India. Pages target
high-intent CA-practice searches, not generic "AI accounting software":

| Page | Main search intent |
| --- | --- |
| `/` | month-end close software for CA firms |
| `/pipeline` | CA firm month-end close automation |
| `/agents/extract` | bank statement / Tally export extraction for CA firms |
| `/agents/recon` | bank reconciliation software for CA firms |
| `/agents/narrate` | MIS reports for chartered accountants |
| `/agents/chaser` | client document collection for CA practices |
| `/ca-firms` | CA firm workflow automation |
| `/pricing` | pricing for CA practice software |
| `/blog/*` | problem-aware guides (reconciliation, MIS, GST, close) |

## How it is built

- **`src/lib/seo.ts`**: `seo({ title, description, path, image, noindex, jsonLd })`
  returns a route's `head()`: title (brand added only when it fits ~60
  characters), description, robots, absolute canonical (no query, no trailing
  slash), Open Graph and Twitter cards, and JSON-LD. TanStack keeps the
  deepest route's tag, so the root (`__root.tsx`) only sets site-wide
  defaults plus the Organization and WebSite schema.
- **Structured data builders** in the same file: Organization, WebSite (no
  SearchAction, because the site has no search results page), SoftwareApplication
  with INR offers from the pricing page, BreadcrumbList, FAQPage, WebPage /
  AboutPage / ContactPage / CollectionPage, BlogPosting.
- **FAQ content** lives in `src/content/faqs.ts` and feeds both the visible
  FAQ and its FAQPage schema, so they cannot drift apart.
- **Blog** posts load on the server (route loaders in
  `src/routes/_main/blog`, data in `src/lib/blog.ts`): crawlers get the full
  article, title, canonical and BlogPosting schema in the first response.
  Unknown slugs return a real 404. Each article links to related posts and
  to the product pages.
- **`/sitemap.xml`** is generated per request (`src/lib/sitemap.server.ts`):
  the indexable pages plus every published blog post with its last-modified
  date. Add new public pages to `INDEXABLE_PAGES`.
- **`/robots.txt`** (`public/robots.txt`) allows the site, blocks admin,
  internal tools, the legacy dashboard and APIs, and points to the sitemap.
  `/v2`, sign-in and sign-up stay crawlable on purpose so search engines can
  read their noindex.
- **Indexation rules** (`src/lib/searchPolicy.ts`, applied in `src/server.ts`):
  - `X-Robots-Tag: noindex, nofollow` on the app, auth, admin, API, `/waitlist`
    and `/demo` paths, and on every host except the production domain
    (Vercel preview and project URLs never compete with the real site).
  - Trailing slashes redirect permanently (308) to the slash-less URL.
  - Layout routes for admin, blog admin, CA auth, internal admin and the app
    also set `noindex` in the page head.
  - `/resources` (duplicates the blog behind `?tab=` filters) and
    `/community` (coming soon) are `noindex`.
- **Share images**: `public/og/*.png` (1200×630) for the default page, each
  module, pricing, security and the blog.
- **404**: a real 404 status, `noindex`, and links to the pages people look for.
- **`/llms.txt`**: a plain product summary for AI assistants.

## Performance

- One render-blocking font request (Instrument Sans, Fraunces, Inter, Space
  Grotesk). Fonts only older pages use load after the page has loaded.
- GA4 loads after the page has loaded, never before first paint.
- Logo images carry their size (no layout shift); the footer logo is lazy;
  blog cover images are sized and the featured one is high priority.

## Analytics

- **GA4**: set `VITE_GA_MEASUREMENT_ID` (G-…) in Vercel. Page views are sent
  on every route change; query strings are stripped to campaign tags only, so
  emails in sign-up links never reach analytics.
- **Conversions** (GA4 and PostHog): `cta_click` (with `cta` and `location`),
  `generate_lead` (demo booked in Calendly), `sign_up`, `tutorial_complete`
  (onboarding finished). Mark `sign_up` and `generate_lead` as key events in GA4.
- **PostHog** stays as before (`VITE_POSTHOG_KEY`).

## Manual setup

1. **Domain.** Point `www.fynhelp.com` at the Vercel project, and redirect
   `fynhelp.com` to `www` (Vercel → Domains). The site is canonical on `www`;
   until the domain serves this deployment, Vercel URLs answer with noindex.
   To use another domain, set `VITE_SITE_URL` (for example
   `https://fynhelp.com`) and redeploy.
2. **Google Search Console.** Add the `https://www.fynhelp.com` property (or a
   Domain property via DNS). The existing HTML verification tag is kept;
   override it with `VITE_GOOGLE_SITE_VERIFICATION` if Search Console gives a
   new one. Submit `https://www.fynhelp.com/sitemap.xml`, then use URL
   Inspection on `/`, `/pricing` and `/agents/recon` to request indexing.
3. **Bing Webmaster Tools.** Import the property from Search Console and
   submit the same sitemap.
4. **GA4.** Create a web data stream for `www.fynhelp.com`, set
   `VITE_GA_MEASUREMENT_ID`, redeploy, and mark `sign_up` and `generate_lead`
   as key events. Link GA4 to Search Console.
5. **Rich results.** After deploy, check `/`, `/pricing`, `/agents/recon` and a
   blog post in Google's Rich Results Test.
6. **Content.** The six published blog posts are about AI CFOs for startups.
   Rewrite or unpublish them, and publish CA-practice guides (bank
   reconciliation, monthly MIS, document collection, GST reconciliation), each
   linking to the matching module page.
