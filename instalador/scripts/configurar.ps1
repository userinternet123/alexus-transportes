<#
  Configura SPVI después de copiar los archivos. Lo ejecuta el instalador como
  administrador. Es idempotente: sirve para la instalación nueva y para cada
  actualización.

  Instalación nueva : PostgreSQL privado + base + .env + migraciones + datos iniciales + servicios
  Actualización     : migraciones + reinicio de servicios (los datos no se tocan)
#>
param(
  [string]$Puerto = '',
  [string]$ArchivoClave = '',
  [string]$Version = '0.0.0'
)
$ErrorActionPreference = 'Stop'
$env:CHECKPOINT_DISABLE = '1'   # Prisma (migrate deploy) no consulta internet: la instalación funciona sin red

$App    = Split-Path $PSScriptRoot -Parent          # C:\Program Files\SPVI
$Datos  = Join-Path $env:ProgramData 'SPVI'         # datos: se conservan siempre
$Config = Join-Path $Datos 'config'
$Pgdata = Join-Path $Datos 'pgdata'
$Logs   = Join-Path $Datos 'logs'
$Resp   = Join-Path $Datos 'respaldos'
$Node   = Join-Path $App 'runtime\node\node.exe'
$PgBin  = Join-Path $App 'runtime\pgsql\bin'
$EnvFile = Join-Path $Config '.env'
$PgPort = 5433                                       # no choca con otro PostgreSQL del equipo
$Utf8SinBom = New-Object System.Text.UTF8Encoding $false

New-Item -ItemType Directory -Force -Path $Config, $Logs, $Resp | Out-Null
Start-Transcript -Path (Join-Path $Logs "instalacion-$Version-$(Get-Date -Format yyyyMMdd-HHmmss).log") | Out-Null

$Paso = 'Inicio'
$ArchivoError = Join-Path $Logs 'ultimo-error.txt'
Remove-Item $ArchivoError -ErrorAction SilentlyContinue
function Paso([string]$Nombre) { $script:Paso = $Nombre; Write-Host "`n== $Nombre ==" }

# Proceso que escucha en un puerto (o $null). Detecta otro programa (XAMPP, Apache…) en el puerto de SPVI.
function Ocupante([int]$P) {
  $c = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { return $null }
  $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  [pscustomobject]@{ Nombre = $proc.ProcessName; Ruta = $proc.Path; Id = $c.OwningProcess }
}

function Aleatorio([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}
function Leer-Env([string]$Clave) {
  if (Test-Path $EnvFile) {
    $l = Get-Content $EnvFile | Where-Object { $_ -match "^$Clave=" } | Select-Object -First 1
    if ($l) { return $l.Substring($Clave.Length + 1) }
  }
  return ''
}
# Motor analítico: el token se genera UNA vez por equipo y lo comparten el API (.env) y el motor (analitica.env).
# En una actualización desde una versión sin motor, se agrega sin tocar el resto de la configuración.
function Asegurar-Analitica {
  $token = Leer-Env 'ANALITICA_TOKEN'
  if (-not $token) {
    $token = Aleatorio 32
    $lineas = @(Get-Content $EnvFile) + @('# Motor analítico local (Python): solo escucha en este equipo (127.0.0.1)', 'ANALITICA_URL=http://127.0.0.1:4100', "ANALITICA_TOKEN=$token")
    [System.IO.File]::WriteAllText($EnvFile, ($lineas -join "`n") + "`n", $Utf8SinBom)
  }
  [System.IO.File]::WriteAllText((Join-Path $Config 'analitica.env'), "ANALITICA_TOKEN=$token`n", $Utf8SinBom)
}
function Solo-Administradores([string]$Ruta) {
  icacls $Ruta /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null  # Administradores y SYSTEM
}
function Ejecutar([string]$Exe, [object[]]$Argumentos, [string]$Mensaje) {
  & $Exe @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "$Mensaje (código $LASTEXITCODE)" }
}

