<#
  RESPALDO DE SPVI (lo usan la tarea diaria de las 22:00, el menú Inicio y el instalador antes de actualizar).
    1. pg_dump de la base           4. Copia fuera de este disco (USB, carpeta de OneDrive/Google Drive)
    2. Verifica que se pueda leer   5. Conserva por generaciones: diarios, semanales y mensuales
    3. Lo cifra (si hay llave)      6. Deja el estado en respaldos\estado.json
  Configuración opcional: C:\ProgramData\SPVI\config\respaldo.json
    { "destinos": ["E:\\SPVI-respaldos", "C:\\Users\\Dueño\\OneDrive\\SPVI-respaldos"],
      "conservarDiarios": 14, "conservarSemanales": 8, "conservarMensuales": 12 }
  Cifrado: se activa al crear las llaves con "Configurar respaldos cifrados" (llaves-respaldo.ps1).
  Restaurar: restaurar.ps1
#>
param([string]$Motivo = 'diario', [int]$Conservar = 0)
$ErrorActionPreference = 'Stop'
# Abierto desde el menú Inicio: se vuelve a lanzar como administrador (lee la configuración protegida)
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  $reenviar = ($PSBoundParameters.GetEnumerator() | ForEach-Object { if ($_.Value -is [switch]) { "-$($_.Key)" } else { "-$($_.Key) `"$($_.Value)`"" } }) -join ' '
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $reenviar"
  exit
}
$App     = Split-Path $PSScriptRoot -Parent
$Datos   = Join-Path $env:ProgramData 'SPVI'
$Resp    = Join-Path $Datos 'respaldos'
$Config  = Join-Path $Datos 'config'
$EnvFile = Join-Path $Config '.env'
$Publica = Join-Path $Config 'respaldo-publica.pem'
$Node    = Join-Path $App 'runtime\node\node.exe'
$Cripto  = Join-Path $PSScriptRoot 'respaldo-cripto.js'
$PgBin   = Join-Path $App 'runtime\pgsql\bin'
$Estado  = Join-Path $Resp 'estado.json'
if (-not (Test-Path $EnvFile)) { exit 0 }   # aún no instalado
New-Item -ItemType Directory -Force -Path $Resp | Out-Null

# Configuración (con valores por defecto)
$cfg = [ordered]@{ destinos = @(); conservarDiarios = 14; conservarSemanales = 8; conservarMensuales = 12; conservarOtros = 10 }
$rutaCfg = Join-Path $Config 'respaldo.json'
if (Test-Path $rutaCfg) {
  $leido = Get-Content $rutaCfg -Raw | ConvertFrom-Json
  foreach ($p in $leido.PSObject.Properties) { $cfg[$p.Name] = $p.Value }
}
if ($Conservar -gt 0) { $cfg.conservarDiarios = $Conservar }

# Generaciones: el día 1 del mes es "mensual"; los domingos, "semanal"
if ($Motivo -eq 'diario') {
  $hoy = Get-Date
  if ($hoy.Day -eq 1) { $Motivo = 'mensual' } elseif ($hoy.DayOfWeek -eq [DayOfWeek]::Sunday) { $Motivo = 'semanal' }
}
$sello = Get-Date -Format 'yyyyMMdd-HHmmss'
$tmp = Join-Path $Resp "_en-proceso-$sello.dump"

function Guardar-Estado($datos) {
  ($datos | ConvertTo-Json -Depth 4) | Set-Content -Path $Estado -Encoding UTF8
}
function Podar([string]$Carpeta, [string]$Clase, [int]$Cuantos) {
  Get-ChildItem $Carpeta -File -Filter "spvi-$Clase-*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.spvi', '.dump' } |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip $Cuantos |
    ForEach-Object { Remove-Item $_.FullName -Force; Remove-Item "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue }
}

try {
  $url = (Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1).Substring(13) -replace '\?schema=public', ''

  # 1. Respaldo
  & (Join-Path $PgBin 'pg_dump.exe') --dbname=$url -F c -f $tmp
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump no pudo respaldar la base' }

  # 2. Verificación: el archivo se lee completo (detecta respaldos truncados o dañados)
  & (Join-Path $PgBin 'pg_restore.exe') --list $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El respaldo generado no se puede leer' }

  # 3. Cifrado (si el dueño ya configuró sus llaves)
  $cifrado = Test-Path $Publica
  if ($cifrado) {
    $final = Join-Path $Resp "spvi-$Motivo-$sello.spvi"
    & $Node $Cripto cifrar --publica $Publica --entrada $tmp --salida $final
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo cifrar el respaldo' }
    Remove-Item $tmp -Force
  } else {
    $final = Join-Path $Resp "spvi-$Motivo-$sello.dump"
    Move-Item $tmp $final
    Write-Warning 'Respaldo SIN CIFRAR: configure las llaves con "Configurar respaldos cifrados".'
  }
  $hash = (Get-FileHash $final -Algorithm SHA256).Hash.ToLower()
  $nombre = Split-Path $final -Leaf
  Set-Content "$final.sha256" "$hash  $nombre" -Encoding ascii

  # 4. Copias fuera de este disco (un destino ausente, como un USB desconectado, no detiene el respaldo)
  $copias = @()
  foreach ($d in @($cfg.destinos)) {
    if (-not $d) { continue }
    try {
      New-Item -ItemType Directory -Force -Path $d | Out-Null
      Copy-Item $final, "$final.sha256" -Destination $d -Force
      $copia = Join-Path $d $nombre
      if ((Get-FileHash $copia -Algorithm SHA256).Hash.ToLower() -ne $hash) { throw 'la copia no coincide con el original' }
      Podar $d 'diario' $cfg.conservarDiarios; Podar $d 'semanal' $cfg.conservarSemanales; Podar $d 'mensual' $cfg.conservarMensuales
      $copias += [ordered]@{ ruta = $d; ok = $true }
    } catch {
      $copias += [ordered]@{ ruta = $d; ok = $false; error = $_.Exception.Message }
      Write-Warning "No se pudo copiar a $d : $($_.Exception.Message)"
    }
  }

  # 5. Generaciones en este equipo (los de "antes de actualizar" y manuales: los últimos 10)
  Podar $Resp 'diario' $cfg.conservarDiarios; Podar $Resp 'semanal' $cfg.conservarSemanales; Podar $Resp 'mensual' $cfg.conservarMensuales
  foreach ($otro in @('manual', 'antes-de-*', 'antes-de-restaurar')) { Podar $Resp $otro $cfg.conservarOtros }

  # 6. Estado (lo leen el diagnóstico de seguridad y, más adelante, la consola de soporte)
  Guardar-Estado ([ordered]@{
    fecha = (Get-Date).ToString('o'); ok = $true; archivo = $nombre; bytes = (Get-Item $final).Length
    cifrado = $cifrado; sha256 = $hash; copias = $copias
    copiasFuera = @($copias | Where-Object { $_.ok }).Count
  })
  Write-Host "Respaldo listo: $final$(if (-not $cifrado) { ' (SIN CIFRAR)' })"
  if (-not @($cfg.destinos).Count) { Write-Warning 'El respaldo solo está en este equipo. Agregue un destino externo en respaldo.json.' }
} catch {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  Guardar-Estado ([ordered]@{ fecha = (Get-Date).ToString('o'); ok = $false; error = $_.Exception.Message })
  Write-Error "Falló el respaldo: $($_.Exception.Message)"
  exit 1
}
