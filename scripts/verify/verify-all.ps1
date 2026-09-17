#Requires -Version 5.1

# Verifica que los servicios de WaveAI esten realmente levantados.
# Usa health checks HTTP y conexion TCP al WebSocket del Live Engine.
# Si existe scripts/.pids verifica solo los servicios listados ahi;
# si no, verifica los tres por defecto (audiomind, bridge, studio).

$scriptsDir = Split-Path -Parent $PSScriptRoot
$pidsFile = Join-Path $scriptsDir '.pids'

function Test-HealthEndpoint {
    param([string]$Url, [int]$TimeoutSeconds = 2)
    try {
        $resp = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Test-TcpPort {
    param([string]$TargetHost, [int]$Port, [int]$TimeoutMs = 2000)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $connect = $client.ConnectAsync($TargetHost, $Port)
        if ($connect.Wait($TimeoutMs)) {
            return $client.Connected
        }
        return $false
    } catch {
        return $false
    }
}

function Wait-ForService {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [int]$MaxAttempts = 15,
        [int]$DelaySeconds = 1
    )
    Write-Host "Verificando $Name... " -NoNewline
    $ok = $false
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (& $Test) {
            $ok = $true
            break
        }
        Start-Sleep -Seconds $DelaySeconds
    }
    if ($ok) {
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "FALLA" -ForegroundColor Red
    }
    return $ok
}

# bridge y simulator escuchan ambos en :8765 (el simulator es el mock del bridge).
$checks = @{
    # 127.0.0.1 explicito: 'localhost' resuelve ::1 (IPv6) primero y los servers
    # bindean solo IPv4 — Invoke-WebRequest hace timeout aunque el servicio este OK.
    # uvicorn tarda en el primer boot (imports de librosa/numba pesan ~1-2 min).
    audiomind = @{ Test = { Test-HealthEndpoint "http://127.0.0.1:8000/health" }; MaxAttempts = 90 }
    bridge    = @{ Test = { Test-TcpPort "127.0.0.1" 8765 };                    MaxAttempts = 15 }
    simulator = @{ Test = { Test-TcpPort "127.0.0.1" 8765 };                    MaxAttempts = 15 }
    # El primer compile de next dev puede tardar bastante mas de 15 s.
    studio    = @{ Test = { Test-HealthEndpoint "http://127.0.0.1:3000" };      MaxAttempts = 45 }
}

$targets = @()
if (Test-Path $pidsFile) {
    $targets = Get-Content $pidsFile | ForEach-Object { ($_ -split '=', 2)[0].Trim() } |
        Where-Object { $checks.ContainsKey($_) } | Select-Object -Unique
}
if ($targets.Count -eq 0) {
    $targets = @("audiomind", "bridge", "studio")
}

$results = @()
foreach ($name in $targets) {
    $results += Wait-ForService $name $checks[$name].Test $checks[$name].MaxAttempts 1
}

if ($results -contains $false) {
    Write-Host "`nAlgunos servicios no responden. Revisa las ventanas de PowerShell." -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nTodos los servicios estan activos." -ForegroundColor Green
    exit 0
}
