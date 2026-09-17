#Requires -Version 5.1

# Inicia un solo servicio de WaveAI en una ventana de PowerShell separada.
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
$setupScript = Join-Path $scriptsDir 'setup\setup.ps1'

$script:setupRan = $false
function Invoke-Setup {
    # Corre el setup una sola vez por invocacion (idempotente del otro lado).
    if ($script:setupRan) { return }
    $script:setupRan = $true
    Write-Host "Faltan prerequisitos - corriendo setup automatico..." -ForegroundColor Yellow
    & $setupScript
}

function Assert-Venv {
    if (-not (Test-Path $venvPython)) {
        Invoke-Setup
        if (-not (Test-Path $venvPython)) {
            Write-Host "ERROR: el setup no genero .venv. Revisa scripts\setup\setup.ps1" -ForegroundColor Red
            exit 1
        }
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
        # --loop: sin esto el escenario termina en ~10s y el server se apaga.
        Command = "& '$venvPython' -m simulator.main --mode server --scenario sweep --loop"
    }
}

$cfg = $services[$Name]
$wd = Join-Path $root $cfg.WorkDir

# --- Prerequisitos por servicio -------------------------------------------
switch ($Name) {
    { $_ -in "audiomind", "bridge", "simulator" } {
        Assert-Venv
        # venv sin deps = ventana que muere al instante: verifica imports clave.
        $importCheck = switch ($Name) {
            "audiomind" { "import uvicorn, fastapi, audiomind" }
            "bridge"    { "import websockets, rtmidi, mido" }
            "simulator" { "import websockets, numpy" }
        }
        & $venvPython -c $importCheck 2>$null
        if ($LASTEXITCODE -ne 0) {
            Invoke-Setup
            & $venvPython -c $importCheck 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: deps de $Name no importables tras el setup." -ForegroundColor Red
                exit 1
            }
        }
    }
    "studio" {
        $needsSetup = -not (Get-Command bun -ErrorAction SilentlyContinue) `
            -or -not (Test-Path (Join-Path $root 'node_modules')) `
            -or -not (Test-Path (Join-Path $root 'apps\agent\dist\index.js'))
        if ($needsSetup) {
            Invoke-Setup
            # bun recien instalado vive en el PATH del perfil, no de esta sesion.
            $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
        }
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            Write-Host "ERROR: bun no esta en PATH. Instalalo (https://bun.sh) y reintenta." -ForegroundColor Red
            exit 1
        }
        if (-not (Test-Path (Join-Path $root 'node_modules'))) {
            Write-Host "ERROR: falta node_modules. Corre 'bun install' en la raiz." -ForegroundColor Red
            exit 1
        }
        # @midimastering/agent apunta a dist/ - sin build el studio falla con TS2307.
        if (-not (Test-Path (Join-Path $root 'apps\agent\dist\index.js'))) {
            Write-Host "ERROR: falta apps/agent/dist. Corre 'cd apps/agent; bun run build'." -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "Iniciando $Name en $wd"
$process = Start-Process -FilePath "powershell" -WorkingDirectory $wd -PassThru -ArgumentList "-NoExit", "-Command", $cfg.Command
"$Name=$($process.Id)" | Out-File -FilePath $pidsFile -Append
Write-Host "$Name iniciado con PID $($process.Id)."
