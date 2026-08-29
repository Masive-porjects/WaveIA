@echo off
cd /d "%~dp0..\.."
powershell -ExecutionPolicy Bypass -File "scripts\verify\verify-all.ps1"
pause
