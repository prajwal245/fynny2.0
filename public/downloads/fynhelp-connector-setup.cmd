@echo off
rem Double-click to set up the FynHelp Connector. It downloads the setup script and runs it.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://www.fynhelp.com/downloads/fynhelp-connector-setup.ps1' -OutFile \"$env:TEMP\fynhelp-connector-setup.ps1\" -UseBasicParsing; & \"$env:TEMP\fynhelp-connector-setup.ps1\""
