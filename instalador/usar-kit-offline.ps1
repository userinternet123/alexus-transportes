<#
  Instala y compila el API o el portal de SPVI SIN INTERNET usando el kit (preparar-kit-offline.ps1).
  Pensado para una PC dentro de una red cerrada (p. ej. la laptop del banco), donde npm o Prisma fallan al descargar.

  Uso:
    powershell -ExecutionPolicy Bypass -File usar-kit-offline.ps1 -Kit D:\SPVI-kit-offline -Proyecto C:\spvi\api -Compilar
    powershell -ExecutionPolicy Bypass -File usar-kit-offline.ps1 -Kit D:\SPVI-kit-offline -Proyecto C:\spvi\portal -Compilar

  Para el API, además deja configurado Prisma para usar los motores del kit (también para "prisma migrate").
#>
param(
  [Parameter(Mandatory = $true)][string]$Kit,
  [Parameter(Mandatory = $true)][string]$Proyecto,
  [switch]$Compilar
)
$ErrorActionPreference = 'Stop'
$Kit = (Resolve-Path $Kit).Path
$Proyecto = (Resolve-Path $Proyecto).Path
$NpmCache = Join-Path $Kit 'npm-cache'
$Motores = Join-Path $Kit 'prisma-motores'
function Correr([string]$Cmd) { Push-Location $Proyecto; try { cmd /c $Cmd; if ($LASTEXITCODE -ne 0) { throw "Falló: $Cmd" } } finally { Pop-Location } }

if (-not (Test-Path (Join-Path $Proyecto 'package-lock.json'))) { throw "En $Proyecto no hay package-lock.json: no se puede instalar sin conexión de forma exacta" }
if (-not (Test-Path $NpmCache)) { throw "El kit no trae la caché de npm ($NpmCache)" }
$env:CHECKPOINT_DISABLE = '1'

Write-Host '1) Dependencias desde la caché del kit (sin internet)' -ForegroundColor Cyan
Correr "npm ci --offline --ignore-scripts --no-audit --no-fund --cache `"$NpmCache`""

$EsApi = Test-Path (Join-Path $Proyecto 'prisma\schema.prisma')
if ($EsApi) {
  Write-Host '2) Prisma con los motores del kit' -ForegroundColor Cyan
  $Eng = Join-Path $Proyecto 'node_modules\@prisma\engines'
  New-Item -ItemType Directory -Force -Path $Eng | Out-Null
  Copy-Item (Join-Path $Motores 'query_engine-windows.dll.node'), (Join-Path $Motores 'schema-engine-windows.exe') $Eng -Force
  $Variables = @{
    PRISMA_QUERY_ENGINE_LIBRARY = (Join-Path $Eng 'query_engine-windows.dll.node')
    PRISMA_SCHEMA_ENGINE_BINARY = (Join-Path $Eng 'schema-engine-windows.exe')
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = '1'
    CHECKPOINT_DISABLE = '1'
  }
  # Para esta sesión y, para el usuario, de forma permanente (así "npx prisma migrate dev" tampoco intenta descargar)
  foreach ($k in $Variables.Keys) { Set-Item "Env:$k" $Variables[$k]; [Environment]::SetEnvironmentVariable($k, $Variables[$k], 'User') }
  Correr 'npx --no-install prisma generate'
  $Cliente = Join-Path $Proyecto 'node_modules\.prisma\client'
  if (Test-Path $Cliente) { Copy-Item $Variables.PRISMA_QUERY_ENGINE_LIBRARY $Cliente -Force }
  $Ver = Get-Content (Join-Path $Motores 'VERSION.txt') -ErrorAction SilentlyContinue
  $Instalado = (Get-Content (Join-Path $Proyecto 'node_modules\prisma\package.json') -Raw | ConvertFrom-Json).version
  if ($Ver -and ($Ver -join ' ') -notmatch [regex]::Escape("prisma $Instalado")) { Write-Warning "El kit es de otra versión de Prisma ($($Ver[0])) que la instalada ($Instalado). Prepare el kit con este package-lock." }
}
if ($Compilar) {
  Write-Host "$(if ($EsApi) { '3' } else { '2' })) Compilación" -ForegroundColor Cyan
  Correr 'npm run build'
}
Write-Host "`nListo, sin usar internet. $(if ($EsApi) { 'Prisma queda configurado para los motores del kit (variables de usuario PRISMA_*).' })" -ForegroundColor Green
