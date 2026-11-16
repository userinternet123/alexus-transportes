<#
  REVISAR SEGURIDAD DEL EQUIPO (menú Inicio › SPVI). Solo lee: no cambia nada.
  Resultado también en C:\ProgramData\SPVI\logs\seguridad.json
#>
param()
$ErrorActionPreference = 'Stop'
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
$Datos = Join-Path $env:ProgramData 'SPVI'
$Resp = Join-Path $Datos 'respaldos'
$resultados = New-Object System.Collections.ArrayList
function Revisar([string]$tema, [string]$estado, [string]$detalle, [string]$solucion = '') {
  [void]$resultados.Add([ordered]@{ tema = $tema; estado = $estado; detalle = $detalle; solucion = $solucion })
  $color = @{ OK = 'Green'; AVISO = 'Yellow'; FALTA = 'Red' }[$estado]
  $marca = @{ OK = '[OK]   '; AVISO = '[AVISO]'; FALTA = '[FALTA]' }[$estado]
  Write-Host ("{0} {1}: {2}" -f $marca, $tema, $detalle) -ForegroundColor $color
  if ($solucion -and $estado -ne 'OK') { Write-Host "         → $solucion" -ForegroundColor DarkGray }
}
Write-Host "`n=== Seguridad de SPVI en $env:COMPUTERNAME ===`n" -ForegroundColor Cyan

# 1. Cifrado del disco (protege si roban o se pierde el equipo)
try {
  $v = Get-BitLockerVolume -MountPoint $env:SystemDrive
  if ($v.ProtectionStatus -eq 'On') { Revisar 'Cifrado del disco' 'OK' "BitLocker activo en $env:SystemDrive" }
  else { Revisar 'Cifrado del disco' 'FALTA' "El disco $env:SystemDrive no está cifrado" 'Windows Pro: active BitLocker. Windows Home: Configuración › Privacidad y seguridad › Cifrado de dispositivo. Guarde la clave de recuperación.' }
} catch {
  $txt = (manage-bde -status $env:SystemDrive 2>$null) -join ' '
  if ($txt -match 'Protection On|Protección activada') { Revisar 'Cifrado del disco' 'OK' 'Cifrado de dispositivo activo' }
  else { Revisar 'Cifrado del disco' 'AVISO' 'No se pudo confirmar el cifrado del disco' 'Revise Configuración › Privacidad y seguridad › Cifrado de dispositivo (o BitLocker en Windows Pro).' }
}

# 2. Respaldos
$estado = $null
if (Test-Path (Join-Path $Resp 'estado.json')) { $estado = Get-Content (Join-Path $Resp 'estado.json') -Raw | ConvertFrom-Json }
if (-not $estado) { Revisar 'Último respaldo' 'FALTA' 'No hay registro de respaldos' 'Ejecute "Respaldar base de datos ahora" desde el menú Inicio.' }
elseif (-not $estado.ok) { Revisar 'Último respaldo' 'FALTA' "Falló: $($estado.error)" 'Revise el registro y ejecute un respaldo manual.' }
else {
  $horas = [math]::Round(((Get-Date) - [datetime]$estado.fecha).TotalHours)
  if ($horas -le 26) { Revisar 'Último respaldo' 'OK' "Hace $horas h ($($estado.archivo))" } else { Revisar 'Último respaldo' 'FALTA' "Hace $horas h" '¿El equipo estuvo apagado a las 22:00? Revise la tarea "SPVI\Respaldo diario".' }
  if ($estado.cifrado) { Revisar 'Respaldos cifrados' 'OK' 'Se cifran con la llave del dueño' } else { Revisar 'Respaldos cifrados' 'FALTA' 'Los respaldos se guardan sin cifrar' 'Menú Inicio › SPVI › "Configurar respaldos cifrados".' }
  if ($estado.copiasFuera -ge 1) { Revisar 'Copia fuera del equipo' 'OK' "$($estado.copiasFuera) copia(s) externa(s) en el último respaldo" }
  else { Revisar 'Copia fuera del equipo' 'FALTA' 'Los respaldos solo están en este disco: si falla o lo roban, se pierden con él' 'Agregue un destino (USB o carpeta de OneDrive/Google Drive) en C:\ProgramData\SPVI\config\respaldo.json.' }
}

