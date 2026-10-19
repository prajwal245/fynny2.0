# FynHelp walkthrough: voiceover script

For the 5:36 cut (`FynHelp-product-walkthrough-clean.mp4`). 19 lines, 545 words, about 3.9 minutes of speech at a calm 140 words a minute, so every line fits its scene with room to breathe. The same lines, timed, are in `voiceover.en.srt`.

## Voice direction

- **Tone:** warm, calm and confident, like a senior colleague showing a partner around. Not salesy, no hype.
- **Pace:** about 140 words a minute. Short pause (0.3 s) at each full stop, longer (0.6 s) between scenes.
- **Accent:** neutral Indian English works best for CA firms; a neutral international English voice also fits.
- **Music:** keep the music bed about 18 to 20 dB under the voice. Use the clean version of the video, which has no burned-in subtitles, so on-screen text and voice never disagree.

## Pronunciation

| Write | Say |
|---|---|
| FynHelp | "Fin-help" |
| MIS | "M-I-S" (letters) |
| CA | "C-A" (letters) |
| HDFC | "H-D-F-C" |
| Tally | "Tally" |
| Zoho | "ZO-ho" |
| Razorpay | "Razor-pay" |
| fynhelp dot com | "fin-help dot com" |
| Command K | "Command K" |

Most AI voice tools let you fix these with a pronunciation dictionary or by spelling the word the way it sounds (for example, write "Fin-help" in the text you paste).

## Script

| Starts | Ends | On screen | Voiceover |
|---|---|---|---|
| 0:00 | 0:04 | Intro card | Month-end close for CA firms, without the scramble. |
| 0:04 | 0:15 | Home page | This is FynHelp. Your clients' statements come in, their books get matched, and a signed-off MIS goes out. Let's close one real month. |
| 0:15 | 0:29 | Pricing page | Pricing is per active client, with unlimited users. Pay yearly and get two months free. Tell the helper how many clients you close, and it picks the cheapest plan. |
| 0:29 | 0:48 | Sign up and create the firm | Signing up takes a minute, and there's no card. The fourteen-day trial only starts when you upload your first document, so you can set up the firm at your own pace. |
| 0:48 | 0:58 | Add the first client | Add your first client. A name, an email and a WhatsApp number are enough. |
| 0:58 | 1:09 | Upload September's bank statement | Drop in September's bank statement. Extract reads every line in seconds, and sets aside anything unclear for a person. |
| 1:09 | 1:23 | Upload the Tally day book; Recon runs | Now add the books. A Tally export works. As soon as both sides are in, Recon starts by itself: exact matches first, then close ones, then your firm's rules. |
| 1:23 | 1:31 | Review queue | A US-dollar payout needs a person, and FynHelp says why. Fix it once; it remembers. |
| 1:31 | 1:52 | Exceptions | Exceptions arrive with a suggested match and the evidence side by side. Here, forty thousand rupees came in against a fifty-thousand-rupee bill, so we record a part payment, with a note. Every decision lands on the audit trail. |
| 1:52 | 2:12 | Generate the MIS | With nothing left open, the MIS is one click away. It's built only from matched transactions, and every figure opens the exact bank lines behind it. No guesswork for the client, or the partner. |
| 2:12 | 2:20 | Partner sign-off | The partner reviews and signs off. September is closed, start to finish. |
| 2:20 | 2:56 | Chaser | Missing a document? Create a chase. The Chaser emails the client a polite reminder in your firm's name, and keeps following up on its own. The moment the invoice arrives, the chase closes by itself. No more spreadsheets of who still owes what. On the Firm plan, it can follow up on WhatsApp too. |
| 2:56 | 3:31 | Gmail | Next month, documents start arriving on their own. Connect the firm's Gmail once. FynHelp checks the inbox on a schedule, and only takes in attachments from people it knows. Ramesh emailed October's HDFC statement, and it's already filed under his company, ready to reconcile. Anything from an address FynHelp doesn't know waits in an unassigned inbox for your team. |
| 3:31 | 4:03 | WhatsApp | Many clients prefer WhatsApp. Link the firm's official WhatsApp Business number. When Ramesh sends his Axis statement from his phone, FynHelp recognises his number, files it under Sundara Textiles, and reads it straight away. Messages from unknown numbers wait in an unassigned inbox, so nothing gets lost. |
| 4:03 | 4:48 | Zoho Books | If a client keeps their books in Zoho, connect Zoho Books. Access is read-only, so FynHelp never changes anything in Zoho. Map the client to its organisation and bank account, choose October, and pull. The books arrive, and Recon matches them against the statement Ramesh emailed, without anyone typing a line. |
| 4:48 | 5:03 | Today view and Command K | Every morning, one screen shows what needs you, and what the agents did. Press Command K to find anything, or to run an agent. |
| 5:03 | 5:14 | Invite the team | Invite the whole team. Partners sign off, juniors prepare, and nobody pays per seat. |
| 5:14 | 5:30 | Usage and choosing a plan | You can see this month's active clients and documents as you go. When you're ready, choose a plan and pay through Razorpay. Clients you don't touch in a month are free. |
| 5:30 | 5:36 | Outro card | Close your books in days, not weeks. Start free at fynhelp dot com. |

