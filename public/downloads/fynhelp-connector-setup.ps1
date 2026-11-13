# FynHelp Connector setup for Windows. Run it by double-clicking fynhelp-connector-setup.cmd.
# What it does: installs Node.js if it is missing, saves the connector in %LOCALAPPDATA%\FynHelp, asks for your token,
# checks the connection to TallyPrime and FynHelp, and makes the connector start by itself whenever you sign in.
# It changes nothing in TallyPrime. Writing approved entries into Tally stays OFF unless you say yes below.
$ErrorActionPreference = "Stop"
$server = "https://www.fynhelp.com"
$dir = Join-Path $env:LOCALAPPDATA "FynHelp"
$js = Join-Path $dir "fynhelp-tally-connector.mjs"
$cfg = Join-Path $dir "fynhelp-connector.json"
$log = Join-Path $dir "connector.log"

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }

try {
  New-Item -ItemType Directory -Force $dir | Out-Null

  Step 1 "Checking Node.js"
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Host "Node.js is not installed. Installing it now (one time)..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      throw "Please install Node.js from https://nodejs.org (the LTS version), then run this setup again."
    }
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw "Node.js was installed but could not be found. Close this window, open the setup again, and it will carry on." }
  }
  $nodePath = $node.Source
  Write-Host "Found Node.js at $nodePath"

  Step 2 "Downloading the FynHelp Connector"
  Invoke-WebRequest "$server/downloads/fynhelp-tally-connector.mjs" -OutFile $js -UseBasicParsing

  Step 3 "Your connector token"
  Write-Host "In FynHelp, open Settings, TallyPrime, Add connector, and copy the token it shows."
  $token = (Read-Host "Paste the token here (it starts with fyn_tc_)").Trim()
  if ($token -notmatch '^fyn_tc_[A-Za-z0-9_-]{40,60}$') { throw "That does not look like a FynHelp token. Copy it again from FynHelp and run this setup again." }

  $write = (Read-Host "Let FynHelp write entries your team has approved into Tally? You can change this later. (y/N)").Trim().ToLower()
  $allowWrite = ($write -eq "y" -or $write -eq "yes")
  $config = [ordered]@{ token = $token; allowWrite = $allowWrite }
  # Windows PowerShell 5 adds a byte-order mark with -Encoding UTF8; write the file without one.
  [System.IO.File]::WriteAllText($cfg, ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

  Step 4 "Checking TallyPrime and FynHelp"
  Write-Host "In TallyPrime: F1 (Help), Settings, Connectivity, Client/Server: TallyPrime acts as Both, port 9000. Keep your company open."
  & $nodePath $js --check --config $cfg
  if ($LASTEXITCODE -ne 0) { throw "FynHelp did not accept the token. Copy it again from FynHelp and run this setup again." }

  # An older connector wrote its log as UTF-16, which Notepad shows as garbled symbols. Keep it aside so the new log starts clean.
  if (Test-Path $log) {
    $head = [System.IO.File]::ReadAllBytes($log) | Select-Object -First 2
    if ($head.Count -ge 2 -and $head[0] -eq 255 -and $head[1] -eq 254) {
      Move-Item -Force $log (Join-Path $dir "connector.old-utf16.log")
    }
  }

  Step 5 "Making it start by itself"
  # The connector writes its own UTF-8 log (--log). It also restarts itself if it ever exits, and the task is started again
  # every 10 minutes if the whole process has gone, so a stopped connector never stays stopped.
  $run = "while (`$true) { & '$nodePath' '$js' --config '$cfg' --log '$log'; Start-Sleep -Seconds 15 }"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$run`"" -WorkingDirectory $dir
  $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)
  Register-ScheduledTask -TaskName "FynHelp Connector" -Action $action -Trigger @($atLogon, $repeat) -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName "FynHelp Connector"

  Write-Host ""
  Write-Host "Done. The connector is running and will start by itself when you sign in to Windows." -ForegroundColor Green
  Write-Host "Next, in FynHelp: Settings, TallyPrime, link each Tally company to a client. Its log is at $log"
} catch {
  Write-Host ""
  Write-Host "Setup stopped: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""
Read-Host "Press Enter to close"
