# Seguridad de los datos y recuperación ante pérdidas

## 1. Capas de protección

| Capa | Protege contra | Estado |
|---|---|---|
| Base de datos solo accesible desde el propio equipo (`localhost`), claves scram-sha-256 | Acceso desde la red | ✅ Desde la instalación |
| Configuración y claves de SPVI legibles solo por administradores | Empleados curiosos, programas sin permisos | ✅ Desde la instalación |
| Acceso remoto por Tailscale (cifrado de extremo a extremo) | Espionaje en internet o en wifi públicos | ✅ |
| Contraseñas con Argon2, permisos por rol, costos solo para gerencia, auditoría | Abuso interno | ✅ |
| **Respaldos cifrados con llave del dueño** | Robo de respaldos o de copias en la nube | ✅ **Nuevo** |
| **Respaldos verificados, copias fuera del equipo y generaciones** | Disco dañado, robo, ransomware, borrado | ✅ **Nuevo** |
| **Simulacro de restauración** | Respaldos que "existen" pero no sirven | ✅ **Nuevo** |
| **Cifrado del disco** (BitLocker / Cifrado de dispositivo) | Robo o pérdida del equipo | ⚠️ Se activa en Windows (ver 3) |

## 2. Cómo funcionan los respaldos cifrados

- **Cifrado híbrido:** cada respaldo usa una llave AES-256-GCM nueva, envuelta con la **llave pública RSA-4096** del dueño.
- **El servidor solo tiene la llave pública:** puede cerrar respaldos, pero **no abrirlos**. Aunque roben el equipo o una copia, no pueden leer los respaldos.
- **La llave privada** (protegida con una frase) la guarda el dueño en **dos lugares** fuera del equipo.
- **Detecta manipulaciones:** cualquier byte alterado, el encabezado modificado o un archivo cortado se rechaza.
- **Pruebas:** 16 pruebas, entre ellas frase equivocada, llave de otra tienda, byte alterado, encabezado manipulado, archivo cortado y archivo vacío.

**Privacidad:** los respaldos van a destinos **del propio cliente** (su USB, su OneDrive o Google Drive). ALEXUS no los recibe. Esto cumple lo que promete el sitio: *"Tus datos se quedan en tu negocio"*.

## 3. Lo que hace cada tienda al instalar (lista de verificación)

1. **Cifrar el disco**
   - **Windows Pro:** BitLocker en la unidad C:.
   - **Windows Home:** *Configuración › Privacidad y seguridad › Cifrado de dispositivo*. Requiere TPM 2.0, Secure Boot y una cuenta Microsoft, donde queda la clave de recuperación.
   - **Guardar la clave de recuperación de 48 dígitos** fuera del equipo.
2. **Menú Inicio › SPVI › Configurar respaldos cifrados.** El dueño elige su frase. La llave de recuperación queda en el escritorio: copiarla a una memoria USB guardada en **otro lugar** y a su correo o nube personal, y **borrarla del escritorio**.
3. **Copias fuera del equipo:** crear `C:\ProgramData\SPVI\config\respaldo.json`:
   ```json
   { "destinos": ["E:\\SPVI-respaldos", "C:\\Users\\Dueño\\OneDrive\\SPVI-respaldos"] }
   ```
   Un destino desconectado (por ejemplo, el USB) no detiene el respaldo: se reporta en el estado.
4. **Simulacro de restauración** el mismo día. Debe decir "SIMULACRO EXITOSO".
5. **Revisar seguridad del equipo:** todo en [OK].

## 4. La regla 3-2-1

**3** copias de los datos, en **2** medios distintos, con **1** fuera del negocio:

- **Copia 1:** la base en el equipo.
- **Copia 2:** el respaldo diario en el equipo, para restaurar rápido.
- **Copia 3:** USB o nube personal del dueño, que sobrevive a un robo, un incendio o el ransomware.

**Contra el ransomware** conviene que el USB no esté conectado siempre (por ejemplo, dos memorias que se alternan cada semana) o una nube con **historial de versiones** (OneDrive y Google Drive lo tienen).

## 5. Objetivos de recuperación

| Indicador | Valor actual | Significado |
|---|---|---|
| **RPO** (cuántos datos se pueden perder) | Hasta 24 h | Respaldo diario a las 22:00, más uno antes de cada actualización |
| **RTO** (cuánto tarda volver a vender) | 1 a 2 h | Instalar SPVI en un equipo nuevo y restaurar |

Para negocios con muchas ventas se puede bajar el RPO a minutos con archivado continuo de PostgreSQL (WAL). Ver la fase 2.

## 6. Qué hacer ante cada pérdida

| Situación | Qué hacer |
|---|---|
| **Borraron o dañaron datos por error** | *Restaurar un respaldo* con el de la noche anterior. Antes de reemplazar, SPVI guarda lo actual |
| **Actualización fallida** | Restaurar el respaldo `antes-de-<versión>` que crea el instalador |
| **Disco dañado** | Equipo nuevo: instalar SPVI, copiar el último `.spvi` desde el USB o la nube, y *Restaurar un respaldo* con la llave y la frase |
| **Robo del equipo** | Igual que disco dañado. Con el disco cifrado, el ladrón no puede leer nada. Revocar el acceso Tailscale del equipo robado y cambiar las contraseñas de SPVI |
| **Ransomware** | No pagar. Formatear, reinstalar Windows y SPVI, y restaurar desde una copia **no conectada** o desde el historial de versiones de la nube |
| **Se perdió la llave privada o la frase** | Los respaldos cifrados existentes **no se pueden abrir**. Crear llaves nuevas de inmediato. La base actual sigue intacta |

**Las restauraciones son "todo o nada":** si algo falla a la mitad, la base queda exactamente como estaba.

## 7. Rutina mensual (5 minutos por tienda)

- [ ] *Revisar seguridad del equipo*: todo en [OK].
- [ ] *Simulacro de restauración* con el respaldo más reciente.
- [ ] Confirmar que el USB o la nube tienen respaldos recientes.
- [ ] Windows Update al día.

## 8. Fase 2 (siguientes lotes)

- **Cifrado de campos sensibles en la base:**
  - credenciales del certificador FEL;
  - salarios y cuentas bancarias de RRHH.

  Se cifrarán dentro de la aplicación con una llave propia del servidor. No se cifran el NIT ni los nombres, porque el punto de venta los busca al instante.
- **Estado de los respaldos en SPVI Central:** el agente reportará "respaldo OK o fallido" y la fecha del último simulacro, nunca los datos. Así ALEXUS ve qué tiendas tienen respaldos fallando antes de que sea un problema.
- **HTTPS dentro de la red local**, para cajas que entran desde otras computadoras de la tienda.
- **Recuperación a un punto en el tiempo** (WAL) para clientes con alto volumen.

## 9. SPVI Central (servidor de ALEXUS)

Usa el mismo cifrado (`respaldo-central.ps1` + `respaldo-cripto.js`), con su propia llave de ALEXUS. Detalles en `apps/central/README.md`, sección *Seguridad*.