## Ready to paste into the AI voice tool

One block per scene. Generate each block as its own clip and place it at the start time shown, or paste the whole thing as one take and line it up using the SRT. The `<break>` tags work in ElevenLabs; remove them for tools that do not support them.

```text
[0:00] Intro card
Month-end close for CA firms, without the scramble.

[0:04] Home page
This is FynHelp. <break time="0.3s" /> Your clients' statements come in, their books get matched, and a signed-off MIS goes out. <break time="0.3s" /> Let's close one real month.

[0:15] Pricing page
Pricing is per active client, with unlimited users. <break time="0.3s" /> Pay yearly and get two months free. <break time="0.3s" /> Tell the helper how many clients you close, and it picks the cheapest plan.

[0:29] Sign up and create the firm
Signing up takes a minute, and there's no card. <break time="0.3s" /> The fourteen-day trial only starts when you upload your first document, so you can set up the firm at your own pace.

[0:48] Add the first client
Add your first client. <break time="0.3s" /> A name, an email and a WhatsApp number are enough.

[0:58] Upload September's bank statement
Drop in September's bank statement. <break time="0.3s" /> Extract reads every line in seconds, and sets aside anything unclear for a person.

[1:09] Upload the Tally day book; Recon runs
Now add the books. <break time="0.3s" /> A Tally export works. <break time="0.3s" /> As soon as both sides are in, Recon starts by itself: exact matches first, then close ones, then your firm's rules.

[1:23] Review queue
A US-dollar payout needs a person, and FynHelp says why. <break time="0.3s" /> Fix it once; it remembers.

[1:31] Exceptions
Exceptions arrive with a suggested match and the evidence side by side. <break time="0.3s" /> Here, forty thousand rupees came in against a fifty-thousand-rupee bill, so we record a part payment, with a note. <break time="0.3s" /> Every decision lands on the audit trail.

[1:52] Generate the MIS
With nothing left open, the MIS is one click away. <break time="0.3s" /> It's built only from matched transactions, and every figure opens the exact bank lines behind it. <break time="0.3s" /> No guesswork for the client, or the partner.

[2:12] Partner sign-off
The partner reviews and signs off. <break time="0.3s" /> September is closed, start to finish.

[2:20] Chaser
Missing a document? Create a chase. <break time="0.3s" /> The Chaser emails the client a polite reminder in your firm's name, and keeps following up on its own. <break time="0.3s" /> The moment the invoice arrives, the chase closes by itself. <break time="0.3s" /> No more spreadsheets of who still owes what. <break time="0.3s" /> On the Firm plan, it can follow up on WhatsApp too.

[2:56] Gmail
Next month, documents start arriving on their own. <break time="0.3s" /> Connect the firm's Gmail once. <break time="0.3s" /> FynHelp checks the inbox on a schedule, and only takes in attachments from people it knows. <break time="0.3s" /> Ramesh emailed October's HDFC statement, and it's already filed under his company, ready to reconcile. <break time="0.3s" /> Anything from an address FynHelp doesn't know waits in an unassigned inbox for your team.

[3:31] WhatsApp
Many clients prefer WhatsApp. <break time="0.3s" /> Link the firm's official WhatsApp Business number. <break time="0.3s" /> When Ramesh sends his Axis statement from his phone, FynHelp recognises his number, files it under Sundara Textiles, and reads it straight away. <break time="0.3s" /> Messages from unknown numbers wait in an unassigned inbox, so nothing gets lost.

[4:03] Zoho Books
If a client keeps their books in Zoho, connect Zoho Books. <break time="0.3s" /> Access is read-only, so FynHelp never changes anything in Zoho. <break time="0.3s" /> Map the client to its organisation and bank account, choose October, and pull. <break time="0.3s" /> The books arrive, and Recon matches them against the statement Ramesh emailed, without anyone typing a line.

[4:48] Today view and Command K
Every morning, one screen shows what needs you, and what the agents did. <break time="0.3s" /> Press Command K to find anything, or to run an agent.

[5:03] Invite the team
Invite the whole team. <break time="0.3s" /> Partners sign off, juniors prepare, and nobody pays per seat.

[5:14] Usage and choosing a plan
You can see this month's active clients and documents as you go. <break time="0.3s" /> When you're ready, choose a plan and pay through Razorpay. <break time="0.3s" /> Clients you don't touch in a month are free.

[5:30] Outro card
Close your books in days, not weeks. <break time="0.3s" /> Start free at fynhelp dot com.

```
