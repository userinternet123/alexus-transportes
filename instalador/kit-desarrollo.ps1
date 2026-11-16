<#
  KIT DE DESARROLLO SIN INTERNET (un solo script).
  Para COMPILAR, PROBAR y DESARROLLAR el API y el portal de SPVI en una PC sin internet (p. ej. la laptop de un banco).
  Solo lleva los módulos: paquetes de npm y los motores de Prisma. No incluye el instalador de Windows.

  EN LA PC CON INTERNET (una vez; Windows x64, con Node.js 22), dentro de la carpeta del portal:
      powershell -ExecutionPolicy Bypass -File kit-desarrollo.ps1 -Accion preparar
      (agregue -ConBaseDeDatos si quiere PostgreSQL portátil para correr el API y las pruebas con base de datos)
  Copie a la otra PC: la carpeta del proyecto (SIN node_modules) y la carpeta kit-desarrollo, y este script.

  EN LA PC SIN INTERNET (necesita Node.js 22 instalado), dentro de la carpeta del portal:
      kit-desarrollo.ps1 -Accion instalar    instala los módulos desde el kit y prepara Prisma (no usa internet)
      kit-desarrollo.ps1 -Accion compilar    compila el API y el portal
      kit-desarrollo.ps1 -Accion probar      typecheck y pruebas (jest) del API; pruebas del portal si las tiene
      kit-desarrollo.ps1 -Accion iniciar     abre el API (nest --watch) y el portal (Vite) en modo desarrollo
      kit-desarrollo.ps1 -Accion bd          inicia el PostgreSQL portátil del kit (-Detener lo apaga)

  Cuando cambie package.json o package-lock.json (agregar un paquete), prepare el kit de nuevo en la PC con internet.
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('preparar', 'instalar', 'compilar', 'probar', 'iniciar', 'bd')][string]$Accion,
  [string]$Kit = (Join-Path (Get-Location).Path 'kit-desarrollo'),
  [string]$Portal,            # carpeta del portal (Vite). Por defecto: la carpeta actual
  [string]$Api,               # carpeta del API (donde está prisma\schema.prisma). Por defecto: <portal>\api
  [switch]$ConBaseDeDatos,    # preparar: incluir PostgreSQL portátil
  [string]$PgVersion = '16.6-1',
  [int]$Puerto = 5432,        # bd: puerto del PostgreSQL de desarrollo
  [switch]$Detener            # bd: apagar el PostgreSQL de desarrollo
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:CHECKPOINT_DISABLE = '1'                # Prisma no consulta actualizaciones (en una red cerrada solo causa esperas)
$EsWin = ($env:OS -eq 'Windows_NT')

if (-not $Portal) { $Portal = (Get-Location).Path }
if (-not $Api) { $Api = Join-Path $Portal 'api' }
$Cache = Join-Path $Kit 'npm-cache'
$Motores = Join-Path $Kit 'prisma-motores'
$PgKit = Join-Path $Kit 'postgresql'
$Info = Join-Path $Kit 'kit.json'
$Proyectos = @(@{ Nombre = 'API'; Dir = $Api }, @{ Nombre = 'Portal'; Dir = $Portal }) | Where-Object { Test-Path (Join-Path $_.Dir 'package.json') }

function Titulo($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Correr([string]$Dir, [string]$Cmd) {
  Push-Location $Dir
  try {
    if ($EsWin) { cmd /c $Cmd } else { sh -c $Cmd }
    if ($LASTEXITCODE -ne 0) { throw "Falló: $Cmd (en $Dir)" }
  } finally { Pop-Location }
}
function EsApi([string]$Dir) { Test-Path ([IO.Path]::Combine($Dir, 'prisma', 'schema.prisma')) }
function Scripts([string]$Dir) {
  $p = Get-Content (Join-Path $Dir 'package.json') -Raw | ConvertFrom-Json
  if ($p.scripts) { @($p.scripts.PSObject.Properties.Name) } else { @() }
}
function Huella([string]$Archivo) { if (Test-Path $Archivo) { (Get-FileHash $Archivo -Algorithm SHA256).Hash } else { '' } }
function Exigir-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Falta Node.js (versión 22) en esta PC.' }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Falta npm en esta PC.' }
}
function DondeMotores([string]$ApiDir) {
  $d = [IO.Path]::Combine($ApiDir, 'node_modules', '@prisma', 'engines')
  @{ Dir = $d; Lib = (Join-Path $d 'query_engine-windows.dll.node'); Esquema = (Join-Path $d 'schema-engine-windows.exe') }
}

