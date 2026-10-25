# Referrals: one extra month for both firms

## How it works
1. Every firm has a code (`FH` + 6 characters) and a link `https://www.fynhelp.com/?ref=CODE`, in **Settings, Refer a firm**.
2. A new firm opens the link (the code is kept for 90 days) or types the code in the onboarding firm step. It is attached when the firm is created.
3. When that firm adds its **first client**, both firms earn one month:
   - **On a free trial:** 30 days are added to the trial straight away (also restarts a trial that has ended). A reward earned before the first upload is kept and added to the 14 days.
   - **On a paid plan:** one month's fee is credited by the billing team. `billing@fynhelp.com` gets an email with the amount and the exact statement to run when done.
4. Both firms get an in-app notification and an email.

## Rules that stop abuse
One referral per new firm; a firm cannot use its own code, or a code from a firm with the same owner or the same email; demo firms are excluded;
a code can be added only in a firm's first 7 days; a referrer earns at most 12 reward months in any 365 days (the new firm still gets its month).
Each side is rewarded once (database unique key on referral and role), so retries, double clicks and a second client change nothing.

## For the billing team
Credits waiting:

    select r.id, f.firm_name, r.role, r.created_at, b.plan, b.cycle
    from ca_referral_rewards r join ca_firms f on f.id = r.ca_firm_id left join ca_billing b on b.ca_firm_id = r.ca_firm_id
    where r.status = 'pending_billing' order by r.created_at;

After crediting the invoice (or issuing the Razorpay refund and GST credit note):

    update ca_referral_rewards set status = 'done', done_at = now() where id = '<id>';

## Not covered yet
- Referral wording in the Terms (needs the Word source and legal review).
- Paying referral credits automatically through Razorpay. Credits are manual on purpose: refunds and GST credit notes need a person.
