@echo off
setlocal enabledelayedexpansion

REM Start static server even when PowerShell script execution is restricted.
REM Usage:
REM   start-dev-server.cmd
REM   start-dev-server.cmd 8000

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

cd /d "%~dp0"
echo Serving "%CD%" at http://localhost:%PORT%/
echo Press Ctrl+C to stop
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-server.ps1" -Port %PORT%

endlocal
