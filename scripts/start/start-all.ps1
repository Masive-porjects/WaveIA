#Requires -Version 5.1

# Inicia todos los servicios de WaveAI en ventanas de PowerShell separadas.
# Guarda los PIDs en scripts/.pids para poder detenerlos con stop-all.ps1.
#
# Uso:
#   .\start-all.ps1              # audiomind + bridge + studio
#   .\start-all.ps1 -Simulator   # audiomind + studio + simulator (WS :8765 sin MIDI)

param(
    [switch]$Simulator
)

$scriptsDir = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $scriptsDir '.pids'

if (Test-Path $pidsFile) {
    Remove-Item $pidsFile -Force
}

& "$PSScriptRoot\start-one.ps1" -Name "audiomind"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Simulator) {
    & "$PSScriptRoot\start-one.ps1" -Name "simulator"
} else {
    & "$PSScriptRoot\start-one.ps1" -Name "bridge"
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& "$PSScriptRoot\start-one.ps1" -Name "studio"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Servicios iniciados. PIDs guardados en $pidsFile"

& "$PSScriptRoot\..\verify\verify-all.ps1"
