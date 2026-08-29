#Requires -Version 5.1

# Detiene todos los servicios iniciados por start-all.ps1.
# Usa taskkill /T /F para matar el proceso padre y todos sus descendientes.

$scriptsDir = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $scriptsDir '.pids'

if (-not (Test-Path $pidsFile)) {
    Write-Host "No hay archivo .pids. Ejecuta algun start\start-*.ps1 o .bat primero."
    exit 0
}

Get-Content $pidsFile | ForEach-Object {
    $parts = $_ -split '=', 2
    $name = $parts[0]
    $id = $parts[1]
    Write-Host "Deteniendo $name (PID $id)..."
    taskkill /T /F /PID $id 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK"
    } else {
        Write-Host "  No se pudo detener (puede que ya estuviera cerrado)"
    }
}

Remove-Item $pidsFile -Force
Write-Host "Procesos detenidos."
