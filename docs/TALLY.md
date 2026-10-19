# Tally Prime connector

Read-only. A small agent on the client's Windows PC reads Tally on `localhost:9000`
and pushes ledger snapshots to FynHelp over HTTPS. Nothing connects in to the PC,
and nothing is ever written to Tally.

```
Tally Prime ──XML/9000──▶ agent (client PC) ──HTTPS POST──▶ /api/integrations/tally/agent
                                                              │
                                      ca_tally_snapshots ◀────┘  (ledgers, debit positive)
                                              │
                    statements.ts: Trial Balance · Schedule III P&L · Balance Sheet
                                  · debtors/creditors · monthly trend · Books agent review
                                              │
                                  client workspace → Books tab (+ Excel / Print)
```

## Pieces

| Where | What |
|---|---|
| `tools/tally-agent/` | `agent.mjs` (CLI: `pair`, `sync [--backfill]`, `status`), `lib.mjs` (Tally XML requests and parsing, snapshot dates), `Install.bat` (double-click; asks for the code) → `install.ps1` (copies, pairs, schedules every 4 h), `diagnose` (anonymised sample of what Tally sends, for support) |
| `public/tally-agent/` | `fynhelp-tally-agent.zip` (built by `scripts/build-tally-agent.sh`, rebuild after any change under `tools/tally-agent`) and the client-facing `guide.html` |
| `src/routes/api/integrations/tally/agent.ts` | The one endpoint the agent calls: `pair`, `companies`, `snapshot` |
| `src/lib/practice/tally.server.ts` | Pairing, token auth, ingest, linking, `statements()` |
| `src/lib/practice/tally/payload.ts` | The wire format (zod), sign flip, code and token helpers |
| `src/lib/practice/tally/statements.ts` | Pure statements and the Books agent's rules |
| `src/v2/components/TallyConnect.tsx` | Settings → Tally Prime: pairing, agents, link company to client |
| `src/v2/components/ClientBooks.tsx` | Client workspace → Books |
| `supabase/migrations/20261019120000_tally_connector.sql` | `ca_tally_pairings`, `ca_tally_agents`, `ca_tally_companies`, `ca_tally_snapshots` |

## Product principle

A connector earns its place by removing a step the firm repeats for every client every month: exporting
Tally and uploading it. So after one link per client, the books arrive by themselves: each month's Day Book
becomes a books-side document (source "Tally"), is read by the same parser as an uploaded export, and Recon
runs against it. The Books tab keeps the statements current. Pull first and read-only; write-back stays a
separate, explicitly confirmed phase.

## Flow

1. Partner: Settings → Tally Prime → **Connect**. FynHelp shows a one-time code (`FYN-XXXX-XXXX`, 30 minutes, stored hashed).
2. Client (or our team on a call) unzips the agent, double-clicks `Install.bat`, enters the code. The agent swaps it for a bearer token (shown once, stored hashed server side, kept in `%APPDATA%\FynHelpTally\config.json`).
3. The agent lists the open companies, then for each sends a snapshot as on today and (first run, or `--backfill`) every month end of the financial year.
4. Settings notices the agent and lists the companies. The partner links each to a client (a name match is pre-selected).
5. On every snapshot the **Books agent** reads the ledgers and records what it found in the client's activity log.

## Wire format

`kind: "daybook"` carries a range of Tally's Day Book as raw XML (the agent halves a range above 5 MB). For a linked company it is filed via `registerDocument` as `side: books`, `channel: Tally`; an unlinked company gets `waiting`, a paused plan gets `paused`, an identical resend `unchanged`.

`POST /api/integrations/tally/agent`, JSON, 8 MB cap. `Authorization: Bearer fhta_…` except for `pair`.
`closing`/`opening` are **Tally's own sign** (a debit is negative); the server flips them once, so everything
stored and computed is debit positive. Balances are cumulative from the start of the April to March year,
so a month's own movement is one snapshot less the previous (`monthlySeries`).

## Security

- Outbound only; the agent never opens a port. Read-only requests (`Export` of `Collection`s).
- Pairing codes: single use, 30 minutes, 8 characters from a 32 letter alphabet, stored as SHA-256.
- Agent tokens: 256 bit random, stored as SHA-256, revocable per PC from Settings (`401` on the next call).
- Tables are service role only (RLS on, no policies, grants revoked), like the Zoho tables.
- Only partners can create codes, link companies, pause sync or remove a PC (`canSignOff`).
- A company links to one client only, and every read is scoped by `ca_firm_id`.

## Statements and the Books agent

Tally has fixed primary groups; user groups sit beneath them, so each ledger's parent chain is walked to the
first reserved name (`resolveLedgers`). From that: nature, Schedule III head, and the statements.

Books agent checks: trial balance tallies; ledgers outside any primary group; suspense balance; negative
cash/bank; debtors with credit balances and creditors with debit balances; balance sheet off (closing stock);
TDS ledger in debit; one customer holding most receivables; running at a loss. Every finding names its ledgers.

## Not validated yet, needs real Tally data

These are written from Tally's documented XML behaviour and tested against hand-made fixtures, **not** against
a real Tally Prime company:

- The exact element names and the `ClosingBalance` format in the `Collection` export (the parser accepts
  `-1500.00`, `1,500.00 Dr`/`Cr`). Different Tally versions may differ.
- That `SVFROMDATE`/`SVTODATE` give year-to-date closing balances for nominal (P&L) ledgers as assumed.
- **Closing stock.** Tally works it out when a report runs; it is not a ledger posting. `snapshot.stockAdjustment`
  and the statements support it, but the agent does not read it yet, so a client that keeps inventory will see the
  Books agent say the balance sheet is off by the stock figure.
- Large companies (tens of thousands of ledgers) and Tally's own timeouts.

No Tally samples exist yet. The first client install is the sample: run `node agent.mjs diagnose` on that PC (names are replaced, amounts kept; the client can read the file before sending) and check the parser against it before wider rollout.

## Next slices

1. Read closing and opening stock in the agent (`$ClosingValue` of Stock-in-Hand).
2. Vouchers (Day Book) for drill-down below the ledger, GST and TDS reconciliations, debtor/creditor ageing by bill.
3. Budget vs actual, Cash Flow (indirect), prior-year comparatives, signed-off Schedule III pack as PDF.
4. Signed Windows installer (`.exe`/MSI) so Node.js is not a prerequisite; auto-update.
5. Tally-importable journal vouchers for adjustments (write-back is a separate, explicitly confirmed phase).
6. A pairing attempt limiter on the endpoint.