# 3. Simulacro de restauración reciente (un respaldo que nunca se probó no es un respaldo)
$log = Join-Path $Resp 'simulacros.log'
$ultimo = if (Test-Path $log) { Get-Content $log | Where-Object { $_ -match '\sOK\s' } | Select-Object -Last 1 } else { $null }
if ($ultimo) {
  $dias = [math]::Round(((Get-Date) - [datetime]($ultimo -split '\s+')[0]).TotalDays)
  if ($dias -le 35) { Revisar 'Simulacro de restauración' 'OK' "Último exitoso hace $dias días" } else { Revisar 'Simulacro de restauración' 'AVISO' "Último exitoso hace $dias días" 'Haga un simulacro al mes: menú Inicio › SPVI › "Simulacro de restauración".' }
} else { Revisar 'Simulacro de restauración' 'AVISO' 'Nunca se ha probado restaurar un respaldo' 'Menú Inicio › SPVI › "Simulacro de restauración".' }

# 4. La base de datos solo escucha dentro del equipo
$conexiones = Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue
if (-not $conexiones) { Revisar 'Base de datos' 'AVISO' 'PostgreSQL de SPVI no está escuchando en el puerto 5433' 'Revise el servicio SPVI-PostgreSQL.' }
elseif (@($conexiones | Where-Object { $_.LocalAddress -notin '127.0.0.1', '::1' }).Count) { Revisar 'Base de datos' 'FALTA' 'PostgreSQL acepta conexiones desde la red' "Debe escuchar solo en localhost (listen_addresses = 'localhost')." }
else { Revisar 'Base de datos' 'OK' 'Solo acepta conexiones desde este equipo' }

# 5. Antivirus y actualizaciones
try {
  $mp = Get-MpComputerStatus
  if ($mp.RealTimeProtectionEnabled) { Revisar 'Antivirus' 'OK' 'Protección en tiempo real activa' } else { Revisar 'Antivirus' 'FALTA' 'Protección en tiempo real desactivada' 'Active Seguridad de Windows › Protección contra virus.' }
} catch { Revisar 'Antivirus' 'AVISO' 'No se pudo consultar Microsoft Defender (¿otro antivirus instalado?)' }
$parche = Get-HotFix -ErrorAction SilentlyContinue | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1
if ($parche) {
  $dias = [math]::Round(((Get-Date) - $parche.InstalledOn).TotalDays)
  if ($dias -le 45) { Revisar 'Actualizaciones de Windows' 'OK' "Última hace $dias días" } else { Revisar 'Actualizaciones de Windows' 'AVISO' "Última hace $dias días" 'Instale las actualizaciones pendientes de Windows Update.' }
}

# 6. Configuración protegida (secretos de SPVI)
$acl = (Get-Acl (Join-Path $Datos 'config')).Access | Where-Object { $_.IdentityReference -match 'Usuarios|Users|Everyone|Todos' }
if ($acl) { Revisar 'Configuración protegida' 'FALTA' 'Usuarios comunes pueden leer las claves de SPVI' 'Vuelva a ejecutar el instalador para restablecer los permisos.' }
else { Revisar 'Configuración protegida' 'OK' 'Solo administradores y el sistema leen las claves' }

$faltan = @($resultados | Where-Object { $_.estado -eq 'FALTA' }).Count
New-Item -ItemType Directory -Force -Path (Join-Path $Datos 'logs') | Out-Null
([ordered]@{ fecha = (Get-Date).ToString('o'); equipo = $env:COMPUTERNAME; faltan = $faltan; resultados = $resultados } | ConvertTo-Json -Depth 4) |
  Set-Content (Join-Path $Datos 'logs\seguridad.json') -Encoding UTF8
Write-Host "`n$(if ($faltan) { "Hay $faltan punto(s) por corregir." } else { 'Todo en orden.' })" -ForegroundColor $(if ($faltan) { 'Yellow' } else { 'Green' })
Write-Host ''; Read-Host 'Presione Enter para cerrar' | Out-Null
