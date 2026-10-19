@echo off
rem FynHelp Tally agent installer. Double-click, then type the pairing code.
title FynHelp Tally agent
echo.
echo   FynHelp Tally agent
echo   Reads Tally on this PC and sends ledger balances to your CA. Read-only.
echo.
set /p CODE=  Type the pairing code your CA gave you (like FYN-7K3Q-9XPA): 
if "%CODE%"=="" (echo   No code entered. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Code "%CODE%"
echo.
pause
