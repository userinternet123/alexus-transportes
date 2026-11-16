<#
  Acceso remoto seguro con Tailscale (VPN privada): permite abrir SPVI desde el
  celular o la casa del dueño sin abrir puertos en el router.
  - Instala Tailscale (incluido en el instalador) en modo desatendido.
  - Si se da una clave de autenticación (tskey-auth-...), une el equipo a la red.
  - Permite el puerto de SPVI solo desde la red de Tailscale (100.64.0.0/10).
#>
param([string]$ArchivoClaveAuth = '', [string]$Puerto = '')
$ErrorActionPreference = 'Stop'
# Abierto desde el menú Inicio: se vuelve a lanzar como administrador (lee la configuración protegida)
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  $reenviar = ($PSBoundParameters.GetEnumerator() | ForEach-Object { if ($_.Value -is [switch]) { "-$($_.Key)" } else { "-$($_.Key) `"$($_.Value)`"" } }) -join ' '
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $reenviar"
  exit
}
$App   = Split-Path $PSScriptRoot -Parent
$Datos = Join-Path $env:ProgramData 'SPVI'
$Msi   = Join-Path $App 'runtime\tailscale\tailscale-setup.msi'
$Ts    = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if (-not $Puerto) {
  $Puerto = ((Get-Content (Join-Path $Datos 'config\.env') | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1).Substring(5))
}

if (-not (Test-Path $Ts)) {
  Write-Host 'Instalando Tailscale...'
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$Msi`" /qn /norestart TS_UNATTENDEDMODE=always TS_NOLAUNCH=true" -Wait -PassThru
  if ($p.ExitCode -notin 0, 3010) { throw "No se pudo instalar Tailscale (código $($p.ExitCode))" }
}

if ($ArchivoClaveAuth -and (Test-Path $ArchivoClaveAuth)) {
  $clave = (Get-Content $ArchivoClaveAuth -Raw).Trim()
  if ($clave) {
    & $Ts up --authkey=$clave --unattended --hostname="spvi-$($env:COMPUTERNAME.ToLower())"
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo unir el equipo a Tailscale. Revise la clave de autenticación.' }
  }
}

# El tráfico de Tailscale llega por una interfaz que Windows puede clasificar como pública
if (-not (Get-NetFirewallRule -DisplayName 'SPVI (Tailscale)' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'SPVI (Tailscale)' -Direction Inbound -Protocol TCP -LocalPort $Puerto -RemoteAddress '100.64.0.0/10' -Action Allow -Profile Any | Out-Null
}

$ip = try { (& $Ts ip -4 2>$null | Select-Object -First 1) } catch { '' }
if ($ip) {
  [System.IO.File]::WriteAllText((Join-Path $Datos 'acceso-remoto.txt'), "Abra SPVI desde el celular (con Tailscale activo): http://$($ip):$Puerto`n", (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Acceso remoto: http://$($ip):$Puerto"
} else {
  Write-Host 'Tailscale instalado. Inicie sesión desde el ícono de Tailscale para completar la conexión.'
}
