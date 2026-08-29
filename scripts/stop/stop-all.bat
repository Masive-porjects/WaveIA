@echo off
cd /d "%~dp0..\.."
powershell -ExecutionPolicy Bypass -File "scripts\stop\stop-all.ps1"
pause
