<#
  KIT SIN CONEXIÓN de SPVI. Se prepara UNA vez en una PC Windows CON internet y se copia a la red sin internet
  (p. ej. la laptop dentro de la red del banco). Con él se puede, sin descargar nada:
    - instalar las dependencias y compilar el API y el portal   (usar-kit-offline.ps1)
    - armar el instalador de Windows                              (empaquetar.ps1 -Kit <carpeta>)

  Uso (en la raíz del portal, la misma carpeta que usa empaquetar.ps1):
    powershell -ExecutionPolicy Bypass -File instalador\preparar-kit-offline.ps1

  Requisitos: Windows 10/11 x64 con internet, Node.js 22 (la MISMA versión mayor que tendrá la PC sin internet).
  El kit sirve mientras no cambien package-lock.json ni requirements.txt: si cambian, prepárelo de nuevo.
#>
param(
  [string]$NodeVersion = '22.12.0',
  [string]$PgVersion = '16.6-1',
  [string]$WinSWVersion = '2.12.0',
  [string]$PythonVersion = '3.12.8',
  [string]$Destino
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:CHECKPOINT_DISABLE = '1'

$Inst = $PSScriptRoot
$Raiz = Split-Path $Inst -Parent
$Api = Join-Path $Raiz 'api'
$Analitica = Join-Path $Raiz 'analitica'
if (-not $Destino) { $Destino = Join-Path $Inst 'kit-offline' }
$Cache = Join-Path $Destino 'cache'
$NpmCache = Join-Path $Destino 'npm-cache'
$Motores = Join-Path $Destino 'prisma-motores'
$Ruedas = Join-Path $Destino 'python-ruedas'

function Paso($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Correr([string]$Dir, [string]$Cmd) {
  Push-Location $Dir
  try { cmd /c $Cmd; if ($LASTEXITCODE -ne 0) { throw "Falló: $Cmd (en $Dir)" } } finally { Pop-Location }
}
function Descargar([string]$Url, [string]$Archivo) {
  if (-not (Test-Path $Archivo)) { Write-Host "Descargando $Url"; Invoke-WebRequest $Url -OutFile $Archivo -UseBasicParsing }
}

foreach ($c in 'node', 'npm') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "Falta $c en esta PC" } }
foreach ($x in (Join-Path $Raiz 'package-lock.json'), (Join-Path $Api 'package-lock.json'), (Join-Path $Analitica 'requirements.txt')) {
  if (-not (Test-Path $x)) { throw "No encuentro $x (ejecute el script dentro del proyecto)" }
}
New-Item -ItemType Directory -Force -Path $Cache, $NpmCache, $Motores, $Ruedas | Out-Null

Paso '1/4 Componentes de terceros (los mismos nombres que usa empaquetar.ps1)'
Descargar "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" (Join-Path $Cache "node-v$NodeVersion-win-x64.zip")
Descargar "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip" (Join-Path $Cache "postgresql-$PgVersion-windows-x64-binaries.zip")
Descargar "https://github.com/winsw/winsw/releases/download/v$WinSWVersion/WinSW-x64.exe" (Join-Path $Cache "WinSW-x64-$WinSWVersion.exe")
Descargar "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip" (Join-Path $Cache "python-$PythonVersion-embed-amd64.zip")
Descargar 'https://bootstrap.pypa.io/get-pip.py' (Join-Path $Cache 'get-pip.py')
Descargar 'https://aka.ms/vs/17/release/vc_redist.x64.exe' (Join-Path $Cache 'vc_redist.x64.exe')
Descargar 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' (Join-Path $Cache 'tailscale-setup.msi')

Paso '1b/4 Herramientas para compilar en la PC sin internet (Node.js e Inno Setup)'
# empaquetar.ps1 exige Node 22 e Inno Setup 6 en la PC donde se compila: se llevan en el kit para instalarlos allí
$Herr = Join-Path $Destino 'herramientas'
New-Item -ItemType Directory -Force -Path $Herr | Out-Null
function Intentar([string]$Url, [string]$Archivo) {
  $d = Join-Path $Herr $Archivo
  if (Test-Path $d) { return }
  try { Write-Host "Descargando $Url"; Invoke-WebRequest $Url -OutFile $d -UseBasicParsing }
  catch { Remove-Item $d -Force -ErrorAction SilentlyContinue; Write-Warning "No se pudo descargar $Archivo ($($_.Exception.Message)). Descárguelo a mano desde el sitio oficial y póngalo en $Herr" }
}
Intentar "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi" "node-v$NodeVersion-x64.msi"
Intentar 'https://jrsoftware.org/download.php/is.exe' 'innosetup-6-instalador.exe'
$IS = Join-Path $Herr 'innosetup-6-instalador.exe'
if (Test-Path $IS) {
  $VerIS = (Get-Item $IS).VersionInfo.ProductVersion
  if ($VerIS -and -not $VerIS.StartsWith('6.')) { Write-Warning "Inno Setup descargado es la versión $VerIS; SPVI.iss está hecho para la 6. Descargue la 6.x desde https://jrsoftware.org/isdl.php y reemplace $IS" }
}

