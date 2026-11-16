<#
  Respaldo diario de la base de SPVI Central (corre en Docker en esta PC).
  Programar: schtasks /Create /TN "SPVI Central\Respaldo" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"<ruta>\respaldo-central.ps1\"" /SC DAILY /ST 23:00 /F
  Guarde también una copia fuera de esta PC (Google Drive, OneDrive, disco externo).
#>
param([string]$Destino = "$env:USERPROFILE\Documents\SPVI-Central-respaldos", [int]$Conservar = 30)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$archivo = Join-Path $Destino ("central-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
# El respaldo se genera DENTRO del contenedor y se copia: pasar binarios por la tubería de PowerShell los corrompe
docker compose -f docker-compose.local.yml exec -T db pg_dump -U central -F c -f /tmp/central.dump central
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló: revise que Docker y SPVI Central estén corriendo.' }
docker compose -f docker-compose.local.yml cp db:/tmp/central.dump $archivo
docker compose -f docker-compose.local.yml exec -T db rm -f /tmp/central.dump

# Cifrado con la llave pública de ALEXUS (si existe respaldo-publica.pem junto a este script)
$publica = Join-Path $PSScriptRoot 'respaldo-publica.pem'
if (Test-Path $publica) {
  $nombre = Split-Path $archivo -Leaf
  docker run --rm -v "${Destino}:/r" -v "${PSScriptRoot}:/c:ro" node:22-alpine node /c/respaldo-cripto.js cifrar --publica /c/respaldo-publica.pem --entrada "/r/$nombre" --salida "/r/$nombre.spvi"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$archivo.spvi")) { throw 'No se pudo cifrar el respaldo de Central' }
  Remove-Item $archivo -Force   # el respaldo sin cifrar no queda en disco
  $archivo = "$archivo.spvi"
} else {
  Write-Warning 'Respaldo de Central SIN CIFRAR: cree las llaves (README, sección Seguridad).'
}
if (-not (Test-Path $archivo) -or (Get-Item $archivo).Length -lt 1000) { throw 'El respaldo quedó vacío: revise que Docker esté corriendo.' }
Get-ChildItem $Destino -Filter 'central-*.dump*' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conservar | Remove-Item -Force
Write-Host "Respaldo: $archivo"