if (-not $Proyectos.Count) { throw "No encuentro package.json en $Portal ni en $Api. Ejecute el script dentro de la carpeta del portal o use -Portal y -Api." }
$Resumen = New-Object System.Collections.Generic.List[string]

switch ($Accion) {

  'preparar' {
    Exigir-Node
    Titulo 'Preparar el kit (esta PC SÍ necesita internet)'
    New-Item -ItemType Directory -Force -Path $Cache, $Motores | Out-Null
    $locks = @{}
    foreach ($pr in $Proyectos) {
      if (-not (Test-Path (Join-Path $pr.Dir 'package-lock.json'))) { throw "$($pr.Nombre): falta package-lock.json. Sin él no se puede instalar de forma exacta." }
      Titulo "$($pr.Nombre): paquetes de npm a la caché del kit"
      # Con los scripts de instalación: el API descarga ahí los motores de Prisma para Windows
      Correr $pr.Dir "npm ci --no-audit --no-fund --cache `"$Cache`""
      $locks[$pr.Nombre] = Huella (Join-Path $pr.Dir 'package-lock.json')
    }
    $verPrisma = ''; $verMotor = ''
    if (EsApi $Api) {
      Titulo 'Motores de Prisma'
      $m = DondeMotores $Api
      if ($EsWin) {
        foreach ($f in $m.Lib, $m.Esquema) {
          if (-not (Test-Path $f)) { Correr $Api 'npx --no-install prisma generate' }
          if (-not (Test-Path $f)) { throw "No se obtuvo $(Split-Path $f -Leaf): revise la conexión de esta PC." }
          Copy-Item $f $Motores -Force
        }
      } else { Write-Warning 'Esta PC no es Windows: no se copian los motores de Windows al kit. Prepare el kit en una PC Windows x64.' }
      $verPrisma = (Get-Content ([IO.Path]::Combine($Api, 'node_modules', 'prisma', 'package.json')) -Raw | ConvertFrom-Json).version
      $verMotor = (Get-Content ([IO.Path]::Combine($Api, 'node_modules', '@prisma', 'engines-version', 'package.json')) -Raw | ConvertFrom-Json).version
    }
    if ($ConBaseDeDatos) {
      Titulo 'PostgreSQL portátil y Visual C++ (para correr el API y las pruebas con base de datos)'
      New-Item -ItemType Directory -Force -Path $PgKit | Out-Null
      foreach ($d in @(@{ U = "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip"; A = "postgresql-$PgVersion-windows-x64-binaries.zip" }, @{ U = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'; A = 'vc_redist.x64.exe' })) {
        $dest = Join-Path $PgKit $d.A
        if (-not (Test-Path $dest)) { Write-Host "Descargando $($d.U)"; Invoke-WebRequest $d.U -OutFile $dest -UseBasicParsing }
      }
    }
    @{ preparado = (Get-Date -Format 'yyyy-MM-dd HH:mm'); equipo = $env:COMPUTERNAME; node = (node --version); nodeMayor = [int]((node --version).TrimStart('v').Split('.')[0]); prisma = $verPrisma; motores = $verMotor; locks = $locks; baseDeDatos = [bool]$ConBaseDeDatos } |
      ConvertTo-Json | Set-Content $Info -Encoding utf8
    # Manifiesto con huella SHA-256 (sin la caché de npm, que son miles de archivos): para que el área de seguridad verifique el kit
    $lista = Get-ChildItem $Kit -Recurse -File | Where-Object { $_.FullName -notlike "$Cache*" -and $_.Name -ne 'MANIFIESTO.txt' }
    $lineas = @("Kit de desarrollo SPVI — $(Get-Date -Format 'yyyy-MM-dd HH:mm') — Node $(node --version) — Prisma $verPrisma")
    $lineas += $lista | ForEach-Object { "$(Huella $_.FullName)  $($_.FullName.Substring($Kit.Length + 1))" }
    Set-Content (Join-Path $Kit 'MANIFIESTO.txt') $lineas -Encoding utf8
    $mb = [math]::Round((Get-ChildItem $Kit -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
    Write-Host "`nKit listo en $Kit ($mb MB). Cópielo, junto con el proyecto (sin node_modules) y este script, a la PC sin internet." -ForegroundColor Green
  }

  'instalar' {
    Exigir-Node
    foreach ($x in $Cache, $Info) { if (-not (Test-Path $x)) { throw "El kit está incompleto: falta $x. Prepárelo con -Accion preparar en una PC con internet." } }
    $meta = Get-Content $Info -Raw | ConvertFrom-Json     # (no llamar $kit: PowerShell no distingue mayúsculas y pisaría el parámetro $Kit)
    $mayor = [int]((node --version).TrimStart('v').Split('.')[0])
    if ($mayor -ne [int]$meta.nodeMayor) { Write-Warning "Esta PC tiene Node $(node --version) y el kit se preparó con Node $($meta.node). Use la misma versión mayor para evitar fallas." }
    foreach ($pr in $Proyectos) {
      $lock = Join-Path $pr.Dir 'package-lock.json'
      if (-not (Test-Path $lock)) { throw "$($pr.Nombre): falta package-lock.json" }
      $esperado = $meta.locks.($pr.Nombre)
      if ($esperado -and $esperado -ne (Huella $lock)) { Write-Warning "$($pr.Nombre): el package-lock.json cambió desde que se preparó el kit. Si la instalación falla con ENOTCACHED, prepare el kit de nuevo." }
      Titulo "$($pr.Nombre): instalar módulos desde el kit (sin internet)"
      Correr $pr.Dir "npm ci --offline --ignore-scripts --no-audit --no-fund --cache `"$Cache`""
      $Resumen.Add("✔ $($pr.Nombre): módulos instalados")
    }
    if (EsApi $Api) {
      Titulo 'Prisma con los motores del kit'
      $m = DondeMotores $Api
      if ($EsWin) {
        foreach ($f in 'query_engine-windows.dll.node', 'schema-engine-windows.exe') { if (-not (Test-Path (Join-Path $Motores $f))) { throw "El kit no trae $f. Prepárelo de nuevo en una PC Windows con internet." } }
        New-Item -ItemType Directory -Force -Path $m.Dir | Out-Null
        Copy-Item (Join-Path $Motores 'query_engine-windows.dll.node'), (Join-Path $Motores 'schema-engine-windows.exe') $m.Dir -Force
        # Variables de usuario: así "npx prisma migrate/generate" tampoco intenta descargar nada, ni en otras terminales
        $vars = @{ PRISMA_QUERY_ENGINE_LIBRARY = $m.Lib; PRISMA_SCHEMA_ENGINE_BINARY = $m.Esquema; PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = '1'; CHECKPOINT_DISABLE = '1' }
        foreach ($k in $vars.Keys) { Set-Item "Env:$k" $vars[$k]; [Environment]::SetEnvironmentVariable($k, $vars[$k], 'User') }
      }
      Correr $Api 'npx --no-install prisma generate'
      $cliente = [IO.Path]::Combine($Api, 'node_modules', '.prisma', 'client')
      if ($EsWin -and (Test-Path $cliente)) { Copy-Item $m.Lib $cliente -Force }
      $Resumen.Add('✔ Prisma: cliente generado con los motores del kit')
    }
  }

  'compilar' {
    Exigir-Node
    foreach ($pr in $Proyectos) {
      if (-not (Test-Path (Join-Path $pr.Dir 'node_modules'))) { throw "$($pr.Nombre): no hay node_modules. Ejecute primero -Accion instalar." }
      Titulo "$($pr.Nombre): compilar"
      if ((Scripts $pr.Dir) -contains 'build') {
        if ($pr.Nombre -eq 'Portal') { $env:VITE_API_URL = '/api/v1' }
        Correr $pr.Dir 'npm run build'
        $Resumen.Add("✔ $($pr.Nombre): compilado")
      } else { $Resumen.Add("— $($pr.Nombre): no tiene el script build") }
    }
  }

  'probar' {
    Exigir-Node
    $env:CI = 'true'      # las pruebas corren una vez y terminan (sin modo "watch")
    $fallos = 0
    foreach ($pr in $Proyectos) {
      if (-not (Test-Path (Join-Path $pr.Dir 'node_modules'))) { throw "$($pr.Nombre): no hay node_modules. Ejecute primero -Accion instalar." }
      $sc = Scripts $pr.Dir
      foreach ($nombre in 'typecheck', 'test') {
        if ($sc -notcontains $nombre) { $Resumen.Add("— $($pr.Nombre): no tiene el script $nombre"); continue }
        Titulo "$($pr.Nombre): npm run $nombre"
        try { Correr $pr.Dir "npm run $nombre"; $Resumen.Add("✔ $($pr.Nombre): $nombre") }
        catch { $fallos++; $Resumen.Add("✗ $($pr.Nombre): $nombre — $($_.Exception.Message)") }
      }
    }
    if ($fallos) { $Resumen.Add("Fallaron $fallos pasos. Si las pruebas necesitan base de datos, inicie la de desarrollo con -Accion bd.") }
  }

  'iniciar' {
    Exigir-Node
    $sc = if (EsApi $Api) { Scripts $Api } else { @() }
    $cmdApi = if ($sc -contains 'start:dev') { 'npm run start:dev' } else { 'npx --no-install nest start --watch' }
    $cmdPortal = 'npm run dev'
    Write-Host "API:    cd `"$Api`" ; $cmdApi"
    Write-Host "Portal: cd `"$Portal`" ; $cmdPortal"
    if ($EsWin) {
      if (EsApi $Api) { Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$Api'; $cmdApi" }
      if ((Scripts $Portal) -contains 'dev') { Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$Portal'; $cmdPortal" }
      $Resumen.Add('✔ Se abrieron dos ventanas: API y portal. El API necesita su .env y una base de datos (-Accion bd).')
    } else { Write-Host 'Ejecute esos comandos en dos terminales.' }
  }

  'bd' {
    if (-not $EsWin) { Write-Host 'Esta opción es para Windows. En otros sistemas use su PostgreSQL.'; break }
    $dest = Join-Path $env:LOCALAPPDATA 'SPVI-dev'
    $bin = [IO.Path]::Combine($dest, 'pgsql', 'bin')
    $datos = Join-Path $dest 'data'
    if ($Detener) { & (Join-Path $bin 'pg_ctl.exe') -D $datos stop -m fast; $Resumen.Add('✔ PostgreSQL de desarrollo detenido'); break }
    if (-not (Test-Path (Join-Path $bin 'pg_ctl.exe'))) {
      $zip = Get-ChildItem $PgKit -Filter 'postgresql-*-windows-x64-binaries.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $zip) { throw 'El kit no trae PostgreSQL. Prepárelo con -ConBaseDeDatos, o instale PostgreSQL en esta PC.' }
      $vc = Join-Path $PgKit 'vc_redist.x64.exe'
      Titulo 'Extraer PostgreSQL portátil'
      $tmp = Join-Path $dest 'tmp'; New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Expand-Archive $zip.FullName -DestinationPath $tmp -Force
      Move-Item (Join-Path $tmp 'pgsql') (Join-Path $dest 'pgsql') -Force; Remove-Item $tmp -Recurse -Force
      if (Test-Path $vc) { Write-Host "Si PostgreSQL no arranca por falta de librerías, instale $vc" -ForegroundColor Yellow }
    }
    $nueva = -not (Test-Path (Join-Path $datos 'PG_VERSION'))
    if ($nueva) {
      Titulo 'Crear la base de datos de desarrollo'
      $pw = Join-Path $dest 'pw.txt'; Set-Content $pw 'spvi' -Encoding ascii
      & (Join-Path $bin 'initdb.exe') -D $datos -U spvi -A scram-sha-256 --pwfile=$pw -E UTF8 --locale=C
      if ($LASTEXITCODE -ne 0) { throw 'initdb falló' }
      Remove-Item $pw -Force
    }
    & (Join-Path $bin 'pg_ctl.exe') -D $datos status *> $null
    if ($LASTEXITCODE -ne 0) {
      & (Join-Path $bin 'pg_ctl.exe') -D $datos -l (Join-Path $dest 'postgres.log') -o "-p $Puerto -c listen_addresses=127.0.0.1" -w start
      if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no arrancó (¿el puerto $Puerto está ocupado?). Vea $dest\postgres.log" }
    }
    $env:PGPASSWORD = 'spvi'
    $existe = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $Puerto -U spvi -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='spvi'"
    if (-not $existe) { & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p $Puerto -U spvi spvi }
    $Resumen.Add("✔ PostgreSQL de desarrollo listo (solo en este equipo). DATABASE_URL=postgresql://spvi:spvi@127.0.0.1:$Puerto/spvi")
  }
}

if ($Resumen.Count) { Write-Host "`n── Resumen ──" -ForegroundColor Cyan; $Resumen | ForEach-Object { Write-Host $_ } }
if ($Resumen | Where-Object { $_ -like '✗*' }) { exit 1 }
