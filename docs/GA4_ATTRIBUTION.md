# GA4: which campaign, person or ad each sign-up came from

## What is in the code
- The Google tag (`G-GEZMCK8JYS`) is in the `<head>` of every page (`src/routes/__root.tsx`), on `fynhelp.com` and
  `www.fynhelp.com` only, with Consent Mode: analytics storage is denied until the visitor accepts cookies.
- On a visitor's first landing, `utm_source / utm_medium / utm_campaign / utm_content / utm_term` (and `gclid`,
  `fbclid`) are saved in the browser (`src/lib/utm.ts`) and kept while they browse.
- These conversions now carry those tags as event parameters: `sign_up`, `generate_lead` (demo booked),
  `waitlist_signup`, `cta_click`, `tutorial_complete` (onboarding done), `subscription_upgraded`.
  Plain traffic with no campaign tags sends none, so it is not mislabelled.

## Set up in GA4 (Admin, about 10 minutes)
1. **Check it receives data:** Admin → DebugView. Open `https://www.fynhelp.com/?utm_source=test&utm_medium=test&utm_campaign=test&utm_content=test`,
   accept cookies, create a test account. You should see `page_view` and `sign_up` with `utm_content = test`.
2. **Mark key events:** Admin → Data display → Events → turn on **Mark as key event** for `sign_up`, `generate_lead`
   and `subscription_upgraded`. (Events appear after they have fired once.)
3. **Register the tags as custom dimensions** (this is what lets you report by `utm_content`):
   Admin → Data display → Custom definitions → Create custom dimension, scope **Event**, once each:
   | Dimension name | Event parameter |
   |---|---|
   | Campaign content | `utm_content` |
   | Campaign source (event) | `utm_source` |
   | Campaign medium (event) | `utm_medium` |
   | Campaign name (event) | `utm_campaign` |
   | Landing page (event) | `landing_page` |
   Data starts filling in from the day each is created, not backwards.
4. **Report:** Explore → Free form. Rows: *Campaign content*. Columns: none. Values: *Key events* (or Event count with the
   filter *Event name = sign_up*). Add *Campaign source (event)* and *Campaign name (event)* as extra rows to split by channel.

## Naming the links (one rule, so the report is readable)
`utm_source` = where the link is posted, `utm_medium` = kind of channel, `utm_campaign` = the campaign and month,
`utm_content` = **who or which ad**. Lower case, no spaces.

| Where | utm_source | utm_medium | utm_campaign | utm_content |
|---|---|---|---|---|
| Tarun's LinkedIn post | linkedin | social | oct26_launch | tarun |
| Nidhi's LinkedIn post | linkedin | social | oct26_launch | nidhi |
| Meta ad, creative 1 | meta | paid_social | oct26_launch | meta_ad_1 |
| Meta ad, creative 2 | meta | paid_social | oct26_launch | meta_ad_2 |

Example: `https://www.fynhelp.com/?utm_source=linkedin&utm_medium=social&utm_campaign=oct26_launch&utm_content=tarun`
Meta can fill it in for you: in the ad, URL parameters → `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.

## Things to know
- **Cookie consent:** a visitor who declines cookies is not tracked, so GA4 counts are lower than real sign-ups.
  For exact numbers by source, store the tags with the account (not built yet; ask).
- **Standard reports** also split by *Session manual ad content* from the landing URL. The custom dimensions above
  are more reliable because the tags are sent with the sign-up itself, even if the visitor signs up days later.
- A "thank-you page" is not needed: the `sign_up` event fires when the account is created.
