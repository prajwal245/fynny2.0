# Recording a CA's month-end flow (real app, real files)

`scripts/record-client-flow.mjs` drives the real FynHelp app in a browser and records a captioned 1920x1080 video: sign in, add the client, upload the files, statement proof, review queue, reconciliation, exceptions, data needed, month-end close, MIS, sign-off, PDF and Excel export.

## Before you run it
- Use a **test firm** login, with firm setup already finished.
- The files are a real client's, so the video shows real names and figures. Keep it internal unless the client has agreed.
- Put the client's files in one folder, named as they are in the Drive folder (the list is at the top of the script).
- Install once, outside the repo's lockfile:

```bash
npm i --no-save playwright && npx playwright install chromium
```

## Run it

```bash
FYNHELP_URL=https://fynhelp.com \
FYNHELP_EMAIL=testfirm@example.com \
FYNHELP_PASSWORD='...' \
FILES_DIR=/path/to/Satkaarika \
node scripts/record-client-flow.mjs
```

Set `HEADLESS=0` to watch it. Set `DRY_RUN=1` to check only that the sign-in page and its fields are found; nothing is submitted.

Output goes to `./recording-out`: `client-flow.webm`, the exported MIS files, and a `FAILED-<step>.png` for any step that did not complete. The summary at the end lists every step as ok or FAILED with the reason.

## What is and is not checked
- Verified against the app's source: the sign-in fields, the Add client form, the upload control, the tab names, the Generate MIS dialog, the sign-off confirmation and the export buttons. The sign-in step was run against a local build.
- **Not run against the live app** from the environment that wrote it, so a selector may need adjusting. A failed step stops that step only; the run continues.
- Not covered, because they need a real phone or inbox: client WhatsApp messages, Gmail intake, the Chaser on both channels. See the brief for how to test those.
- The MIS is generated for the first month, from `MIS_FROM` (default March 2026) backwards, that has matched transactions.
