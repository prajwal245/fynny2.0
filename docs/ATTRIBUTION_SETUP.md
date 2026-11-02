# Campaign attribution (UTM) setup

Every sign-up is saved with the campaign, ad set and ad that brought it: the **first click** and the **last click**.
It works on the existing pages (home, pricing, launch, blog and so on): put the tags on whichever page an ad points to.
No Google Tag Manager tag is needed (the app captures the tags itself, with the same storage names as the playbook
snippet, so installing that snippet as well is harmless but redundant).

## Naming rules (exactly, or reports split into duplicates)
Lower case, underscores instead of spaces, no special characters. The app tidies what it receives the same way,
so `Reel 1 / Still Manual` is saved as `reel_1_still_manual`.
- Campaign: `fh_{goal}_{channel}_{monthyear}`, for example `fh_trial_meta_nov26`, `fh_demo_meta_nov26`, `fh_search_recon_nov26`
- Ad: `{reel}_{length}_{hook}`, for example `reel1_32s_stillmanual`, `reel2_8s_bw`

| Parameter | Meaning | Values |
|---|---|---|
| utm_source | where the click came from | fb, ig, google, linkedin, youtube, whatsapp, email |
| utm_medium | type of traffic | paid_social, cpc, organic_social, referral, email |
| utm_campaign | campaign name or ID | fh_trial_meta_nov26, Google campaign ID |
| utm_content | which ad or ad group | ad name, or Google ad group ID |
| utm_term | ad set or keyword | Meta ad set name, or Google keyword |
| utm_id | campaign ID | Meta campaign ID |

`paid_social` and `cpc` make GA4 file traffic under Paid Social and Paid Search by themselves.

## Meta Ads (per ad, copy to all)
Ad → Destination → URL parameters → Build a URL parameter. Paste exactly:

```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&utm_id={{campaign.id}}
```
The website URL stays clean: use a page that already exists, for example `https://www.fynhelp.com/launch`
(trial) or the home page. Instant-form leads never visit the site; Meta's lead export already has campaign, ad set
and ad name, so include those columns when you connect the form to the sheet.

## Google Ads (account level, once)
1. Admin → Account settings → Auto-tagging: ON (adds gclid).
2. Account settings → Tracking → Final URL suffix:
```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}&matchtype={matchtype}&device={device}
```
Google passes IDs, not names: keep a two-column tab in the lead sheet that maps each ID to its name.

## What the app does with the tags
- On any page load that carries tags it keeps the **first click** (never overwritten, 90 days) and the **last click**
  (replaced by each newer tagged visit): utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id, gclid,
  fbclid and the landing page. Testers (QA mode) are never recorded.
- At sign-up they are saved on the user (`raw_user_meta_data.lead`) and on the firm (`ca_firms.lead_attribution`),
  shown in Admin, Firms (the firm's drawer), included in the team's new sign-up email, and sent to the lead sheet.
- **Book a demo** passes the last click to Calendly, so each booking carries its campaign. Connect Calendly to the
  sheet with its own integration to get demo rows.

## Lead sheet (Google Sheets)
1. Create a sheet. In it: Extensions → Apps Script, paste the script below, Deploy → New deployment → Web app
   (execute as you, access: anyone). Copy the web app address.
2. In Vercel set `LEAD_SHEET_WEBHOOK_URL` (that address) and `LEAD_SHEET_SECRET` (any long random value; use the same
   value in the script).
3. Apply `supabase/migrations/20261107090000_lead_attribution.sql`.

```js
const SECRET = "PASTE_THE_SAME_VALUE_AS_LEAD_SHEET_SECRET";
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.secret !== SECRET) return ContentService.createTextOutput("no");
  delete d.secret;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads") || SpreadsheetApp.getActiveSpreadsheet().insertSheet("Leads");
  const cols = ["ts","type","name","email","phone","whatsapp_ok",
    "first_utm_source","first_utm_medium","first_utm_campaign","first_utm_content","first_utm_term","first_utm_id","first_gclid","first_fbclid","first_landing",
    "last_utm_source","last_utm_medium","last_utm_campaign","last_utm_content","last_utm_term","last_utm_id","last_gclid","last_fbclid","last_landing"];
  if (sh.getLastRow() === 0) sh.appendRow(cols);
  sh.appendRow(cols.map((c) => d[c] === undefined ? "" : d[c]));
  return ContentService.createTextOutput("ok");
}
```

## Reporting (free)
GA4 Admin → Data display → Custom definitions: register `utm_content`, `utm_term`, `utm_source`, `utm_medium`,
`utm_campaign` as event dimensions (see `docs/GA4_ATTRIBUTION.md`). Connect the lead sheet to Looker Studio, and
join the Google ID-to-name tab on `last_utm_campaign` / `last_utm_content`.
