<#
  RESTAURAR UN RESPALDO DE SPVI (menú Inicio › SPVI).
    restaurar.ps1                 Reemplaza la base actual por un respaldo (pide confirmación)
    restaurar.ps1 -Prueba         SIMULACRO: restaura en una base temporal, muestra qué contiene y la borra.
                                  La base real no se toca. Recomendado una vez al mes.
  Antes de reemplazar, guarda un respaldo de lo actual ("antes-de-restaurar").
  La restauración es "todo o nada": si algo falla, la base queda como estaba.
#>
param([string]$Archivo = '', [string]$Llave = '', [switch]$Prueba)
$ErrorActionPreference = 'Stop'
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  $reenviar = ($PSBoundParameters.GetEnumerator() | ForEach-Object { if ($_.Value -is [switch]) { "-$($_.Key)" } else { "-$($_.Key) `"$($_.Value)`"" } }) -join ' '
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $reenviar"
  exit
}
$App     = Split-Path $PSScriptRoot -Parent
$Datos   = Join-Path $env:ProgramData 'SPVI'
$Config  = Join-Path $Datos 'config'
$Resp    = Join-Path $Datos 'respaldos'
$EnvFile = Join-Path $Config '.env'
$Publica = Join-Path $Config 'respaldo-publica.pem'
$Node    = Join-Path $App 'runtime\node\node.exe'
$Cripto  = Join-Path $PSScriptRoot 'respaldo-cripto.js'
$PgBin   = Join-Path $App 'runtime\pgsql\bin'
function Texto-Plano([Security.SecureString]$s) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
function Pausa { Write-Host ''; Read-Host 'Presione Enter para cerrar' | Out-Null }

function Elegir-Archivo([string]$titulo, [string]$filtro, [string]$carpeta) {
  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Title = $titulo; $d.Filter = $filtro; $d.InitialDirectory = $carpeta
  if ($d.ShowDialog() -ne 'OK') { throw 'Operación cancelada' }
  $d.FileName
}
$tmp = Join-Path $env:TEMP "spvi-restaurar-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  Write-Host "`n=== $(if ($Prueba) { 'Simulacro de restauración' } else { 'Restaurar un respaldo' }) ===`n" -ForegroundColor Cyan
  if (-not $Archivo) { $Archivo = Elegir-Archivo 'Elija el respaldo' 'Respaldos de SPVI (*.spvi;*.dump)|*.spvi;*.dump' $Resp }
  if (-not (Test-Path $Archivo)) { throw "No existe $Archivo" }

  # 1. Abrir el respaldo (si está cifrado, con la llave de recuperación y su frase)
  if ($Archivo -like '*.spvi') {
    $info = & $Node $Cripto info --entrada $Archivo | ConvertFrom-Json
    Write-Host "Respaldo del $(([datetime]$info.creado).ToLocalTime()) · requiere la llave $($info.huella)"
    if (-not $Llave) { $Llave = Elegir-Archivo 'Elija la llave de recuperación' 'Llave de recuperación (*.pem)|*.pem' ([Environment]::GetFolderPath('Desktop')) }
    $plano = Join-Path $tmp 'respaldo.dump'
    $env:SPVI_FRASE = Texto-Plano (Read-Host 'Frase de la llave de recuperación' -AsSecureString)
    try { & $Node $Cripto descifrar --privada $Llave --entrada $Archivo --salida $plano }
    finally { Remove-Item Env:SPVI_FRASE -ErrorAction SilentlyContinue }
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo abrir el respaldo (vea el mensaje anterior)' }
  } else { $plano = $Archivo }

  # 2. Verificar que el respaldo se lee completo
  & (Join-Path $PgBin 'pg_restore.exe') --list $plano | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El respaldo está dañado: no se puede leer' }

  if ($Prueba) {
    # 3a. SIMULACRO en una base temporal (con el superusuario de la instalación)
    $su = Get-Content (Join-Path $Config 'postgres-superusuario.txt')
    $puerto = (($su | Where-Object { $_ -match '^puerto:' }) -replace '^puerto:\s*', '').Trim()
    $env:PGPASSWORD = (($su | Where-Object { $_ -match '^clave:' }) -replace '^clave:\s*', '').Trim()
    $base = 'spvi_simulacro_' + (Get-Date -Format 'yyyyMMddHHmmss')
    $psql = @('-h', 'localhost', '-p', $puerto, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1')
    try {
      & (Join-Path $PgBin 'psql.exe') @psql -d postgres -c "CREATE DATABASE $base TEMPLATE template0 ENCODING 'UTF8';" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base temporal' }
      & (Join-Path $PgBin 'pg_restore.exe') -h localhost -p $puerto -U postgres --no-owner --single-transaction -d $base $plano
      if ($LASTEXITCODE -ne 0) { throw 'El respaldo NO se pudo restaurar' }
      $resumen = & (Join-Path $PgBin 'psql.exe') @psql -d $base -t -A -F ' | ' -c "SELECT (SELECT count(*) FROM productos), (SELECT count(*) FROM terceros), (SELECT count(*) FROM ventas), (SELECT to_char(max(fecha), 'YYYY-MM-DD HH24:MI') FROM ventas);"
      Write-Host "`n✔ SIMULACRO EXITOSO: el respaldo se restauró completo." -ForegroundColor Green
      Write-Host "  Productos | Clientes y proveedores | Ventas | Última venta"
      Write-Host "  $resumen"
      Write-Host '  Su base real no se tocó.' -ForegroundColor DarkGray
      Add-Content (Join-Path $Resp 'simulacros.log') "$((Get-Date).ToString('o'))  OK  $(Split-Path $Archivo -Leaf)  $resumen"
    } catch {
      Add-Content (Join-Path $Resp 'simulacros.log') "$((Get-Date).ToString('o'))  FALLÓ  $(Split-Path $Archivo -Leaf)  $($_.Exception.Message)"
      throw
    } finally {
      & (Join-Path $PgBin 'psql.exe') @psql -d postgres -c "DROP DATABASE IF EXISTS $base;" 2>$null | Out-Null
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
  } else {
    # 3b. RESTAURACIÓN REAL
    Write-Host "`nATENCIÓN: esto REEMPLAZA todos los datos actuales de SPVI por los del respaldo." -ForegroundColor Red
    Write-Host 'Las ventas registradas después de ese respaldo se perderán.' -ForegroundColor Red
    if ((Read-Host 'Escriba RESTAURAR para continuar') -cne 'RESTAURAR') { throw 'Operación cancelada' }
    try { & (Join-Path $PSScriptRoot 'respaldo.ps1') -Motivo 'antes-de-restaurar' }
    catch {
      Write-Warning "No se pudo respaldar la base actual: $($_.Exception.Message)"
      if ((Read-Host '¿Continuar SIN respaldo de lo actual? (S/N)') -notmatch '^[sS]') { throw 'Operación cancelada' }
    }
    $url = (Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1).Substring(13) -replace '\?schema=public', ''
    $puertoApi = ((Get-Content $EnvFile | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1) -replace '^PORT=', '').Trim()
    Stop-Service 'SPVI-API' -Force
    try {
      & (Join-Path $PgBin 'pg_restore.exe') --clean --if-exists --no-owner --single-transaction --dbname=$url $plano
      if ($LASTEXITCODE -ne 0) { throw 'La restauración falló: la base quedó EXACTAMENTE como estaba (todo o nada)' }
    } finally { Start-Service 'SPVI-API' }
    $ok = $false
    for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
      try { $r = Invoke-RestMethod "http://127.0.0.1:$puertoApi/api/v1/health" -TimeoutSec 3; $ok = $r.status -eq 'ok' } catch { Start-Sleep -Seconds 2 }
    }
    if ($ok) { Write-Host "`n✔ Restauración completa. SPVI está funcionando con los datos del respaldo." -ForegroundColor Green }
    else { Write-Warning 'Los datos se restauraron, pero SPVI no respondió todavía. Revise el servicio SPVI-API.' }
  }
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue   # el respaldo abierto nunca queda en disco
}
Pausa