try {
  $PrimeraVez = -not (Test-Path $EnvFile)

  if ($PrimeraVez) {
    Write-Host '== Instalación nueva =='
    if (-not $Puerto) { $Puerto = '8080' }
    # El puerto debe estar libre ANTES de crear nada
    Paso "Comprobando que el puerto $Puerto esté libre"
    $otro = Ocupante ([int]$Puerto)
    if ($otro) {
      throw "El puerto $Puerto ya lo usa otro programa: $($otro.Nombre) (proceso $($otro.Id)). Vuelva a ejecutar el instalador y elija otro puerto (por ejemplo 8090), o cierre ese programa."
    }
    # Un intento anterior pudo dejar la base creada sin configuración: se limpia (aún no hay datos)
    if (Test-Path $Pgdata) {
      Paso 'Limpiando un intento de instalación anterior'
      if (Get-Service 'SPVI-PostgreSQL' -ErrorAction SilentlyContinue) {
        Stop-Service 'SPVI-PostgreSQL' -Force -ErrorAction SilentlyContinue
        & "$PgBin\pg_ctl.exe" unregister -N 'SPVI-PostgreSQL'
      }
      Remove-Item $Pgdata -Recurse -Force
    }
    Paso 'Creando la base de datos (PostgreSQL)'
    $SuperClave = Aleatorio 24
    $ClaveApp   = Aleatorio 24

    # 1. PostgreSQL privado de SPVI
    $pw = Join-Path $env:TEMP "spvi-pg-$(Get-Random).txt"
    [System.IO.File]::WriteAllText($pw, $SuperClave, $Utf8SinBom)
    & "$PgBin\initdb.exe" -D $Pgdata -U postgres --pwfile=$pw -A scram-sha-256 -E UTF8 --locale='Spanish_Guatemala.1252'
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'Configuración regional no disponible; se usa la neutra'
      Remove-Item $Pgdata -Recurse -Force -ErrorAction SilentlyContinue
      Ejecutar "$PgBin\initdb.exe" @('-D', $Pgdata, '-U', 'postgres', "--pwfile=$pw", '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C') 'No se pudo inicializar PostgreSQL'
    }
    Remove-Item $pw -Force
    Add-Content (Join-Path $Pgdata 'postgresql.conf') "`n# SPVI`nport = $PgPort`nlisten_addresses = 'localhost'`n"
    # El servicio de PostgreSQL corre como NETWORK SERVICE: necesita control de su carpeta
    icacls $Pgdata /grant '*S-1-5-20:(OI)(CI)F' /T | Out-Null
    Ejecutar "$PgBin\pg_ctl.exe" @('register', '-N', 'SPVI-PostgreSQL', '-D', $Pgdata, '-S', 'auto', '-w') 'No se pudo registrar el servicio de PostgreSQL'
    Start-Service 'SPVI-PostgreSQL'

    $env:PGPASSWORD = $SuperClave
    Ejecutar "$PgBin\psql.exe" @('-h', 'localhost', '-p', $PgPort, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE ROLE spvi LOGIN PASSWORD '$ClaveApp';") 'No se pudo crear el usuario de la base'
    Ejecutar "$PgBin\psql.exe" @('-h', 'localhost', '-p', $PgPort, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE spvi OWNER spvi ENCODING 'UTF8' TEMPLATE template0;") 'No se pudo crear la base'
    Remove-Item Env:PGPASSWORD

    Paso 'Guardando la configuración'
    # 2. Configuración del API (secretos generados en este equipo; nunca viajan en el instalador)
    $contenido = @"
NODE_ENV=production
PORT=$Puerto
DATABASE_URL=postgresql://spvi:$ClaveApp@localhost:$PgPort/spvi?schema=public
JWT_ACCESS_SECRET=$(Aleatorio 48)
CORS_ORIGINS=http://localhost:$Puerto
TZ_NEGOCIO=America/Guatemala
WEB_DIR=$App\web
FEL_PROVEEDOR=mock
# Motor analítico local (Python): solo escucha en este equipo (127.0.0.1)
ANALITICA_URL=http://127.0.0.1:4100
ANALITICA_TOKEN=$(Aleatorio 32)
# Lectura de facturas con IA (foto o PDF): pegue la clave y reinicie el servicio SPVI-API
# IA_API_KEY=
# IA_MODELO=claude-haiku-5-5
# Soporte, avisos y actualizaciones (SPVI Central): pegue los datos de su proveedor y reinicie SPVI-API
# CENTRAL_URL=
# CENTRAL_TOKEN=
APP_VERSION=$Version
"@
    [System.IO.File]::WriteAllText($EnvFile, $contenido, $Utf8SinBom)
    # Clave del superusuario de PostgreSQL: solo para soporte técnico
    [System.IO.File]::WriteAllText((Join-Path $Config 'postgres-superusuario.txt'), "usuario: postgres`npuerto: $PgPort`nclave: $SuperClave`n", $Utf8SinBom)
    Solo-Administradores $Config
  }
  else {
    Write-Host '== Actualización =='
    $Puerto = Leer-Env 'PORT'
    # Si cambió la carpeta de instalación, el portal se publica desde la nueva
    $lineas = @(Get-Content $EnvFile | ForEach-Object { if ($_ -match '^WEB_DIR=') { "WEB_DIR=$App\web" } elseif ($_ -match '^APP_VERSION=') { "APP_VERSION=$Version" } else { $_ } })
    if (-not ($lineas -match '^APP_VERSION=')) { $lineas += "APP_VERSION=$Version" }
    [System.IO.File]::WriteAllText($EnvFile, ($lineas -join "`n") + "`n", $Utf8SinBom)
    if ((Get-Service 'SPVI-PostgreSQL').Status -ne 'Running') { Start-Service 'SPVI-PostgreSQL' }
  }

  Paso 'Actualizando la estructura de la base (migraciones)'
  # 3. Migraciones de la base (nueva o actualización)
  $env:DATABASE_URL = Leer-Env 'DATABASE_URL'
  Ejecutar $Node @((Join-Path $App 'api\node_modules\prisma\build\index.js'), 'migrate', 'deploy', '--schema', (Join-Path $App 'api\prisma\schema.prisma')) 'Falló la actualización de la base de datos'

  Paso 'Cargando datos iniciales (permisos, roles y usuario admin)'
  # 4. Datos iniciales (solo la primera vez): permisos, roles, parámetros y usuario admin
  if ($PrimeraVez) {
    $env:SEED_ADMIN_PASSWORD = (Get-Content $ArchivoClave -Raw).Trim()
    Ejecutar $Node @((Join-Path $App 'api\dist-seed\prisma\seed.js')) 'Falló la carga de datos iniciales'
    Remove-Item Env:SEED_ADMIN_PASSWORD
  }
  else {
    # En actualizaciones el seed solo agrega permisos y parámetros nuevos (no toca usuarios)
    $env:SEED_ADMIN_PASSWORD = Aleatorio 12
    & $Node (Join-Path $App 'api\dist-seed\prisma\seed.js')
    Remove-Item Env:SEED_ADMIN_PASSWORD
  }
  Remove-Item Env:DATABASE_URL

  Asegurar-Analitica
  Paso 'Registrando el servicio SPVI-API'
  # 5. Servicio del API
  $Servicio = Join-Path $App 'servicio\SPVI-API.exe'
  if (-not (Get-Service 'SPVI-API' -ErrorAction SilentlyContinue)) { Ejecutar $Servicio @('install') 'No se pudo registrar el servicio del API' }
  Start-Service 'SPVI-API'

  # 5b. Motor analítico local. Si fallara, SPVI funciona igual: solo «Detectar temporadas» y «Qué comprar» no calculan.
  Paso 'Registrando el motor analítico (SPVI-Analitica)'
  try {
    $ServAna = Join-Path $App 'servicio\SPVI-Analitica.exe'
    if (Test-Path $ServAna) {
      if (-not (Get-Service 'SPVI-Analitica' -ErrorAction SilentlyContinue)) { Ejecutar $ServAna @('install') 'No se pudo registrar el motor analítico' }
      Restart-Service 'SPVI-Analitica' -ErrorAction Stop
      $listo = $false
      for ($i = 0; $i -lt 30 -and -not $listo; $i++) {
        Start-Sleep -Seconds 1
        try { $listo = (Invoke-RestMethod 'http://127.0.0.1:4100/salud' -TimeoutSec 2).estado -eq 'ok' } catch { $listo = $false }
      }
      if ($listo) { Write-Host 'Motor analítico listo.' } else { Write-Warning "El motor analítico no respondió. Revise $(Join-Path $Logs 'SPVI-Analitica.err.log')" }
    }
  } catch { Write-Warning "Motor analítico: $($_.Exception.Message)" }

  # 6. Acceso desde otras computadoras de la red local (cajas, bodega)
  if (-not (Get-NetFirewallRule -DisplayName 'SPVI' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'SPVI' -Direction Inbound -Protocol TCP -LocalPort $Puerto -Action Allow -Profile Domain, Private | Out-Null
  }

  # 7. Respaldo automático diario a las 22:00 (se guardan 14 días)
  schtasks /Create /TN 'SPVI\Respaldo diario' /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$App\scripts\respaldo.ps1`"" /SC DAILY /ST 22:00 /RU SYSTEM /F | Out-Null

  Paso 'Verificando que el sistema responda'
  # 8. Verificación
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $r = Invoke-RestMethod "http://127.0.0.1:$Puerto/api/v1/health" -TimeoutSec 3
      if ($r.status -eq 'ok') { $ok = $true; break }   # debe responder SPVI, no otro servidor
    } catch { }
    Start-Sleep -Seconds 2
  }
  if (-not $ok) {
    $otro = Ocupante ([int]$Puerto)
    if ($otro -and ($otro.Ruta -notlike "$App*")) {
      throw "El puerto $Puerto lo ocupa otro programa: $($otro.Nombre) (proceso $($otro.Id), $($otro.Ruta)). Ciérrelo o cambie el puerto de SPVI en $EnvFile (PORT=) y reinicie el servicio SPVI-API."
    }
    $err = Join-Path $Logs 'SPVI-API.err.log'
    $ultimas = if (Test-Path $err) { (Get-Content $err -Tail 6) -join ' | ' } else { 'sin registro de errores' }
    throw "El servicio SPVI-API no respondió en http://localhost:$Puerto. Últimas líneas de error: $ultimas"
  }
  Write-Host "SPVI $Version listo en http://localhost:$Puerto"
}
catch {
  $detalle = "Paso: $Paso`r`nError: $($_.Exception.Message)"
  Write-Host "ERROR`n$detalle"
  # En Windows-1252: el instalador (Inno Setup) lo lee como texto ANSI y así se ven bien las tildes
  [System.IO.File]::WriteAllText($ArchivoError, $detalle, [System.Text.Encoding]::GetEncoding(1252))
  Stop-Transcript | Out-Null
  exit 1
}
Stop-Transcript | Out-Null
exit 0
