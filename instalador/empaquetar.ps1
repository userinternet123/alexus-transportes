<#
  Genera el instalador de una versión de SPVI:  instalador\salida\SPVI-Setup-<version>.exe

  Uso (en la raíz del portal, en una PC Windows de compilación):
    npm run release -- 2.1.0
  o directamente:
    powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1 -Version 2.1.0

  Requisitos de la PC de compilación: Windows 10/11 x64, Node.js 22, Git e
  Inno Setup 6. Los componentes de terceros (Node portátil, PostgreSQL, WinSW,
  Visual C++ y Python embebido con las librerías del motor analítico) se descargan
  una sola vez a instalador\cache. El motor analítico va en ..\analitica (apps/analitica).

  SIN INTERNET (p. ej. dentro de la red de un banco): prepare el kit en una PC con internet
  (instalador\preparar-kit-offline.ps1), cópielo y compile con:
    powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1 -Version 2.1.0 -Kit D:\SPVI-kit-offline
  En ese modo NADA se descarga: npm, Prisma, Python y los instaladores salen del kit.
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [string]$NodeVersion = '22.12.0',
  [string]$PgVersion = '16.6-1',
  [string]$WinSWVersion = '2.12.0',
  [string]$PythonVersion = '3.12.8',
  # Solo para pruebas internas: genera un instalador que NO exige licencia (todo desbloqueado). Nunca para una tienda.
  [switch]$ModoAbierto,
  # Carpeta del kit sin conexión (preparar-kit-offline.ps1). Con ella no se usa internet en absoluto.
  [string]$Kit
)
# Tailscale (acceso remoto): siempre la versión estable vigente al compilar
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Inst    = $PSScriptRoot
$Raiz    = Split-Path $Inst -Parent          # portal (frontend)
$Api     = Join-Path $Raiz 'api'
$Staging = Join-Path $Inst 'staging'
$App     = Join-Path $Staging 'app'
$Cache   = Join-Path $Inst 'cache'
$Salida  = Join-Path $Inst 'salida'
$env:CHECKPOINT_DISABLE = '1'             # Prisma no consulta actualizaciones (en una red cerrada solo causa esperas)

$Offline = [bool]$Kit
if ($Offline) {
  $Kit = (Resolve-Path $Kit).Path
  $Cache    = Join-Path $Kit 'cache'
  $NpmCache = Join-Path $Kit 'npm-cache'
  $Motores  = Join-Path $Kit 'prisma-motores'
  $Ruedas   = Join-Path $Kit 'python-ruedas'
  foreach ($x in $Cache, $NpmCache, $Motores, $Ruedas) { if (-not (Test-Path $x)) { throw "El kit está incompleto: falta $x. Prepárelo con preparar-kit-offline.ps1" } }
  Write-Host "MODO SIN CONEXIÓN: todo sale del kit $Kit (no se usará internet)" -ForegroundColor Yellow
}

