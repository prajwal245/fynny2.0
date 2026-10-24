# Live TallyPrime connection

TallyPrime runs on the CA's own PC, so FynHelp's servers cannot call it. The **FynHelp Connector**
(`public/downloads/fynhelp-tally-connector.mjs`, Node 18+, no dependencies) runs on that PC, reads Tally's local XML
server (port 9000) and sends data out to FynHelp over HTTPS. Nothing is opened to the internet and Tally is only read.

## Flow
1. Settings, TallyPrime, **Add connector** (partner). A secret token `fyn_tc_...` is shown once; only its SHA-256 is stored.
2. On the Tally PC: Tally F1, Settings, Connectivity, Client/Server: **Both**, port 9000. Save the connector file and
   `fynhelp-connector.json` (`{ "token": "..." }`) in a folder; `node fynhelp-tally-connector.mjs --check`, then run it.
3. The connector checks in every 2 minutes (`/api/public/tally-hello`): sends the companies open in Tally and its
   version, and learns which companies are linked and which months to send. A company with no client linked sends nothing.
4. In Settings link each Tally company to a client.
5. Every hour (or when someone presses **Sync now**) it sends each linked company's Day Book per month to
   `/api/public/tally-ledger`. A new company gets the last 3 months plus this one; after that this and last month.
6. The server files it as a books-side document (channel "Tally"), like Zoho Books: same company and month with
   new entries is re-read in place (matched lines stay matched); identical data is ignored. Trial and plan limits apply.

## Safety
- Token only authenticates its own firm; revoking it stops the connector at once. Up to 10 active connectors per firm.
- A paused trial/plan returns 402; the connector logs it and tries again next round.
- Tally's invalid XML characters (for example `&#4;`) are removed before sending; UTF-16 replies are decoded.

## Not covered yet
- A packaged Windows installer / auto-update (today: Node plus a config file).
- Tally on Cloud where Tally's port is not reachable from the PC running the connector: run the connector on the
  cloud desktop itself.
- Only the Day Book is read (what Recon needs). Ledgers, stock and GST data are not pulled.
