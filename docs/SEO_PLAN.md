# SEO plan: getting CA firms to find FynHelp

## Positioning (one sentence, used everywhere)

**FynHelp is month-end close software for CA firms in India.** It collects client documents, reconciles bank to Tally or Zoho books and drafts a source-traceable MIS that a partner signs off. It works on top of the books clients already keep, and every plan has unlimited users.

Words to use: month-end close, bank reconciliation, GSTR-2B, MIS, source-traceable, exceptions, partner sign-off, CA firms, Tally, Zoho Books.
Words to avoid: "AI financial intelligence", "replaces your accounting software", anything about deadline tracking or filing (the product does neither).

## The ten articles (live with the deploy)

Each article targets one search the people we sell to actually make, answers it in the first lines, and ends at `/launch`.

| # | Article | Primary keyword | Pain point | Search intent |
|---|---|---|---|---|
| 1 | /blog/bank-reconciliation-in-tally-prime | bank reconciliation in tally prime | Juniors tick bank lines by hand | How-to |
| 2 | /blog/bank-reconciliation-statement-format-example | bank reconciliation statement format | Explaining the gap between books and bank | Definition and template |
| 3 | /blog/gstr-2a-vs-gstr-2b-difference | gstr 2a vs gstr 2b | Not sure which to reconcile against | Comparison |
| 4 | /blog/itc-mismatch-gstr-2b-books-reasons | itc mismatch gstr 2b | Mismatches that take days to explain | Troubleshooting |
| 5 | /blog/what-is-mis-report-format-for-small-business | mis report format | Clients get numbers once a year | Definition and template |
| 6 | /blog/client-document-collection-reminder-templates-ca-firms | reminder message to client for documents | Chasing clients for statements | Templates |
| 7 | /blog/tally-vs-zoho-books-for-ca-firms | tally vs zoho books | Clients on different software | Comparison |
| 8 | /blog/virtual-cfo-services-india-ca-firm-how-to-start | virtual cfo services india | Growing fees without hiring | Commercial research |
| 9 | /blog/practice-management-software-ca-firms-india | software for ca firms | Choosing a tool | Buyer research |
| 10 | /blog/how-ca-firms-grow-without-hiring | grow ca practice | Capacity | Commercial research |

**About search volume.** There is no keyword-data tool connected to this project, so the keywords above are chosen from how CA teams phrase these problems, not from measured volumes. Before writing the next batch, check each phrase in Google Search Console (Performance, after two to three weeks of data) and Google Keyword Planner, and double down on what gets impressions.

## What is already done in the site

- Every article has a unique title (60 characters or fewer), a description (160 or fewer), an Article schema, a breadcrumb schema and FAQ schema read from its "Frequently asked questions" section.
- `/sitemap.xml` lists the articles and `/launch`; `robots.txt` points to it; `llms.txt` lists the guides for AI assistants.
- Articles link to each other, to the product pages and to `/launch`.

## Do next (needs your accounts)

1. **Google Search Console**: add `https://www.fynhelp.com` as a property, verify it, submit `/sitemap.xml`, and request indexing for the ten article URLs and `/launch`.
2. **Bing Webmaster Tools**: import from Search Console (one click). Bing also feeds several AI assistants.
3. **Analytics**: confirm PostHog or GA4 receives `cta_click` events from `/launch` and the articles. Tag every outside link with UTM parameters, for example `?utm_source=linkedin&utm_medium=social&utm_campaign=launch`.
4. **Google Business Profile** for the Bengaluru address, if you want local results.

## Distribution: one article a day for ten days

For each article, post a short LinkedIn note from the founders (the problem in two lines, one table or template from the article, link), and share it in the CA WhatsApp and Telegram groups you are already in, where it is allowed. Reply to questions there with the relevant article. Cut the reminder templates (article 6) and the BRS example (article 2) into LinkedIn carousels; they are the most shareable.

## Links from other sites

- Offer a guest article or a template pack to CA-focused blogs and newsletters, with articles 2, 3 and 6 as starting points.
- Ask ICAI branch and study-circle organisers whether you can run a 30-minute session on month-end close; sessions usually come with a page that links to you.
- List FynHelp in software directories used by Indian accountants (G2, Capterra, SoftwareSuggest, GetApp).
- Reply on Quora and CA forums with real answers, linking only when it helps.

## Measuring it

| Measure | Where | Healthy sign |
|---|---|---|
| Impressions and clicks per article | Search Console | Impressions within three weeks, clicks growing monthly |
| Click-through rate | Search Console | Above 2% on pages that rank in the top ten |
| Visits to `/launch` and sign-ups from it | Analytics | Sign-ups from article visits |
| Demo bookings | Calendly | A few a week from organic and LinkedIn |

Organic search takes weeks to months. Do not judge in the first fortnight; judge on impressions first, then clicks, then sign-ups.

## Next batch (after you see Search Console data)

Reconciliation in Excel with VLOOKUP and its limits; TDS reconciliation (Form 26AS and AIS against books); month-end close timeline for a 30-client firm; the cost of a late bank statement; GST reconciliation for e-commerce sellers; a template pack download behind an email form.