function Paso($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Correr([string]$Dir, [string]$Cmd) {
  Push-Location $Dir
  try { cmd /c $Cmd; if ($LASTEXITCODE -ne 0) { throw "Falló: $Cmd (en $Dir)" } } finally { Pop-Location }
}
function Descargar([string]$Url, [string]$Destino) {
  if (Test-Path $Destino) { return }
  if ($Offline) { throw "Sin conexión: el kit no trae $(Split-Path $Destino -Leaf). Prepárelo de nuevo con preparar-kit-offline.ps1 usando las mismas versiones." }
  Write-Host "Descargando $Url"; Invoke-WebRequest $Url -OutFile $Destino -UseBasicParsing
}
# npm: con internet como siempre; sin conexión, todo desde la caché del kit (y sin scripts que intenten descargar)
function InstalarNpm([string]$Dir, [string]$Extra = '') {
  if ($Offline) { Correr $Dir "npm ci $Extra --offline --ignore-scripts --no-audit --no-fund --cache `"$NpmCache`"" }
  else { Correr $Dir "npm ci $Extra" }
}
# Prisma sin conexión: los motores de Windows salen del kit y se genera el cliente (no descarga nada)
function UsarMotoresPrisma([string]$Dir) {
  $Eng = Join-Path $Dir 'node_modules\@prisma\engines'
  New-Item -ItemType Directory -Force -Path $Eng | Out-Null
  Copy-Item (Join-Path $Motores 'query_engine-windows.dll.node'), (Join-Path $Motores 'schema-engine-windows.exe') $Eng -Force
  $env:PRISMA_QUERY_ENGINE_LIBRARY = Join-Path $Eng 'query_engine-windows.dll.node'
  $env:PRISMA_SCHEMA_ENGINE_BINARY = Join-Path $Eng 'schema-engine-windows.exe'
  $env:PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = '1'
  Correr $Dir 'npx --no-install prisma generate'
  $Cliente = Join-Path $Dir 'node_modules\.prisma\client'
  if (Test-Path $Cliente) { Copy-Item $env:PRISMA_QUERY_ENGINE_LIBRARY $Cliente -Force }
}
# Candado: lo que viaja a la tienda DEBE traer los motores de Prisma; si no, la tienda intentaría descargarlos
function VerificarMotores([string]$Dir) {
  $faltan = @('node_modules\.prisma\client\query_engine-windows.dll.node', 'node_modules\@prisma\engines\schema-engine-windows.exe') | Where-Object { -not (Test-Path (Join-Path $Dir $_)) }
  if ($faltan) { throw "Faltan motores de Prisma en el paquete ($($faltan -join ', ')): la tienda necesitaría internet. Revise la red o compile con -Kit." }
  Write-Host 'Motores de Prisma para Windows incluidos: la tienda no descargará nada.' -ForegroundColor Green
}

Paso "SPVI $Version"

# ── Candados antes de compilar ──────────────────────────────────────────────
# 1. Una versión para tiendas DEBE llevar la llave pública de licencias; sin ella el sistema instalado queda en
#    MODO ABIERTO (todos los módulos, sin licencia).
$ClavePub = Get-Content (Join-Path $Api 'src\modules\licencia\clave-publica.ts') -Raw
if ($ClavePub -match "CLAVE_PUBLICA_LICENCIAS\s*=\s*''") {
  if (-not $ModoAbierto) {
    throw "Esta versión NO tiene llave pública de licencias: el sistema instalado quedaría en MODO ABIERTO (todo desbloqueado y sin licencia). Copie la llave desde SPVI Central (Licencias › Llave pública) a api\src\modules\licencia\clave-publica.ts, o use -ModoAbierto solo para pruebas internas."
  }
  Write-Warning 'MODO ABIERTO: este instalador NO exige licencia. NO lo entregue a ninguna tienda.'
} elseif ($ModoAbierto) {
  throw 'Pidió -ModoAbierto, pero esta versión ya tiene llave pública: exigirá licencia. Quite -ModoAbierto.'
}
# 2. Cada migración debe traer su migration.sql: en una instalación nueva se aplican todas desde cero.
$SinSql = @(Get-ChildItem (Join-Path $Api 'prisma\migrations') -Directory | Where-Object { -not (Test-Path (Join-Path $_.FullName 'migration.sql')) })
if ($SinSql.Count -gt 0) { throw "Migraciones incompletas (sin migration.sql): $($SinSql.Name -join ', '). Una instalación nueva fallaría." }
# 3. Ninguna migración debe borrar datos sin que se haya revisado a propósito.
$ConDrop = @(Get-ChildItem (Join-Path $Api 'prisma\migrations') -Recurse -Filter migration.sql | Where-Object { (Get-Content $_.FullName -Raw) -match '(?im)^\s*DROP\s+(TABLE|COLUMN)|ALTER\s+TABLE[^;]*DROP\s+COLUMN' })
if ($ConDrop.Count -gt 0) { Write-Warning "Estas migraciones BORRAN tablas o columnas; confirme que es intencional: $($ConDrop.Directory.Name -join ', ')" }
Write-Host 'Candados: llave de licencias y migraciones en orden.' -ForegroundColor Green
foreach ($c in 'node', 'npm') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "Falta $c en esta PC" } }
$Iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Iscc) { throw 'Instale Inno Setup 6: https://jrsoftware.org/isdl.php' }
if (-not (Test-Path (Join-Path $Api 'package.json'))) { throw "No se encontró el API en $Api" }

Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $App, $Cache, $Salida | Out-Null

Paso '1/6 Portal web (Vite)'
$env:VITE_API_URL = '/api/v1'               # mismo servidor que el API: rutas relativas
InstalarNpm $Raiz
Correr $Raiz 'npm run build'
Copy-Item (Join-Path $Raiz 'dist') (Join-Path $App 'web') -Recurse
Remove-Item Env:VITE_API_URL

Paso '2/6 API (NestJS + Prisma)'
InstalarNpm $Api
if ($Offline) { UsarMotoresPrisma $Api }
Correr $Api 'npm run build:release'
$ApiDest = Join-Path $App 'api'
New-Item -ItemType Directory -Force -Path $ApiDest | Out-Null
foreach ($x in 'dist', 'dist-seed', 'dist-etl', 'prisma', 'package.json', 'package-lock.json') { Copy-Item (Join-Path $Api $x) $ApiDest -Recurse }
# Exportador del SPVI anterior (SQL Server -> CSV) para la migración opcional
New-Item -ItemType Directory -Force -Path (Join-Path $ApiDest 'scripts\etl') | Out-Null
Copy-Item (Join-Path $Api 'scripts\etl\exportar-legado.ps1') (Join-Path $ApiDest 'scripts\etl')
# Solo dependencias de producción (incluye el CLI de Prisma para "migrate deploy" y los motores de Windows)
InstalarNpm $ApiDest '--omit=dev'
if ($Offline) { UsarMotoresPrisma $ApiDest }
VerificarMotores $ApiDest

Paso '3/6 Node.js portátil'
$NodeZip = Join-Path $Cache "node-v$NodeVersion-win-x64.zip"
Descargar "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" $NodeZip
Expand-Archive $NodeZip -DestinationPath $Staging -Force
Move-Item (Join-Path $Staging "node-v$NodeVersion-win-x64") (Join-Path $App 'runtime\node') -Force

Paso '4/6 PostgreSQL (binarios)'
$PgZip = Join-Path $Cache "postgresql-$PgVersion-windows-x64-binaries.zip"
Descargar "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip" $PgZip
$PgTmp = Join-Path $Staging 'pgtmp'
Expand-Archive $PgZip -DestinationPath $PgTmp -Force
$PgDest = Join-Path $App 'runtime\pgsql'
New-Item -ItemType Directory -Force -Path $PgDest | Out-Null
foreach ($x in 'bin', 'lib', 'share') { Copy-Item (Join-Path $PgTmp "pgsql\$x") $PgDest -Recurse }   # sin pgAdmin ni documentación
Remove-Item $PgTmp -Recurse -Force

Paso '5/6 Servicio de Windows, Visual C++ y Tailscale'
$Serv = Join-Path $App 'servicio'
New-Item -ItemType Directory -Force -Path $Serv | Out-Null
$WinSW = Join-Path $Cache "WinSW-x64-$WinSWVersion.exe"
Descargar "https://github.com/winsw/winsw/releases/download/v$WinSWVersion/WinSW-x64.exe" $WinSW
Copy-Item $WinSW (Join-Path $Serv 'SPVI-API.exe')
Copy-Item (Join-Path $Inst 'servicio\SPVI-API.xml') $Serv

Paso "Motor analítico (Python $PythonVersion embebido)"
# Python oficial "embebido" (portátil, sin instalador) + las librerías del motor DENTRO del paquete:
# en la tienda no se instala ni descarga nada. pip solo se usa aquí, en una copia aparte que no viaja.
$Analitica = Join-Path $Raiz 'analitica'
if (-not (Test-Path (Join-Path $Analitica 'spvi_analitica\app.py'))) { throw "No encuentro el motor analítico en $Analitica. Copie ahí la carpeta apps\analitica del proyecto." }
$PyZip = Join-Path $Cache "python-$PythonVersion-embed-amd64.zip"
Descargar "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip" $PyZip
$PyDest = Join-Path $App 'runtime\python'
Expand-Archive $PyZip $PyDest -Force
$Pth = Get-ChildItem $PyDest -Filter 'python*._pth' | Select-Object -First 1
# Rutas que ve el Python del instalador: su biblioteca, el motor y las librerías del motor (relativas a python.exe)
@("$($Pth.BaseName).zip", '.', '..\..\analitica', '..\..\analitica\vendor') | Set-Content $Pth.FullName -Encoding ascii
$PyBuild = Join-Path $Cache "python-compilacion-$PythonVersion"
# Sin conexión, pip instala solo desde las ruedas (wheels) del kit
$PipSinRed = if ($Offline) { @('--no-index', '--find-links', $Ruedas) } else { @() }
if (-not (Test-Path (Join-Path $PyBuild 'Scripts\pip.exe'))) {
  Expand-Archive $PyZip $PyBuild -Force
  $PthB = Get-ChildItem $PyBuild -Filter 'python*._pth' | Select-Object -First 1
  @("$($PthB.BaseName).zip", '.', 'Lib\site-packages', 'import site') | Set-Content $PthB.FullName -Encoding ascii
  $GetPip = Join-Path $Cache 'get-pip.py'
  Descargar 'https://bootstrap.pypa.io/get-pip.py' $GetPip
  & (Join-Path $PyBuild 'python.exe') $GetPip --no-warn-script-location @PipSinRed
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar pip para empaquetar el motor analítico' }
}
$AnaDest = Join-Path $App 'analitica'
New-Item -ItemType Directory -Force $AnaDest | Out-Null
Copy-Item (Join-Path $Analitica 'spvi_analitica') $AnaDest -Recurse -Force
Get-ChildItem $AnaDest -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
& (Join-Path $PyBuild 'python.exe') -m pip install --no-warn-script-location --disable-pip-version-check --only-binary=:all: @PipSinRed --target (Join-Path $AnaDest 'vendor') -r (Join-Path $Analitica 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron empaquetar las librerías del motor analítico' }
Copy-Item $WinSW (Join-Path $Serv 'SPVI-Analitica.exe')
Copy-Item (Join-Path $Inst 'servicio\SPVI-Analitica.xml') $Serv
# Prueba con el MISMO Python que viaja en el instalador: debe importar el motor y detectar una temporada conocida
$Prueba = & (Join-Path $PyDest 'python.exe') -c "from spvi_analitica.temporadas import detectar; v = [100.0 * (3 if (i % 12) == 0 else 1) for i in range(36)]; r = detectar(v, 1); print('MOTOR_OK' if r.temporadas and r.temporadas[0].meses == [1] else 'MOTOR_MAL')"
if ($LASTEXITCODE -ne 0 -or ($Prueba -join '') -notmatch 'MOTOR_OK') { throw "El motor analítico empaquetado no funciona: $Prueba" }
Write-Host 'Motor analítico empaquetado y probado.' -ForegroundColor Green
Descargar 'https://aka.ms/vs/17/release/vc_redist.x64.exe' (Join-Path $Cache 'vc_redist.x64.exe')
$TsDir = Join-Path $App 'runtime\tailscale'
New-Item -ItemType Directory -Force -Path $TsDir | Out-Null
Descargar 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' (Join-Path $Cache 'tailscale-setup.msi')
Copy-Item (Join-Path $Cache 'tailscale-setup.msi') (Join-Path $TsDir 'tailscale-setup.msi')
Copy-Item (Join-Path $Inst 'scripts') (Join-Path $App 'scripts') -Recurse
Set-Content (Join-Path $App 'VERSION') $Version

Paso '6/6 Instalador'
& $Iscc "/DAppVersion=$Version" "/O$Salida" (Join-Path $Inst 'SPVI.iss')
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del instalador' }
$exe = Join-Path $Salida "SPVI-Setup-$Version.exe"
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash
Set-Content "$exe.sha256" "$hash  SPVI-Setup-$Version.exe"
Write-Host "`nListo: $exe" -ForegroundColor Green
Write-Host "SHA-256: $hash"
