# Installs the FynHelp Tally agent for the current Windows user: copies it to
# %LOCALAPPDATA%\FynHelpTally, pairs it, and schedules a read every 4 hours.
# Run in PowerShell:  .\install.ps1 -Code FYN-XXXX-XXXX
param([string]$Code = "")
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 18 or newer is needed. Install it from https://nodejs.org (LTS), then run this again." -ForegroundColor Yellow
  exit 1
}
$dest = Join-Path $env:LOCALAPPDATA "FynHelpTally"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot "agent.mjs"), (Join-Path $PSScriptRoot "lib.mjs") -Destination $dest -Force
$agent = Join-Path $dest "agent.mjs"
$paired = Test-Path (Join-Path $env:APPDATA "FynHelpTally\config.json")
if ($Code) {
  node $agent pair $Code
  node $agent sync --backfill
} elseif ($paired) {
  Write-Host "Already paired: updating the agent files only." -ForegroundColor Cyan
} else {
  Write-Host "A pairing code is needed the first time. Run again with -Code FYN-XXXX-XXXX." -ForegroundColor Yellow
  exit 1
}
$action = New-ScheduledTaskAction -Execute "node" -Argument "`"$agent`" sync" -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName "FynHelp Tally Sync" -Action $action -Trigger $trigger -Force `
  -Description "Reads Tally Prime on this PC and sends ledger balances to FynHelp. Read-only." | Out-Null
Write-Host "Done. FynHelp will read Tally every 4 hours while this PC is on and Tally is open." -ForegroundColor Green
