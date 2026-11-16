<#
  Publica SPVI Central con Tailscale desde esta PC (Windows):
    - Panel PRIVADO (solo sus equipos en su tailnet):  https://<pc>.<tailnet>.ts.net:8443
    - Ruta PÚBLICA solo para las tiendas (/api/agente): https://<pc>.<tailnet>.ts.net
  La configuración persiste al reiniciar. Para quitarla: tailscale serve reset; tailscale funnel reset
#>
$ErrorActionPreference = 'Stop'
$ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if (-not (Test-Path $ts)) { throw 'Instale Tailscale e inicie sesión antes de continuar.' }
try { Invoke-RestMethod 'http://127.0.0.1:3000/api/panel/resumen' -TimeoutSec 5 | Out-Null } catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw 'SPVI Central no responde en 127.0.0.1:3000. Ejecute primero: docker compose -f docker-compose.local.yml up -d --build' }
}

& $ts serve --bg --https=8443 http://127.0.0.1:3000
& $ts funnel --bg --set-path=/api/agente http://127.0.0.1:3000/api/agente
Write-Host "`nSi aparece un enlace de autorización, ábralo para habilitar Funnel en este equipo y vuelva a ejecutar este script." -ForegroundColor Yellow

$nombre = ((& $ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
Write-Host "`nPanel (privado, desde su tailnet):  https://$($nombre):8443" -ForegroundColor Green
Write-Host "URL para las tiendas (CENTRAL_URL):  https://$nombre" -ForegroundColor Green
Write-Host "`nAgregue en el .env de Central:  URL_PUBLICA=https://$nombre   y reinicie: docker compose -f docker-compose.local.yml up -d"
& $ts funnel status
