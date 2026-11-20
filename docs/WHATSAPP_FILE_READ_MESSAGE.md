# "Your file has been read" on WhatsApp

When a client sends a file on WhatsApp, they get two replies: "Received your file" at once, and a second message when the file has been read. The second message is sent for every outcome:

| Outcome | What the client reads |
|---|---|
| Read | "Your file X has been read (N entries). Thank you. Nothing more is needed from you for it." |
| Read, with the team checking | "Your file X has been read. Our team will check a few details and will message you only if something is missing." |
| Could not be read (no retry left) | "We could not read X: <plain reason>. Please send it again, or send a different copy." |

It goes out no matter what the reminder rules say (daily cap, daytime window, consent), because it answers the client's own message. It is sent once per file. While an automatic retry is still coming, nothing is sent; the message is sent at the final outcome.

## Cost (estimates)
- A free-text reply inside 24 hours of the client's last message is a service message: free, and it uses no FynHelp credit.
- Outside 24 hours WhatsApp refuses free text. If `WHATSAPP_DONE_TEMPLATE` is set (an approved template with one body variable, the message), it is sent as a template at its category rate: utility about ₹0.115, marketing about ₹0.78 per message (Meta's India rate card as last checked; override with `WHATSAPP_RATE_UTILITY_INR` and `WHATSAPP_RATE_MARKETING_INR`; set `WHATSAPP_DONE_TEMPLATE_CATEGORY=marketing` if Meta classed it so). Always check Meta's current rate card.
- Without `WHATSAPP_DONE_TEMPLATE`, a message that cannot be sent is recorded as a fault for the admin, and tried again at the next read of the file.

## Tracking
- The client's Activity feed gets a line each time: "Told the sender on WhatsApp that X was read (WhatsApp service reply, free inside 24 hours)" or the template and its estimated cost.
- The admin call log gets a row (purpose `whatsapp_done`) with the channel, the last four digits of the number and the estimated cost in rupees; a failure is a row with status error and the reason, and also shows in System Health under WhatsApp sending.
- A test firm's message is simulated and shown in the Activity feed as simulated.

## Template to submit (optional, for messages after 24 hours)
Name `fh_file_read`, category Utility, language as the other templates, body: `{{1}}` (example: "Your file hdfc.pdf has been read. Thank you.").
