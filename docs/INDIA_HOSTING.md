# India-only data: what is switched, what is still to move

Decision (20 Nov 2026): client data is hosted and processed in India only. The NDA and data terms are handled separately.
Decision: posting to Tally and Zoho stays OFF for the QC module.

## What the code now enforces

| Rule | Switch | Default |
|---|---|---|
| No entry is written to Tally. Approvals, ledger creation and the connector's outbox all refuse or return nothing; the writing screen is hidden. | `PRACTICE_TALLY_POSTING` (only the value `on` enables it) | off |
| No entry is written to Zoho Books. | `ZOHO_POSTING_FIRMS` (empty means none) | off |
| No document text or image is sent to an AI model outside India. Only an allow-listed Indian host may be used; the shared edge function and every other provider are switched off, and reading falls back to rules. | `PRACTICE_DATA_RESIDENCY=india`, with `PRACTICE_AI_INDIA_HOSTS` (default `asia-south1-aiplatform.googleapis.com`) | not set (set it before pilot firms) |

In India-only mode with no Indian AI endpoint configured, AI reading is simply off: bank statements and registers that rules can read still work and still tie out; scans and unusual layouts wait for a person. To keep AI reading inside India, an Indian endpoint has to be configured (for example a Mumbai region model endpoint) and its host added to the allow-list.

## Where client data lives, and what has to move (owner actions)

| Data | Today | India-only action |
|---|---|---|
| Database and file storage (documents, lines, history) | A hosted Postgres and storage project. The CA's notes say it shows as Sydney. | Create the project in the Mumbai region, copy the data (database dump and restore, storage copy, user accounts), switch the app to it, then retire the old one. Needs a maintenance window and a rehearsed rollback. |
| App servers (the code that reads documents) | Hosted by the app platform | Confirm the server region of the deployment; pin it to India if the platform allows. If it cannot be pinned, document that documents pass through it in memory. |
| AI reading | External providers | Switched off by the rule above unless an Indian endpoint is allow-listed |
| Email (reminders, report links) | External email provider | Confirm the provider's region. Messages carry client and firm names; if it cannot be India, keep documents and figures out of the email body (links only). |
| WhatsApp | Meta | Messages and media pass through Meta by nature of the channel. Disclose it in the data terms; send links, not statements. |
| Gmail intake | Google | Read-only access to attachments the firm chooses; disclose in the data terms. |
| Payments | Razorpay (India) | None |

## Checks before any pilot firm is added
1. The database and storage region is an Indian region, shown in the project settings.
2. `PRACTICE_DATA_RESIDENCY=india` is set on the deployment; the AI status in System Health reads "off (India-only mode)" or names the Indian host.
3. `PRACTICE_TALLY_POSTING` is not set and `ZOHO_POSTING_FIRMS` is empty.
4. The audit log records reads, downloads and exports (not yet built; see the roadmap).
