<#
  CONSOLA DE USUARIOS DE SPVI (en el servidor de la tienda).
  Crear un usuario con su rol, restablecer una contraseña (también la del administrador si la perdió),
  activar o desactivar usuarios y verlos. Funciona aunque el sistema no tenga licencia.
  Se abre desde: menú Inicio › SPVI › Consola de usuarios. Pide permisos de administrador de Windows,
  porque la configuración (con la clave de la base de datos) solo la pueden leer los administradores.
#>
param(
  [string]$EnvFile = '',  # pruebas: otra ruta de configuración
  [string]$Node = ''      # pruebas: otro ejecutable de Node
)
$ErrorActionPreference = 'Stop'

# En Windows, pedir permisos de administrador si no los tiene (se vuelve a abrir elevada)
if ($IsWindows -ne $false) {
  $yo = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
  }
}

$App = Split-Path $PSScriptRoot -Parent
if (-not $Node) { $Node = Join-Path $App 'runtime\node\node.exe' }
if (-not $EnvFile) { $EnvFile = Join-Path $env:ProgramData 'SPVI\config\.env' }
$Script = Join-Path (Join-Path $App 'api') (Join-Path 'dist-seed' (Join-Path 'prisma' 'usuarios.js'))
$linea = Get-Content $EnvFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $linea) { Write-Host "No encuentro la configuración de SPVI en $EnvFile" -ForegroundColor Red; Read-Host 'Pulse Enter para salir'; exit 1 }
$env:DATABASE_URL = $linea.Substring('DATABASE_URL='.Length)

function Consola([string[]]$Argumentos) { & $Node $Script @Argumentos; Write-Host '' }
function Pedir([string]$Texto, [switch]$Opcional) {
  do { $v = Read-Host $Texto; if ($null -eq $v) { $v = '' }; $v = $v.Trim() } while (-not $v -and -not $Opcional)
  return $v
}

try { $Host.UI.RawUI.WindowTitle = 'SPVI - Consola de usuarios' } catch { }
try {
  for (;;) {
    Write-Host '== SPVI: consola de usuarios ==' -ForegroundColor Cyan
    Write-Host '  1. Crear un usuario'
    Write-Host '  2. Restablecer la contraseña de un usuario'
    Write-Host '  3. Desactivar un usuario'
    Write-Host '  4. Activar un usuario'
    Write-Host '  5. Ver usuarios'
    Write-Host '  0. Salir'
    $opcion = Read-Host 'Elija una opción'
    switch ($opcion) {
      '1' {
        Consola @('roles'); Consola @('sucursales')
        $u = Pedir 'Usuario (ej. juan.perez)'
        $n = Pedir 'Nombre completo'
        $r = Pedir 'Rol o roles separados por coma (ej. CAJERO)'
        $s = Pedir 'Sucursal: número o código, separados por coma (Enter = la única que haya)' -Opcional
        $a = @('crear', '--usuario', $u, '--nombre', $n, '--rol', $r)
        if ($s) { $a += @('--sucursal', $s) }
        Consola $a
      }
      '2' { Consola @('listar'); Consola @('clave', '--usuario', (Pedir 'Usuario')) }
      '3' { Consola @('desactivar', '--usuario', (Pedir 'Usuario')) }
      '4' { Consola @('activar', '--usuario', (Pedir 'Usuario')) }
      '5' { Consola @('listar') }
      '0' { return }
      $null { return }
      default { Write-Host 'Opción no válida.' -ForegroundColor Yellow }
    }
  }
}
finally { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
