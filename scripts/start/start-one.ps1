#Requires -Version 5.1

# Inicia un solo servicio de Brikmaster en una ventana de PowerShell separada.
# Guarda el PID en scripts/.pids para poder detenerlo con stop-all.ps1.

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("audiomind", "bridge", "studio", "simulator")]
    [string]$Name
)

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptsDir = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $scriptsDir '.pids'
$venvPython = Join-Path $root '.venv\Scripts\python.exe'

function Assert-Venv {
    if (-not (Test-Path $venvPython)) {
        Write-Host "ERROR: no existe el venv del repo ($venvPython)." -ForegroundColor Red
        Write-Host "Crealo siguiendo docs/runbooks/SETUP.md:" -ForegroundColor Yellow
        Write-Host "  py -3.12 -m venv .venv"
        Write-Host "  .\.venv\Scripts\pip install -r apps\bridge\requirements.txt -r simulator\requirements.txt"
        Write-Host "  .\.venv\Scripts\pip install -e apps\audiomind"
        exit 1
    }
}

# Rutas absolutas: el venv vive en la raiz del repo (docs/runbooks/SETUP.md),
# no dentro de cada app. $root se inyecta en el comando del proceso hijo.
$services = @{
    audiomind = @{
        WorkDir = "apps/audiomind"
        Command = "`$env:PYTHONPATH = (Join-Path `$pwd 'src'); & '$venvPython' -m uvicorn audiomind.main:app --reload --port 8000"
    }
    bridge = @{
        WorkDir = "apps/bridge"
        # src/main.py usa imports relativos: hay que correrlo como modulo.
        Command = "& '$venvPython' -m src.main"
    }
    studio = @{
        WorkDir = "apps/studio"
        Command = "bun run dev"
    }
    simulator = @{
        WorkDir = "."
        Command = "& '$venvPython' -m simulator.main --mode server --scenario sweep"
    }
}

$cfg = $services[$Name]
$wd = Join-Path $root $cfg.WorkDir

# --- Prerequisitos por servicio -------------------------------------------
switch ($Name) {
    { $_ -in "audiomind", "bridge", "simulator" } { Assert-Venv }
    "studio" {
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            Write-Host "ERROR: bun no esta en PATH. Instalalo (https://bun.sh) y reintenta." -ForegroundColor Red
            exit 1
        }
        if (-not (Test-Path (Join-Path $root 'node_modules'))) {
            Write-Host "ERROR: faltan dependencias. Corre 'bun install' en la raiz primero." -ForegroundColor Red
            exit 1
        }
        # @midimastering/agent apunta a dist/ — sin build el studio falla con TS2307.
        if (-not (Test-Path (Join-Path $root 'apps\agent\dist\index.js'))) {
            Write-Host "ERROR: falta apps/agent/dist. Corre 'cd apps/agent; bun run build' primero." -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "Iniciando $Name en $wd"
$process = Start-Process -FilePath "powershell" -WorkingDirectory $wd -PassThru -ArgumentList "-NoExit", "-Command", $cfg.Command
"$Name=$($process.Id)" | Out-File -FilePath $pidsFile -Append
Write-Host "$Name iniciado con PID $($process.Id)."