Paso '2/4 Paquetes de npm (portal y API) en la caché del kit'
# npm ci con --cache deja en el kit TODOS los paquetes exactos del package-lock (luego: npm ci --offline)
Correr $Raiz "npm ci --no-audit --no-fund --cache `"$NpmCache`""
Correr $Api "npm ci --no-audit --no-fund --cache `"$NpmCache`""

Paso '3/4 Motores de Prisma para Windows'
# npm ci en el API ya los descargó (postinstall de @prisma/engines): se copian al kit con su versión
$Eng = Join-Path $Api 'node_modules\@prisma\engines'
foreach ($m in 'query_engine-windows.dll.node', 'schema-engine-windows.exe') {
  $origen = Join-Path $Eng $m
  if (-not (Test-Path $origen)) { Correr $Api 'npx --no-install prisma version' }   # fuerza la descarga si faltara
  if (-not (Test-Path $origen)) { throw "No se obtuvo el motor de Prisma $m (revise la conexión de esta PC)" }
  Copy-Item $origen $Motores -Force
}
$VerMotor = (Get-Content (Join-Path $Api 'node_modules\@prisma\engines-version\package.json') -Raw | ConvertFrom-Json).version
$VerPrisma = (Get-Content (Join-Path $Api 'node_modules\prisma\package.json') -Raw | ConvertFrom-Json).version
Set-Content (Join-Path $Motores 'VERSION.txt') "prisma $VerPrisma`nmotores $VerMotor"

Paso '4/4 Librerías de Python del motor analítico (ruedas para Windows)'
$PyZip = Join-Path $Cache "python-$PythonVersion-embed-amd64.zip"
$PyBuild = Join-Path $env:TEMP "spvi-python-kit-$PythonVersion"
if (-not (Test-Path (Join-Path $PyBuild 'Scripts\pip.exe'))) {
  Expand-Archive $PyZip $PyBuild -Force
  $Pth = Get-ChildItem $PyBuild -Filter 'python*._pth' | Select-Object -First 1
  @("$($Pth.BaseName).zip", '.', 'Lib\site-packages', 'import site') | Set-Content $Pth.FullName -Encoding ascii
  & (Join-Path $PyBuild 'python.exe') (Join-Path $Cache 'get-pip.py') --no-warn-script-location
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar pip' }
}
$Py = Join-Path $PyBuild 'python.exe'
$PyCorta = ($PythonVersion.Split('.')[0..1]) -join '.'   # 3.12.8 → 3.12 (ruedas para ese Python)
& $Py -m pip download --disable-pip-version-check --only-binary=:all: --platform win_amd64 --python-version $PyCorta -d $Ruedas -r (Join-Path $Analitica 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron descargar las librerías del motor analítico' }
& $Py -m pip download --disable-pip-version-check --only-binary=:all: -d $Ruedas pip setuptools wheel
if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar pip para el kit' }

# Manifiesto con huella SHA-256 de cada archivo: el área de seguridad puede verificar que nada cambió en el camino
$Lista = Get-ChildItem $Destino -Recurse -File | Where-Object { $_.Name -ne 'MANIFIESTO.txt' }
$Lineas = @("Kit sin conexión de SPVI — preparado $(Get-Date -Format 'yyyy-MM-dd HH:mm') en $env:COMPUTERNAME",
  "Node $NodeVersion · PostgreSQL $PgVersion · Python $PythonVersion · Prisma $VerPrisma (motores $VerMotor)",
  "package-lock del API: $((Get-FileHash (Join-Path $Api 'package-lock.json')).Hash)",
  "package-lock del portal: $((Get-FileHash (Join-Path $Raiz 'package-lock.json')).Hash)", '')
$Lineas += $Lista | Where-Object { $_.FullName -notlike "$NpmCache*" } | ForEach-Object { "$((Get-FileHash $_.FullName).Hash)  $($_.FullName.Substring($Destino.Length + 1))" }
Set-Content (Join-Path $Destino 'MANIFIESTO.txt') $Lineas -Encoding utf8
$Mb = [math]::Round(($Lista | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "`nKit listo en $Destino ($Mb MB). Cópielo completo (USB o carpeta compartida) a la PC sin internet." -ForegroundColor Green
Write-Host 'Allí: 1) instale herramientas\node-*.msi (y, para armar el instalador, herramientas\innosetup-6-instalador.exe)'
Write-Host '      2) copie también la carpeta del proyecto (portal, api, analitica e instalador), SIN node_modules'
Write-Host '      3) usar-kit-offline.ps1 (para compilar) o empaquetar.ps1 -Kit <carpeta> (para el instalador).'
