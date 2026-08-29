@echo off
cd /d "%~dp0..\.."
powershell -ExecutionPolicy Bypass -File "scripts\start\start-one.ps1" -Name "bridge"
pause
