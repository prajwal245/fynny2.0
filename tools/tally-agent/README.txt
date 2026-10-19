FynHelp Tally agent
===================
Reads Tally Prime on this PC and sends ledger balances to your CA's FynHelp.
Read-only: it never changes anything in Tally, and nothing connects in to this PC.

Install:  double-click Install.bat and type the pairing code.
Needs:    Windows, Node.js 18+ (nodejs.org), Tally open with port 9000 enabled
          (F1 > Settings > Connectivity > Client/Server configuration).
Check:    node agent.mjs status
Support:  node agent.mjs diagnose   saves an anonymised sample to share if something looks wrong
Guide:    https://www.fynhelp.com/tally-agent/guide.html
