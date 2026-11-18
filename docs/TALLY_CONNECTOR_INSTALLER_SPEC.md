# FynHelp Connector for Windows: installer specification

Status 18 Nov 2026. The web side and the connector script are built and tested (pairing code, redeem endpoint, `--pair`). What remains is a signed Windows installer, which must be built and signed on Windows. This is the brief for that build.

## 1. Goal

A CA firm's office person goes from "no connection" to "company listed in FynHelp" in **under 5 minutes, with no technical step**. Compare Vyapar TaxOne's flow: download, install, log in, open Tally, set host and port, save, verify, add company.

| Step | FynHelp target |
|---|---|
| 1 | In FynHelp: Settings, TallyPrime, **Get a pairing code** (shows `7K2QM-X9HTD`, valid 15 minutes, single use) |
| 2 | Download `FynHelp-Connector-Setup.exe` and run it. No admin rights, no Node.js to install |
| 3 | Type the code. The installer finds Tally on this PC, connects, and starts the connector |
| 4 | Back in FynHelp the connector shows Online. Link each company to a client |

There is no host or port screen in the normal path. The connector tries `localhost:9000`, then the other ports Tally Prime commonly uses, and only asks if none answers.

## 2. What already exists (do not rebuild)

- `POST /api/public/tally-pair` exchanges a code for the connector's token once. Limited to 12 attempts per address per 15 minutes. Codes are 10 characters from a 30-letter alphabet without look-alikes, stored only as a hash, expire after 15 minutes, work once.
- `public/downloads/fynhelp-tally-connector.mjs` (1.6.0): `--pair <code>`, `--check`, `--once`, `--config`, `--log`. Reads Tally on the PC, sends each linked company's Day Book. Writes into Tally only lines a person approved, and only when `allowWrite` is true.
- `public/downloads/fynhelp-connector-setup.ps1` and `.cmd`: the current Node-based install (installs Node.js, pairs, registers a scheduled task). The installer below replaces its install steps and keeps its behaviour.

## 3. Packaging

1. Bundle the connector with its runtime into one executable (Node Single Executable Application, or `pkg`). Keep the `.mjs` as the source of truth; the build wraps it unchanged.
2. Wrap it in an installer (Inno Setup or WiX). **Per-user install** to `%LOCALAPPDATA%\FynHelp\Connector`. No UAC prompt.
3. Sign the installer and the executable with an **EV code-signing certificate**. An unsigned installer triggers SmartScreen and will be stopped by many firms' IT.
4. Publish `FynHelp-Connector-Setup.exe` at `https://www.fynhelp.com/downloads/`, with a `.sha256` file beside it.

## 4. Installer screens

1. **Welcome.** One sentence of what it does and that it only makes outbound connections.
2. **Pairing code.** One field, auto-uppercases, ignores spaces and dashes. On Enter it calls the pair endpoint. Errors are the server's own words (already plain: "expired, ask for a new one in FynHelp").
3. **Finding Tally.** Probes `http://localhost:9000` and common alternatives. Shows "TallyPrime found, 2 companies open" or, if none answers, one instruction: *F1 (Help), Settings, Connectivity, Client/Server configuration, TallyPrime acts as Both*, with a **Check again** button.
4. **Writing into Tally.** Off by default. A single checkbox with one line explaining that only entries the team approved are written, and that this can be changed later.
5. **Done.** "Connected. Return to FynHelp." Starts the connector and opens `https://www.fynhelp.com/app/settings`.

## 5. Running

- Starts at sign-in and restarts itself if it stops (scheduled task per user, plus a 10-minute relaunch, as in the current script). Optionally a Windows service for firms that run Tally on a server.
- **Tray icon** (optional but valuable): green when Tally and the internet are both reachable, amber when one is not, with "Open FynHelp", "Check connection", "View log", "Pair again", "Quit".
- **Status panel** (from the tray): Tally connected or not, internet connected or not, connector version, last check-in, companies found. This is what their screen shows at the bottom of the app.
- Logs: UTF-8 file in `%LOCALAPPDATA%\FynHelp\Connector\connector.log`, rotated at 5 MB, never containing the token. **Export diagnostics** produces one zip with the log tail, version, Tally reachability, and the last server response, so support never asks for screenshots.

## 6. Updates

The check-in response (`tally-hello`) already carries what the server wants. Add `latest_version`, `min_version`, `download_url`, `sha256`. The connector downloads the new build to a temp file, verifies SHA-256 **and** the Authenticode signature, then swaps itself at the next restart. Below `min_version` it keeps running but shows "update required" in the tray and in FynHelp. Never update silently over an open Tally sync.

## 7. Security

- Token stored with Windows DPAPI (current-user scope), not in a plain JSON file. The existing JSON path stays for the manual route.
- Only outbound HTTPS to `www.fynhelp.com`. No listening port. No firewall rule needed.
- Uninstall removes the task, the files, and offers **Revoke this connector** (calls FynHelp so the token dies server-side).
- The installer never asks for a Tally password or a GST credential.

## 8. Acceptance tests (run on real machines)

| Case | Pass when |
|---|---|
| Windows 10 and 11, standard user | Installs without admin; connector Online within 60 seconds of entering the code |
| TallyPrime 3, 4, 5 with 1 and with 5 companies | All companies listed; Day Book arrives for a linked company |
| Tally closed at install | Installer says so in plain words; completes pairing; Tally connects when opened later |
| Wrong, expired, reused code | Each shows its own plain message; no token is saved |
| Offline during pairing | "Could not reach FynHelp", retry works without restarting the installer |
| Reboot | Connector is running after sign-in with no action |
| Kill the process | Back within 15 seconds |
| Update from 1.6.0 to a newer build | Signature checked; Tally sync not interrupted |
| Uninstall | Nothing left running; connector shows Offline then can be removed in FynHelp |
| Antivirus (Defender, Quick Heal, K7, Norton) | No detection and no SmartScreen block on the signed build |

## 9. Not in this build

No GST login, no password manager, no company creation inside Tally. Those are separate decisions with their own security review.
