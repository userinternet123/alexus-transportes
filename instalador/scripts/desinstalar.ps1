<#
  Quita servicios, tarea y regla de firewall. NO borra los datos
  (C:\ProgramData\SPVI: base de datos, configuración y respaldos).
#>
$ErrorActionPreference = 'Continue'
$App = Split-Path $PSScriptRoot -Parent
if (Get-Service 'SPVI-Analitica' -ErrorAction SilentlyContinue) {
  Stop-Service 'SPVI-Analitica' -Force
  & (Join-Path $App 'servicio\SPVI-Analitica.exe') uninstall
}
if (Get-Service 'SPVI-API' -ErrorAction SilentlyContinue) {
  Stop-Service 'SPVI-API' -Force
  & (Join-Path $App 'servicio\SPVI-API.exe') uninstall
}
if (Get-Service 'SPVI-PostgreSQL' -ErrorAction SilentlyContinue) {
  Stop-Service 'SPVI-PostgreSQL' -Force
  & (Join-Path $App 'runtime\pgsql\bin\pg_ctl.exe') unregister -N 'SPVI-PostgreSQL'
}
schtasks /Delete /TN 'SPVI\Respaldo diario' /F 2>$null | Out-Null
Remove-NetFirewallRule -DisplayName 'SPVI' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'SPVI (Tailscale)' -ErrorAction SilentlyContinue
Write-Host 'Servicios de SPVI eliminados. Los datos se conservan en C:\ProgramData\SPVI'
