<#
.SYNOPSIS
  Exporta las tablas de SPVI 1.x (SQL Server) a CSV para migrarlas SIN conexión
  directa (por ejemplo, desde Termux o una laptop fuera de la red).

.EJEMPLOS
  # Autenticación SQL (usuario de solo lectura recomendado)
  powershell -ExecutionPolicy Bypass -File .\exportar-legado.ps1 `
    -Servidor "localhost,1433" -BaseDatos dbCSRUSElPilar -Usuario etl_ro -Clave "****"

  # Autenticación de Windows
  powershell -ExecutionPolicy Bypass -File .\exportar-legado.ps1 -Servidor ".\SQLEXPRESS" -BaseDatos dbCSRUSSiquinala

.NOTAS
  - Ejecutar con Windows PowerShell 5.1 (incluido en Windows 10/11).
  - Formato: UTF-8 sin BOM, separador coma, todo entre comillas, fechas ISO
    (yyyy-MM-ddTHH:mm:ss.fff), decimales con punto, booleanos True/False.
  - Por seguridad, la columna Passwd (contraseñas en TEXTO PLANO del sistema
    viejo) NO se exporta salvo que use -IncluirPasswords. Sin ella, los usuarios
    migrados quedan con contraseña aleatoria y el administrador la restablece.
  - Al terminar genera <Salida>.zip. Trátelo como información confidencial y
    elimínelo después de la migración.
#>
param(
  [Parameter(Mandatory = $true)] [string]$Servidor,
  [Parameter(Mandatory = $true)] [string]$BaseDatos,
  [string]$Usuario,
  [string]$Clave,
  [string]$Salida = ".\export-$BaseDatos",
  [switch]$IncluirPasswords
)

$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture

$tablas = @(
  'TTipoProducto', 'TGrupo', 'TNombreGenerico', 'TMarcaProducto', 'TPresentacion',
  'TProducto', 'TStock', 'TIngreso', 'TDetalleIngreso',
  'TPersona', 'TRol', 'TRolPersona', 'TIdentificacionPersona', 'TTipoIdentificacion',
  'TProveedor', 'TDescuento', 'TVenta', 'TDetalleVenta',
  'TPais', 'TDepartamento', 'TMunicipio', 'TColonia', 'TDireccion'
)

if ($Usuario) {
  $cs = "Server=$Servidor;Database=$BaseDatos;User Id=$Usuario;Password=$Clave;TrustServerCertificate=True"
} else {
  $cs = "Server=$Servidor;Database=$BaseDatos;Integrated Security=True;TrustServerCertificate=True"
}

New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$cn = New-Object System.Data.SqlClient.SqlConnection $cs
$cn.Open()
Write-Host "Conectado a $BaseDatos. Exportando en $Salida ..." -ForegroundColor Cyan

function Formatear($v) {
  if ($v -is [datetime]) { return $v.ToString('yyyy-MM-ddTHH:mm:ss.fff', $inv) }
  if ($v -is [bool]) { if ($v) { return 'True' } else { return 'False' } }
  if ($v -is [decimal] -or $v -is [double] -or $v -is [single]) { return $v.ToString($inv) }
  if ($v -is [byte[]]) { return '' }
  return [string]$v
}

foreach ($t in $tablas) {
  $cmd = $cn.CreateCommand()
  $cmd.CommandText = "SELECT * FROM [$t]"
  $cmd.CommandTimeout = 900
  try {
    $rd = $cmd.ExecuteReader()
  } catch {
    Write-Warning "No se pudo leer $t : $($_.Exception.Message)"
    continue
  }

  $ruta = Join-Path (Resolve-Path $Salida) "$t.csv"
  $sw = New-Object System.IO.StreamWriter($ruta, $false, (New-Object System.Text.UTF8Encoding($false)))

  $nombres = @()
  for ($i = 0; $i -lt $rd.FieldCount; $i++) { $nombres += $rd.GetName($i) }
  $sw.WriteLine((($nombres | ForEach-Object { '"' + $_ + '"' }) -join ','))

  $n = 0
  while ($rd.Read()) {
    $vals = New-Object string[] $rd.FieldCount
    for ($i = 0; $i -lt $rd.FieldCount; $i++) {
      if ($rd.IsDBNull($i) -or ($nombres[$i] -eq 'Passwd' -and -not $IncluirPasswords)) {
        $vals[$i] = ''
      } else {
        $vals[$i] = '"' + (Formatear $rd.GetValue($i)).Replace('"', '""') + '"'
      }
    }
    $sw.WriteLine(($vals -join ','))
    $n++
  }
  $sw.Close()
  $rd.Close()
  Write-Host ("  {0,-24} {1,10:N0} filas" -f $t, $n)
}
$cn.Close()

$zip = "$((Resolve-Path $Salida).Path).zip"
Compress-Archive -Path (Join-Path $Salida '*') -DestinationPath $zip -Force
Write-Host "Listo: $zip" -ForegroundColor Green
if ($IncluirPasswords) {
  Write-Warning 'El archivo contiene contraseñas en texto plano del sistema viejo. Elimínelo después de migrar.'
}
