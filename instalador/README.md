# Instalador de SPVI para Windows

Genera `SPVI-Setup-<versión>.exe`: un instalador que deja SPVI funcionando en una PC con Windows 10 u 11 (64 bits), sin instalar nada a mano.

## Qué instala

| Componente | Dónde | Detalle |
|---|---|---|
| Programa (API, portal, Node.js, PostgreSQL) | `C:\Program Files\SPVI` | Se reemplaza en cada actualización |
| Datos (base de datos, configuración, respaldos, registros) | `C:\ProgramData\SPVI` | **Nunca** se borra ni se reemplaza |
| Servicio `SPVI-PostgreSQL` | Puerto 5433, solo local | Base privada de SPVI; no choca con otro PostgreSQL |
| Servicio `SPVI-API` | Puerto 8080 (elegible) | Arranca con Windows y se reinicia solo si falla. Publica el API y el portal |
| Servicio `SPVI-Analitica` | Puerto 4100, **solo este equipo** | Motor analítico (Python embebido): detectar temporadas y qué comprar. Si fallara, SPVI funciona igual |
| Respaldo diario | 22:00 | `C:\ProgramData\SPVI\respaldos`, se conservan 14 días |
| Regla de firewall | Red privada | Permite abrir SPVI desde otras cajas: `http://IP-del-servidor:8080` |

Las contraseñas de la base y la clave de sesión (JWT) **se generan en cada equipo** al instalar. No viajan dentro del instalador.

## Opciones del asistente

| Opción | Qué hace |
|---|---|
| **Migrar datos del SPVI anterior** | Exporta de SQL Server (autenticación de Windows o usuario de SQL) y carga productos, existencias, clientes, usuarios e historial de ventas. Respalda la base antes y borra los archivos temporales al terminar. Se puede repetir desde *Inicio › SPVI › Migrar datos de SPVI anterior* sin duplicar. |
| **Instalar Tailscale** | Acceso remoto seguro desde el celular. Ver `docs/09-acceso-remoto-tailscale.md`. |

El acceso directo **SPVI** del escritorio abre el sistema como aplicación, en una ventana propia de Microsoft Edge sin barra del navegador. Si el equipo no tiene Edge, abre el navegador predeterminado.

## Generar una versión (PC de compilación)

Requisitos: Windows 10/11 x64, Node.js 22, Git e [Inno Setup 6](https://jrsoftware.org/isdl.php).

1. Copie la carpeta `instalador` a la raíz del portal (junto a `package.json`, con el API en `api/` y el motor analítico en `analitica/`).
2. Agregue este script al `package.json` del portal:
   ```json
   "release": "powershell -NoProfile -ExecutionPolicy Bypass -File instalador/empaquetar.ps1 -Version"
   ```
3. Genere la versión:
   ```powershell
   npm run release -- 2.1.0
   ```
   Resultado: `instalador\salida\SPVI-Setup-2.1.0.exe` y su huella `.sha256`.

La primera vez se descargan Node.js portátil, PostgreSQL, WinSW, Visual C++ y Tailscale a `instalador\cache` (unos 400 MB). **Todo queda dentro del instalador:** en la tienda no hay que descargar ni instalar nada aparte. Las siguientes versiones usan la caché.

**Antes de cada versión:** confirme que las migraciones nuevas estén en `api/prisma/migrations` y en Git. El instalador aplica `prisma migrate deploy`, que solo ejecuta migraciones ya creadas.

## Instalar (servidor de la tienda)

1. Ejecute `SPVI-Setup-x.y.z.exe` como administrador.
2. Elija el puerto (8080) y la contraseña del usuario `admin`.
3. Al terminar se abre `http://localhost:8080`. Entre con `admin` y defina su contraseña personal.

En las demás computadoras de la tienda abra `http://<IP-del-servidor>:8080`. No necesitan instalar nada.

## Actualizar

Ejecute el instalador de la versión nueva en el servidor. Automáticamente:
1. respalda la base (`respaldos\spvi-antes-de-<versión>-…dump`),
2. detiene los servicios y reemplaza el programa,
3. aplica las migraciones y los permisos nuevos,
4. vuelve a arrancar y verifica que el sistema responda.

## Restaurar un respaldo

```powershell
cd "C:\Program Files\SPVI\runtime\pgsql\bin"
.\pg_restore.exe -h localhost -p 5433 -U spvi -d spvi --clean "C:\ProgramData\SPVI\respaldos\<archivo>.dump"
```
La contraseña de `spvi` está en `C:\ProgramData\SPVI\config\.env` (solo administradores).

## Desinstalar

Desde *Configuración › Aplicaciones*. Se quitan los servicios, la tarea y la regla de firewall. **Los datos se conservan** en `C:\ProgramData\SPVI`: bórrelos a mano solo si está seguro.

## Problemas frecuentes

| Síntoma | Revise |
|---|---|
| El instalador avisa que la configuración no terminó | `C:\ProgramData\SPVI\logs\instalacion-*.log` |
| El sistema no abre | *Servicios de Windows*: `SPVI-PostgreSQL` y `SPVI-API` en ejecución. Registros en `C:\ProgramData\SPVI\logs` |
| No abre desde otra caja | La red debe ser **privada** en Windows y el puerto 8080 permitido por el antivirus |

## Licencias y candados del empaquetador

Antes de compilar, `empaquetar.ps1` revisa:

| Revisión | Si falla |
|---|---|
| La llave pública de licencias está en `api/src/modules/licencia/clave-publica.ts` | **No compila**: el sistema instalado quedaría en modo abierto (todo desbloqueado, sin licencia). Ejecute `npm run licencia:claves` una sola vez. |
| Cada carpeta de `api/prisma/migrations` trae su `migration.sql` | **No compila**: una instalación nueva fallaría. |
| Ninguna migración tiene `DROP TABLE` o `DROP COLUMN` | Compila, pero **advierte**: confirme que es intencional. |

`-ModoAbierto` genera un instalador sin licencia **solo para pruebas internas** (muestra una advertencia). Nunca lo entregue a una tienda.

Las licencias no van dentro del instalador: el mismo instalador sirve para todas las tiendas, y cada una activa la suya en **Configuración › Licencia y módulos** (o se la asigna SPVI Central).
