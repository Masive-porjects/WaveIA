#Requires -Version 5.1

# Inicia todos los servicios de WaveAI en ventanas de PowerShell separadas.
# UN SOLO CLICK: si falta el entorno (.venv, deps, node_modules, agent/dist),
# corre scripts/setup/setup.ps1 automaticamente antes de arrancar.
# Guarda los PIDs en scripts/.pids para poder detenerlos con stop-all.ps1.
#
# Uso:
#   .\start-all.ps1           # audiomind + studio + simulator (WS :8765, sin MIDI)
#   .\start-all.ps1 -Bridge   # audiomind + bridge real + studio (requiere MIDI;
#                             # en Windows rtmidi NO crea puertos virtuales)

param(
    [switch]$Bridge
)

$scriptsDir = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $scriptsDir '.pids'

if (Test-Path $pidsFile) {
    Remove-Item $pidsFile -Force
}

& "$PSScriptRoot\start-one.ps1" -Name "audiomind"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Bridge) {
    & "$PSScriptRoot\start-one.ps1" -Name "bridge"
} else {
    & "$PSScriptRoot\start-one.ps1" -Name "simulator"
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& "$PSScriptRoot\start-one.ps1" -Name "studio"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Servicios iniciados. PIDs guardados en $pidsFile"

& "$PSScriptRoot\..\verify\verify-all.ps1"
