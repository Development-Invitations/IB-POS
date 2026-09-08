# Запускать один раз, из PowerShell с правами администратора (ПКМ -> "Запуск от имени администратора").
# Ставит бэкенд IB-POS как службу Windows: стартует сама при включении ПК, работает в фоне,
# не зависит от открытого терминала или активной сессии Claude Code.

$ErrorActionPreference = "Stop"

$serviceName = "IBPOSServer"
$nssm = "D:\IB-POS\tools\nssm.exe"
$node = (Get-Command node).Source
$entry = "D:\IB-POS\apps\server\dist\src\main.js"
$workDir = "D:\IB-POS\apps\server"
$logFile = "D:\IB-POS\apps\server\service.log"

if (-not (Test-Path $entry)) {
    Write-Host "Собираю сервер (dist отсутствует)..."
    Push-Location $workDir
    & pnpm run build
    Pop-Location
}

& $nssm install $serviceName $node $entry
& $nssm set $serviceName AppDirectory $workDir
& $nssm set $serviceName Start SERVICE_AUTO_START
& $nssm set $serviceName AppStdout $logFile
& $nssm set $serviceName AppStderr $logFile
& $nssm set $serviceName AppRotateFiles 1
& $nssm set $serviceName AppRotateBytes 1048576

& $nssm start $serviceName

Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "OK: сервер отвечает, код $($r.StatusCode)"
} catch {
    Write-Host "Служба запущена, но /health пока не отвечает — проверьте $logFile"
}
