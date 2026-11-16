; ─────────────────────────────────────────────────────────────────────────────
; Instalador de SPVI para Windows (Inno Setup 6: https://jrsoftware.org/isinfo.php)
; Lo compila empaquetar.ps1:  ISCC.exe /DAppVersion=2.1.0 SPVI.iss
;
; Instalación nueva : pide puerto y contraseña del administrador, instala
;                     PostgreSQL privado, API como servicio y portal.
; Actualización     : respalda la base, detiene servicios, reemplaza el
;                     programa y aplica migraciones. Los datos no se tocan.
; ─────────────────────────────────────────────────────────────────────────────
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppId "{{8F3C2A1E-5B7D-4E9A-9C1F-2D6B4A8E7F10}"

[Setup]
AppId={#AppId}
AppName=SPVI Punto de venta
AppVersion={#AppVersion}
AppVerName=SPVI {#AppVersion}
AppPublisher=ALEXUS Soluciones informáticas
SetupIconFile=alexus.ico
UninstallDisplayIcon={app}\alexus.ico
DefaultDirName={autopf}\SPVI
DefaultGroupName=SPVI
DisableProgramGroupPage=yes
OutputBaseFilename=SPVI-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
UninstallDisplayName=SPVI Punto de venta
CloseApplications=no
MinVersion=10.0

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "staging\app\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "alexus.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "cache\vc_redist.x64.exe"; DestDir: "{tmp}"

[Registry]
Root: HKLM; Subkey: "Software\SPVI"; ValueType: string; ValueName: "Puerto"; ValueData: "{code:Puerto}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\SPVI"; ValueType: string; ValueName: "Version"; ValueData: "{#AppVersion}"

[INI]
Filename: "{app}\SPVI.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{code:Puerto}"

[Icons]
; Con Microsoft Edge: SPVI abre como aplicación (ventana propia, sin barra del navegador).
; --kiosk-printing: el ticket sale directo a la impresora predeterminada, sin cuadro de diálogo.
Name: "{autodesktop}\SPVI"; Filename: "{code:RutaEdge}"; Parameters: "--app=http://localhost:{code:Puerto} --kiosk-printing"; IconFilename: "{app}\alexus.ico"; Check: EdgeInstalado
Name: "{group}\SPVI"; Filename: "{code:RutaEdge}"; Parameters: "--app=http://localhost:{code:Puerto} --kiosk-printing"; IconFilename: "{app}\alexus.ico"; Check: EdgeInstalado
Name: "{autodesktop}\SPVI"; Filename: "{app}\SPVI.url"; IconFilename: "{app}\alexus.ico"; Check: not EdgeInstalado
Name: "{group}\SPVI en el navegador"; Filename: "{app}\SPVI.url"
Name: "{group}\Migrar datos de SPVI anterior"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\migrar-legado.ps1"""
Name: "{group}\Configurar acceso remoto (Tailscale)"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\instalar-tailscale.ps1"""
Name: "{group}\Respaldar base de datos ahora"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\respaldo.ps1"" -Motivo manual"
Name: "{group}\Carpeta de respaldos"; Filename: "{commonappdata}\SPVI\respaldos"
Name: "{group}\Configurar respaldos cifrados"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\llaves-respaldo.ps1"""
Name: "{group}\Restaurar un respaldo"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\restaurar.ps1"""
Name: "{group}\Simulacro de restauración"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\restaurar.ps1"" -Prueba"
Name: "{group}\Consola de usuarios"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\consola.ps1"""; IconFilename: "{app}\alexus.ico"
Name: "{group}\Revisar seguridad del equipo"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\verificar-seguridad.ps1"""

[Run]
; La configuración (Visual C++, base de datos, servicios) se ejecuta en [Code] para poder avisar si falla
Filename: "http://localhost:{code:Puerto}"; Description: "Abrir SPVI ahora"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\desinstalar.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "QuitarServiciosSPVI"

[Code]
var
  PaginaConfig: TInputQueryWizardPage;
  PaginaOpciones: TInputOptionWizardPage;
  PaginaMigracion: TInputQueryWizardPage;
  PaginaTailscale: TInputQueryWizardPage;

function RutaEdge(Param: String): String;
begin
  Result := ExpandConstant('{commonpf32}\Microsoft\Edge\Application\msedge.exe');
end;

function EdgeInstalado: Boolean;
begin
  Result := FileExists(RutaEdge(''));
end;

function EsActualizacion: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonappdata}\SPVI\config\.env'));
end;

procedure InitializeWizard;
var Despues: Integer;
begin
  if not EsActualizacion then
  begin
    PaginaConfig := CreateInputQueryPage(wpSelectDir,
      'Configuración inicial',
      'Puerto y usuario administrador',
      'El sistema se abrirá en http://localhost:<puerto> y desde otras computadoras de la red local. ' +
      'El usuario "admin" deberá cambiar esta contraseña al ingresar por primera vez.');
    PaginaConfig.Add('Puerto del sistema:', False);
    PaginaConfig.Add('Contraseña del administrador (mínimo 10 caracteres, letras y números):', True);
    PaginaConfig.Add('Confirmar contraseña:', True);
    PaginaConfig.Values[0] := '8080';
  end;

  { Orden: carpeta › puerto y contraseña (solo instalación nueva) › opciones › migración › Tailscale }
  if PaginaConfig <> nil then Despues := PaginaConfig.ID else Despues := wpSelectDir;
  PaginaOpciones := CreateInputOptionPage(Despues, 'Opciones adicionales', 'Elija lo que desea hacer durante la instalación',
    'Puede hacerlo después desde el menú Inicio › SPVI.', False, False);
  PaginaOpciones.Add('Migrar los datos del SPVI anterior (SQL Server): productos, existencias, clientes, usuarios e historial de ventas');
  PaginaOpciones.Add('Instalar Tailscale para entrar a SPVI de forma segura desde el celular o fuera de la tienda');

  PaginaMigracion := CreateInputQueryPage(PaginaOpciones.ID, 'Migración de datos', 'Origen: SPVI anterior en SQL Server',
    'Deje el usuario vacío para conectarse con la cuenta de Windows. Se puede repetir sin duplicar datos.');
  PaginaMigracion.Add('Servidor SQL Server:', False);
  PaginaMigracion.Add('Base de datos:', False);
  PaginaMigracion.Add('Código corto de la sucursal (2 a 10 letras o números, ej. DEN):', False);
  PaginaMigracion.Add('Nombre de la sucursal (ej. Denisse):', False);
  PaginaMigracion.Add('Usuario de SQL Server (opcional):', False);
  PaginaMigracion.Add('Contraseña de SQL Server (opcional):', True);
  PaginaMigracion.Values[0] := '.\SQLEXPRESS';
  PaginaMigracion.Values[1] := 'dbSPuntoVentas';

  PaginaTailscale := CreateInputQueryPage(PaginaMigracion.ID, 'Acceso remoto', 'Tailscale',
    'Pegue una clave de autenticación (tskey-auth-...) generada en el panel de Tailscale, o déjela vacía para iniciar sesión después desde el ícono de Tailscale.');
  PaginaTailscale.Add('Clave de autenticación (opcional):', True);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = PaginaMigracion.ID then Result := not PaginaOpciones.Values[0];
  if PageID = PaginaTailscale.ID then Result := not PaginaOpciones.Values[1];
end;

function CodigoValido(S: String): Boolean;
var I: Integer;
begin
  Result := (Length(S) >= 2) and (Length(S) <= 10);
  for I := 1 to Length(S) do
    if not (((S[I] >= 'A') and (S[I] <= 'Z')) or ((S[I] >= 'a') and (S[I] <= 'z')) or ((S[I] >= '0') and (S[I] <= '9'))) then Result := False;
end;

function TieneLetraYNumero(S: String): Boolean;
var I: Integer; L, N: Boolean;
begin
  L := False; N := False;
  for I := 1 to Length(S) do
  begin
    if ((S[I] >= 'a') and (S[I] <= 'z')) or ((S[I] >= 'A') and (S[I] <= 'Z')) then L := True;
    if (S[I] >= '0') and (S[I] <= '9') then N := True;
  end;
  Result := L and N;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var P, Codigo: Integer;
begin
  Result := True;
  if (PaginaConfig <> nil) and (CurPageID = PaginaConfig.ID) then
  begin
    P := StrToIntDef(PaginaConfig.Values[0], 0);
    if (P < 1024) or (P > 65535) then
    begin MsgBox('Indique un puerto entre 1024 y 65535 (sugerido: 8080).', mbError, MB_OK); Result := False; exit; end;
    { ¿Otro programa (XAMPP, Apache, Tomcat…) ya usa ese puerto? }
    if Exec('powershell.exe', '-NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort ' + IntToStr(P) + ' -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"', '', SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 1) then
    begin
      MsgBox('El puerto ' + IntToStr(P) + ' ya lo usa otro programa en este equipo (por ejemplo XAMPP, Apache o Tomcat).' + #13#10 + 'Elija otro puerto, por ejemplo ' + IntToStr(P + 10) + '.', mbError, MB_OK);
      Result := False; exit;
    end;
    if (Length(PaginaConfig.Values[1]) < 10) or (not TieneLetraYNumero(PaginaConfig.Values[1])) then
    begin MsgBox('La contraseña debe tener al menos 10 caracteres, con letras y números.', mbError, MB_OK); Result := False; exit; end;
    if PaginaConfig.Values[1] <> PaginaConfig.Values[2] then
    begin MsgBox('Las contraseñas no coinciden.', mbError, MB_OK); Result := False; exit; end;
  end;
  if CurPageID = PaginaMigracion.ID then
  begin
    if (Trim(PaginaMigracion.Values[0]) = '') or (Trim(PaginaMigracion.Values[1]) = '') or (Trim(PaginaMigracion.Values[3]) = '') then
    begin MsgBox('Indique servidor, base de datos y nombre de la sucursal.', mbError, MB_OK); Result := False; exit; end;
    if not CodigoValido(PaginaMigracion.Values[2]) then
    begin MsgBox('El código de sucursal debe tener de 2 a 10 letras o números, sin espacios.', mbError, MB_OK); Result := False; exit; end;
  end;
end;

{ Puerto elegido (instalación nueva) o el registrado (actualización) }
function Puerto(Param: String): String;
begin
  if PaginaConfig <> nil then Result := PaginaConfig.Values[0]
  else if not RegQueryStringValue(HKLM, 'Software\SPVI', 'Puerto', Result) then Result := '8080';
end;

{ Solo se envía en instalación nueva: en actualización se conserva el del .env }
function PuertoNuevo(Param: String): String;
begin
  if PaginaConfig <> nil then Result := PaginaConfig.Values[0] else Result := '';
end;

{ Actualización: respaldar y detener servicios ANTES de reemplazar archivos }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Codigo: Integer;
begin
  Result := '';
  if EsActualizacion then
  begin
    WizardForm.StatusLabel.Caption := 'Respaldando la base de datos...';
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\scripts\respaldo.ps1" -Motivo antes-de-{#AppVersion}', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    Exec(ExpandConstant('{sys}\net.exe'), 'stop SPVI-Analitica', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    Exec(ExpandConstant('{sys}\net.exe'), 'stop SPVI-API', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    Exec(ExpandConstant('{sys}\net.exe'), 'stop SPVI-PostgreSQL', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Codigo: Integer; Parametros: String; DetalleError: AnsiString;
begin
  { La contraseña viaja al script en un archivo temporal que Inno borra al terminar }
  if (CurStep = ssInstall) and (PaginaConfig <> nil) then
    SaveStringToFile(ExpandConstant('{tmp}\spvi-admin.txt'), PaginaConfig.Values[1], False);

  if CurStep = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Instalando componentes de Microsoft Visual C++...';
    Exec(ExpandConstant('{tmp}\vc_redist.x64.exe'), '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, Codigo);

    WizardForm.StatusLabel.Caption := 'Configurando la base de datos y los servicios (puede tardar unos minutos)...';
    Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\configurar.ps1') + '"' +
      ' -Puerto "' + PuertoNuevo('') + '" -ArchivoClave "' + ExpandConstant('{tmp}\spvi-admin.txt') + '" -Version {#AppVersion}';
    if (not Exec('powershell.exe', Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo)) or (Codigo <> 0) then
    begin
      { Muestra en qué paso falló y por qué (lo escribe configurar.ps1) }
      if not LoadStringFromFile(ExpandConstant('{commonappdata}\SPVI\logs\ultimo-error.txt'), DetalleError) then
        DetalleError := 'El script no llegó a iniciar (código ' + IntToStr(Codigo) + ').';
      MsgBox('La configuración no terminó correctamente.' + #13#10#13#10 + DetalleError + #13#10#13#10 +
        'Registro completo: ' + ExpandConstant('{commonappdata}\SPVI\logs') + ' (carpeta oculta: Windows + R, escriba %ProgramData%\SPVI\logs).' + #13#10 +
        'Puede volver a ejecutar el instalador: retoma desde donde quedó.', mbError, MB_OK);
      exit;
    end;

    { Migración opcional desde el SPVI anterior }
    if PaginaOpciones.Values[0] then
    begin
      WizardForm.StatusLabel.Caption := 'Migrando los datos del SPVI anterior (puede tardar varios minutos)...';
      SaveStringToFile(ExpandConstant('{tmp}\sql.txt'), PaginaMigracion.Values[5], False);
      Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\migrar-legado.ps1') + '"' +
        ' -Servidor "' + PaginaMigracion.Values[0] + '" -BaseDatos "' + PaginaMigracion.Values[1] + '"' +
        ' -Codigo "' + Uppercase(PaginaMigracion.Values[2]) + '" -Nombre "' + PaginaMigracion.Values[3] + '"' +
        ' -Usuario "' + PaginaMigracion.Values[4] + '" -ArchivoClave "' + ExpandConstant('{tmp}\sql.txt') + '"';
      if (not Exec('powershell.exe', Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo)) or (Codigo <> 0) then
        MsgBox('SPVI quedó instalado, pero la migración de datos no terminó.' + #13#10 +
          'Revise ' + ExpandConstant('{commonappdata}\SPVI\logs') + ' y repítala desde Inicio › SPVI › Migrar datos de SPVI anterior.', mbInformation, MB_OK);
    end;

    { Acceso remoto opcional }
    if PaginaOpciones.Values[1] then
    begin
      WizardForm.StatusLabel.Caption := 'Instalando Tailscale para el acceso remoto...';
      SaveStringToFile(ExpandConstant('{tmp}\ts.txt'), PaginaTailscale.Values[0], False);
      Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\instalar-tailscale.ps1') + '"' +
        ' -ArchivoClaveAuth "' + ExpandConstant('{tmp}\ts.txt') + '"';
      if (not Exec('powershell.exe', Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo)) or (Codigo <> 0) then
        MsgBox('No se pudo configurar Tailscale. Puede hacerlo después desde Inicio › SPVI › Configurar acceso remoto.', mbInformation, MB_OK);
    end;
  end;
end;
