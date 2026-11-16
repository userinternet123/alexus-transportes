# Instalar y compilar SIN INTERNET (red del banco) · Prisma · Salud financiera

## 1. Salud financiera: corregido
El error `BD_P2010` era mío: la consulta de sueldos buscaba la tabla `planillas` y en su base se llama **`rrhh_planillas`**. Mi base de prueba la tenía con el nombre que yo supuse, por eso nunca falló.

Para que no vuelva a pasar, ahora pruebo las consultas contra las **74 tablas generadas del esquema real** (con sus tipos de fecha, numéricos y estados). Las 9 de Salud financiera y las 6 de Qué comprar corren sin error.

Además, si una consulta así vuelve a fallar:
- **El registro del API** muestra el error real de PostgreSQL (por ejemplo, `relation "x" does not exist`).
- **El usuario** recibe un mensaje claro.

**Aplicar:** `api-acumulado-lotes-16-al-36.zip`. No trae migración nueva.

---

## 2. El instalador ya funciona SIN INTERNET en la tienda
Todo viaja dentro del `SPVI-Setup-x.y.z.exe`:
- Node, PostgreSQL y Python con las librerías del motor analítico;
- el API con sus dependencias y los **motores de Prisma para Windows**;
- el portal, Visual C++ y Tailscale.

Al instalar no se descarga nada. Agregué tres protecciones:
- **Candado al empaquetar:** si el paquete no trae los motores de Prisma, el empaquetado **se detiene**, porque la tienda necesitaría internet.
- **Sin consultas de actualización:** Prisma ya no busca actualizaciones al instalar ni en el servicio. En una red cerrada eso solo causaba esperas.
- **Mensaje de la llave:** el aviso de llave faltante ahora indica copiarla desde SPVI Central.

Lo que sí necesitaba internet era **armar** el instalador. Eso se resuelve con el kit.

---

## 3. Kit sin conexión
### a) Prepararlo (una vez, en una PC Windows CON internet)
En la carpeta del proyecto (la misma de `empaquetar.ps1`):
```powershell
powershell -ExecutionPolicy Bypass -File instalador\preparar-kit-offline.ps1
```
Queda en `instalador\kit-offline\`:

| Carpeta | Qué trae |
|---|---|
| `cache\` | Node, PostgreSQL, WinSW, Python, Visual C++, Tailscale |
| `npm-cache\` | todos los paquetes exactos del `package-lock` del API y del portal |
| `prisma-motores\` | `query_engine-windows.dll.node`, `schema-engine-windows.exe` y su versión |
| `python-ruedas\` | librerías del motor analítico para Windows |
| `MANIFIESTO.txt` | huella **SHA-256** de cada archivo, para que el área de seguridad verifique que nada cambió |

Cópielo completo (USB o carpeta compartida), **siguiendo la política del banco** para traer software.

> Use en las dos PC la **misma versión mayor de Node** (22). Si cambia un `package-lock.json` o `requirements.txt`, prepare el kit de nuevo.

### b) Compilar el backend en la laptop del banco
```powershell
powershell -ExecutionPolicy Bypass -File usar-kit-offline.ps1 -Kit D:\kit-offline -Proyecto C:\spvi\api -Compilar
powershell -ExecutionPolicy Bypass -File usar-kit-offline.ps1 -Kit D:\kit-offline -Proyecto C:\spvi\portal -Compilar
```
- **Paquetes:** instala todo **desde el kit** (`npm ci --offline`), sin tocar internet.
- **Prisma:** copia los motores y genera el cliente. Deja configuradas las variables de usuario `PRISMA_QUERY_ENGINE_LIBRARY` y `PRISMA_SCHEMA_ENGINE_BINARY`, así **`npx prisma migrate dev` o `deploy` tampoco intentan descargar**.

### c) Armar el instalador sin internet
```powershell
powershell -ExecutionPolicy Bypass -File instalador\empaquetar.ps1 -Version 2.1.0 -Kit D:\kit-offline
```
En este modo nada se descarga. Si al kit le falta algo, el script dice exactamente qué archivo.

---

## 4. Si prefiere que Prisma descargue a través de la red del banco
Los errores típicos dentro de una red corporativa son:
- `self-signed certificate in certificate chain`
- `unable to get local issuer certificate`
- `request to https://binaries.prisma.sh failed`

Casi siempre se deben a que el banco **inspecciona el tráfico HTTPS con su propio certificado**, o a que hay un **proxy**. Si el área de TI lo autoriza:
```powershell
# Certificado raíz del banco (pídalo a TI en formato .pem)
setx NODE_EXTRA_CA_CERTS "C:\certs\raiz-banco.pem"
npm config set cafile "C:\certs\raiz-banco.pem"
# Proxy (si lo hay)
setx HTTPS_PROXY "http://proxy.banco.local:8080"
npm config set proxy "http://proxy.banco.local:8080"
npm config set https-proxy "http://proxy.banco.local:8080"
```
Prisma respeta `HTTPS_PROXY` y `NODE_EXTRA_CA_CERTS`. Abra una terminal nueva después de `setx`.

Si el banco tiene un **repositorio interno** (Artifactory o Nexus), TI puede reflejar npm y los motores de Prisma. Se usa con `npm config set registry <url>` y `setx PRISMA_ENGINES_MIRROR <url>`.

**Nunca** use `NODE_TLS_REJECT_UNAUTHORIZED=0`: desactiva la seguridad de todas las conexiones.

---

## Qué verifiqué y qué no
- **Instalación de paquetes sin red:** con el `package-lock` real del API. Con npm apuntando a un registro **inexistente**, se instalaron los 874 paquetes desde el kit, idénticos a los de la instalación con internet. `argon2` trae su binario para Windows: no necesita compilarse.
- **Scripts:** revisé la sintaxis de los cuatro con PowerShell 7.4 y corregí un error de lógica en `preparar-kit-offline.ps1`.
- **No pude ejecutar en Windows:**
  - la preparación del kit;
  - la parte de Prisma con los motores reales (este entorno no puede descargarlos);
  - el empaquetado completo.

  Pruébelo primero en la PC de compilación con internet y luego en la laptop del banco. Si algo falla, envíeme la salida completa.
