<#
  Migra los datos del SPVI anterior (SQL Server) a SPVI 2.0.
  1. Exporta las tablas del sistema anterior a CSV (carpeta temporal protegida).
  2. Las carga con el ETL: catálogos, productos, existencias, clientes, usuarios e histórico de ventas.
  3. Borra los CSV (contienen datos de clientes).

  Lo usa el instalador (opción "Migrar datos") y el acceso directo del menú Inicio.
  Sin parámetros, pregunta los datos en pantalla. Se puede repetir sin duplicar (ETL idempotente).
#>
param(
  [string]$Servidor,
  [string]$BaseDatos,
  [string]$Codigo,
  [string]$Nombre,
  [string]$Usuario = '',
  [string]$ArchivoClave = '',
  [switch]$SinHistorico
)
$ErrorActionPreference = 'Stop'
# Abierto desde el menú Inicio: se vuelve a lanzar como administrador (lee la configuración protegida)
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  $reenviar = ($PSBoundParameters.GetEnumerator() | ForEach-Object { if ($_.Value -is [switch]) { "-$($_.Key)" } else { "-$($_.Key) `"$($_.Value)`"" } }) -join ' '
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $reenviar"
  exit
}
$Interactivo = -not $PSBoundParameters.ContainsKey('Servidor')   # abierto desde el menú Inicio
$codigoSalida = 0
$App   = Split-Path $PSScriptRoot -Parent
$Datos = Join-Path $env:ProgramData 'SPVI'
$Logs  = Join-Path $Datos 'logs'
$EnvFile = Join-Path $Datos 'config\.env'
$Node  = Join-Path $App 'runtime\node\node.exe'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
if (-not (Test-Path $EnvFile)) { throw 'SPVI no está instalado en este equipo.' }

if (-not $Servidor)  { $Servidor  = Read-Host 'Servidor SQL Server del sistema anterior (ej. .\SQLEXPRESS)' }
if (-not $BaseDatos) { $BaseDatos = Read-Host 'Base de datos (ej. dbSPuntoVentas)' }
if (-not $Codigo)    { $Codigo    = (Read-Host 'Código corto de la sucursal (ej. DEN)').ToUpper() }
if (-not $Nombre)    { $Nombre    = Read-Host 'Nombre de la sucursal (ej. Denisse)' }
$Clave = if ($ArchivoClave -and (Test-Path $ArchivoClave)) { (Get-Content $ArchivoClave -Raw).Trim() } else { '' }

Start-Transcript -Path (Join-Path $Logs "migracion-$Codigo-$(Get-Date -Format yyyyMMdd-HHmmss).log") | Out-Null
$Csv = Join-Path $env:TEMP "spvi-migracion-$(Get-Random)"
try {
  # 1. Respaldo previo de la base nueva (por si hay que repetir)
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'respaldo.ps1') -Motivo "antes-migracion-$Codigo"

  # 2. Exportar del sistema anterior (autenticación de Windows si no se indica usuario)
  New-Item -ItemType Directory -Force -Path $Csv | Out-Null
  icacls $Csv /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
  $exp = @{ Servidor = $Servidor; BaseDatos = $BaseDatos; Salida = $Csv }
  if ($Usuario) { $exp.Usuario = $Usuario; $exp.Clave = $Clave }
  & (Join-Path $App 'api\scripts\etl\exportar-legado.ps1') @exp

  # 3. Cargar en SPVI 2.0
  $env:DATABASE_URL = ((Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1).Substring(13))
  $argumentos = @((Join-Path $App 'api\dist-etl\scripts\etl\migrar-sucursal.js'), '--codigo', $Codigo, '--nombre', $Nombre, '--csv', $Csv)
  if ($SinHistorico) { $argumentos += '--sin-historico' }
  & $Node @argumentos
  if ($LASTEXITCODE -ne 0) { throw "La carga de datos terminó con errores (código $LASTEXITCODE)" }
  Write-Host "`nMigración de $Nombre ($Codigo) completada." -ForegroundColor Green
  Write-Host 'Los usuarios migrados deben recibir una contraseña nueva desde Administración › Usuarios.'
}
catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Detalle en $Logs"
  $codigoSalida = 1
}
finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item $Csv -Recurse -Force -ErrorAction SilentlyContinue   # los CSV tienen datos de clientes
  Stop-Transcript | Out-Null
}
if ($Interactivo) { Read-Host 'Presione Enter para cerrar' }
exit $codigoSalida
