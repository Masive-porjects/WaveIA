#Requires -Version 5.1

# Inicia todos los servicios de midiMastering en ventanas de PowerShell separadas.
# Guarda los PIDs en scripts/.pids para poder detenerlos con stop-all.ps1.

$scriptsDir = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $scriptsDir '.pids'

if (Test-Path $pidsFile) {
    Remove-Item $pidsFile -Force
}

& "$PSScriptRoot\start-one.ps1" -Name "audiomind"
& "$PSScriptRoot\start-one.ps1" -Name "studio"

Write-Host "Servicios iniciados. PIDs guardados en $pidsFile"

& "$PSScriptRoot\..\verify\verify-all.ps1"
