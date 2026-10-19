@echo off
rem FynHelp Tally agent installer. Double-click it. First time: type the pairing code.
rem Updating: run it again; if this PC is already paired it only refreshes the files.
title FynHelp Tally agent
echo.
echo   FynHelp Tally agent
echo   Reads Tally on this PC and sends ledger balances to your CA. Read-only.
echo.
set CODE=
if exist "%APPDATA%\FynHelpTally\config.json" (
  echo   This PC is already connected. Updating the agent...
) else (
  set /p CODE=  Type the pairing code your CA gave you ^(like FYN-7K3Q-9XPA^): 
  if "%CODE%"=="" (echo   No code entered. & pause & exit /b 1)
)
if "%CODE%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Code "%CODE%"
)
echo.
pause
