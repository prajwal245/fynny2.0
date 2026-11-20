# India-only data: what is switched, what is still to move

Decision (20 Nov 2026): client data (database and file storage) is hosted in India. The NDA and data terms are handled separately.
Decision: posting to Tally and Zoho stays OFF for the QC module.
Decision (20 Nov 2026, later): AI is used as usual. The backend keeps using its AI providers; AI is not limited to Indian endpoints. The India-only AI switch below exists but is NOT set, and is not recommended unless a firm's data terms ask for it.

## What the code now enforces

| Rule | Switch | Default |
|---|---|---|
| No entry is written to Tally. Approvals, ledger creation and the connector's outbox all refuse or return nothing; the writing screen is hidden. | `PRACTICE_TALLY_POSTING` (only the value `on` enables it) | off |
| No entry is written to Zoho Books. | `ZOHO_POSTING_FIRMS` (empty means none) | off |
| OPTIONAL. If a firm's terms require it: no document text or image goes to an AI model outside India. Only an allow-listed Indian host may be used; the shared edge function and every other provider are switched off, and reading falls back to rules. | `PRACTICE_DATA_RESIDENCY=india`, with `PRACTICE_AI_INDIA_HOSTS` (default `asia-south1-aiplatform.googleapis.com`) | not set: AI works as usual |

If the optional India-only AI mode is ever turned on with no Indian AI endpoint configured, AI reading is simply off: bank statements and registers that rules can read still work and still tie out; scans and unusual layouts wait for a person. To keep AI reading inside India, an Indian endpoint has to be configured (for example a Mumbai region model endpoint) and its host added to the allow-list.

## Where client data lives, and what has to move (owner actions)

| Data | Today | India-only action |
|---|---|---|
| Database and file storage (documents, lines, history) | A hosted Postgres and storage project. The CA's notes say it shows as Sydney. | Create the project in the Mumbai region, copy the data (database dump and restore, storage copy, user accounts), switch the app to it, then retire the old one. Needs a maintenance window and a rehearsed rollback. |
| App servers (the code that reads documents) | Hosted by the app platform | Confirm the server region of the deployment; pin it to India if the platform allows. If it cannot be pinned, document that documents pass through it in memory. |
| AI reading | External AI providers, as usual | Nothing to change. The data terms must say that document text is sent to the AI provider for reading. The optional India-only switch is available if a firm requires it. |
| Email (reminders, report links) | External email provider | Confirm the provider's region. Messages carry client and firm names; if it cannot be India, keep documents and figures out of the email body (links only). |
| WhatsApp | Meta | Messages and media pass through Meta by nature of the channel. Disclose it in the data terms; send links, not statements. |
| Gmail intake | Google | Read-only access to attachments the firm chooses; disclose in the data terms. |
| Payments | Razorpay (India) | None |

## Checks before any pilot firm is added
1. The database and storage region is an Indian region, shown in the project settings.
2. The data terms disclose AI processing by an external provider. (`PRACTICE_DATA_RESIDENCY` stays unset unless a firm requires India-only AI.)
3. `PRACTICE_TALLY_POSTING` is not set and `ZOHO_POSTING_FIRMS` is empty.
4. The audit log records reads, downloads and exports (not yet built; see the roadmap).
