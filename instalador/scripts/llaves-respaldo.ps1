<#
  CONFIGURAR RESPALDOS CIFRADOS (menú Inicio › SPVI).
  Crea el par de llaves: la PÚBLICA queda en este equipo (cierra los respaldos) y la PRIVADA,
  protegida con una frase, se entrega al dueño (abre los respaldos). Sin la llave privada y su
  frase, los respaldos no se pueden abrir: ni el ladrón de un disco, ni ALEXUS.
#>
param()
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

try {
  Write-Host "`n=== Respaldos cifrados de SPVI ===`n" -ForegroundColor Cyan
  if (Test-Path $Publica) {
    $actual = & $Node $Cripto huella --publica $Publica
    Write-Host "Ya hay llaves configuradas (huella $actual)." -ForegroundColor Yellow
    Write-Host 'Si crea llaves nuevas, los respaldos ANTERIORES seguirán abriéndose solo con la llave anterior.'
    if ((Read-Host '¿Crear llaves nuevas? (S/N)') -notmatch '^[sS]') { Pausa; exit }
  }
  Write-Host 'Elija una FRASE para proteger la llave de recuperación (mínimo 12 caracteres).'
  Write-Host 'Ejemplo de buena frase: varias palabras que solo usted recuerde. Anótela en un lugar seguro.' -ForegroundColor DarkGray
  do {
    $f1 = Texto-Plano (Read-Host 'Frase' -AsSecureString)
    $f2 = Texto-Plano (Read-Host 'Repita la frase' -AsSecureString)
    $valida = ($f1 -eq $f2) -and ($f1.Length -ge 12)
    if (-not $valida) { Write-Host 'Las frases no coinciden o tienen menos de 12 caracteres. Intente de nuevo.' -ForegroundColor Red }
  } until ($valida)

  $escritorio = [Environment]::GetFolderPath('Desktop')
  $privada = Join-Path $escritorio ("SPVI-llave-recuperacion-{0}-{1}.pem" -f $env:COMPUTERNAME, (Get-Date -Format 'yyyyMMdd-HHmm'))
  $nueva = Join-Path $Config 'respaldo-publica.nueva.pem'
  Remove-Item $nueva -Force -ErrorAction SilentlyContinue
  $env:SPVI_FRASE = $f1
  try {
    $salida = & $Node $Cripto generar --publica $nueva --privada $privada
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron crear las llaves' }
    # Prueba completa: cerrar y abrir un archivo de muestra con la llave y la frase recién creadas
    $muestra = Join-Path $env:TEMP "spvi-muestra-$(Get-Random)"
    Set-Content "$muestra.txt" 'prueba de respaldo' -Encoding ascii
    & $Node $Cripto cifrar --publica $nueva --entrada "$muestra.txt" --salida "$muestra.spvi"
    & $Node $Cripto descifrar --privada $privada --entrada "$muestra.spvi" --salida "$muestra.out"
    $okPrueba = ($LASTEXITCODE -eq 0) -and ((Get-Content "$muestra.out" -Raw).Trim() -eq 'prueba de respaldo')
    Remove-Item "$muestra.*" -Force -ErrorAction SilentlyContinue
    if (-not $okPrueba) { throw 'La prueba de cifrado falló: no se activaron las llaves' }
  } finally { Remove-Item Env:SPVI_FRASE -ErrorAction SilentlyContinue }

  if (Test-Path $Publica) { Move-Item $Publica (Join-Path $Config ("respaldo-publica-anterior-{0}.pem" -f (Get-Date -Format 'yyyyMMdd-HHmm'))) }
  Move-Item $nueva $Publica
  $huella = ($salida | ConvertFrom-Json).huella

  Write-Host "`n✔ Respaldos cifrados activados. Huella de la llave: $huella`n" -ForegroundColor Green
  Write-Host 'La LLAVE DE RECUPERACIÓN quedó en el escritorio:' -ForegroundColor Yellow
  Write-Host "  $privada"
  Write-Host "`nHaga AHORA estas tres cosas:" -ForegroundColor Yellow
  Write-Host '  1. Copie ese archivo a DOS lugares fuera de este equipo (por ejemplo, una memoria USB guardada'
  Write-Host '     en otro sitio y su correo o nube personal). Luego bórrelo del escritorio.'
  Write-Host '  2. Guarde la frase en un lugar distinto al archivo (gestor de contraseñas o papel en caja fuerte).'
  Write-Host '  3. Haga un "Simulacro de restauración" desde el menú Inicio para confirmar que todo funciona.'
  Write-Host "`nSin el archivo Y la frase, los respaldos NO se pueden abrir. Nadie puede recuperarlos por usted." -ForegroundColor Red
  Start-Process explorer.exe "/select,`"$privada`""
  if ((Read-Host "`n¿Hacer ahora el primer respaldo cifrado? (S/N)") -match '^[sS]') { & (Join-Path $PSScriptRoot 'respaldo.ps1') -Motivo manual }
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Pausa
