# SPVI Central

Panel del **proveedor** de SPVI, en su propia nube: clientes e instalaciones, **soporte** (tickets con captura), **monitoreo de errores**, **anuncios y avisos** y **versiones** (actualizaciones y parches de seguridad).

Cada tienda (SPVI con el agente) se conecta **solo hacia afuera**, por HTTPS, cada 6 horas o cuando ocurre algo. Si no hay internet, la tienda sigue vendiendo con normalidad. Central **nunca** recibe ventas, clientes ni precios de las tiendas.

## Desplegar (servidor Linux con Docker)

Requisitos: un VPS con Docker (2 GB de RAM bastan) y un dominio apuntando a su IP (por ejemplo, `central.sudominio.com`).

```bash
git clone <su-repositorio> && cd apps/central
cp .env.example .env
nano .env        # DOMINIO, POSTGRES_PASSWORD (también dentro de DATABASE_URL), JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
```
Abra `https://central.sudominio.com` y entre con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Caddy obtiene el certificado HTTPS solo.

La primera vez, las tablas se crean desde el esquema. Antes de cambiar el esquema por primera vez, cree la migración base en su PC de desarrollo (por ejemplo en Termux, con una base vacía `central`) y súbala a Git:
```bash
DATABASE_URL=postgresql://usuario:clave@localhost:5432/central npx prisma migrate dev --name inicial
```
Desde entonces, cada cambio se aplica solo al reconstruir el contenedor.

## Opción recomendada: su dominio con túnel de Cloudflare (alexusgt.com)

Central corre en su PC (Docker) y Cloudflare la publica **sin abrir puertos ni pagar hosting**, con dos direcciones:

| Dirección | Para quién | Protección |
|---|---|---|
| `central.alexusgt.com` | Su panel (solo usted y su equipo) | Cloudflare Access: pide un código que llega a su correo (gratis hasta 50 usuarios) |
| `agentes.alexusgt.com` | Las tiendas | Solo sirve `/api/agente`; cada tienda se identifica con su token. Central rechaza allí cualquier otra ruta |

**1. Crear el túnel.** En dash.cloudflare.com: *Networking › Tunnels › Create tunnel › Cloudflared*, nombre `spvi-central`. Copie el **token** (empieza con `eyJ`) del comando que muestra. **No ejecute ese comando**: el contenedor ya hace ese trabajo.

**2. Configurar `.env`** (copie `.env.example` si aún no lo hizo):
```
URL_PUBLICA=https://agentes.alexusgt.com
HOST_AGENTES=agentes.alexusgt.com
COMPOSE_PROFILES=cloudflare
CF_TUNNEL_TOKEN="eyJ..."
```

**3. Agregar las dos rutas** en el túnel (pestaña *Routes › Add route › Published application*):
- `central` + `alexusgt.com` → Service URL `http://central:3000`
- `agentes` + `alexusgt.com` → Service URL `http://central:3000`

**4. Iniciar:** `docker compose -f docker-compose.local.yml up -d --build`. En el panel de Cloudflare el túnel debe verse *Healthy*. Ojo: un túnel *Healthy* con la dirección de servicio mal escrita responde error 502.

**5. Proteger el panel con Access.** *Zero Trust › Access controls › Applications › Add an application › Self-hosted*: destino `central.alexusgt.com`, política **Allow** con *Emails* = su correo corporativo (donde recibirá el código), sesión de 24 h. **No proteja `agentes.alexusgt.com`**: las tiendas no pueden escribir un código.

**6. Verificar** (desde cualquier computadora):
```
curl -i https://agentes.alexusgt.com/api/panel/resumen          → 404 (el panel no se alcanza por la vía de las tiendas)
curl -i -X POST https://agentes.alexusgt.com/api/agente/latido  → 401 (pide el token de la tienda)
curl -i https://central.alexusgt.com                            → redirige al inicio de sesión de Cloudflare Access
```

**7. Tiendas:** en el `.env` del API de cada tienda, `CENTRAL_URL=https://agentes.alexusgt.com` y su `CENTRAL_TOKEN`. El panel ya muestra esa dirección al crear cada instalación.

No publique en ningún sitio ni correo la dirección `central.alexusgt.com`: es solo para su equipo.

## Opción sin servidor: en su PC con Tailscale (alternativa sin dominio)

Central corre en su propia PC y Tailscale la publica con HTTPS, **sin dominio, sin abrir puertos y sin pagar hosting**:
- **Panel privado:** solo se abre desde sus equipos dentro de su tailnet → `https://<pc>.<tailnet>.ts.net:8443`
- **Solo `/api/agente` es público** (Tailscale Funnel), para que las tiendas se reporten aunque estén en la red Tailscale de cada cliente. Siempre con su token.

Requisitos: Docker Desktop y Tailscale con sesión iniciada en la PC.

```powershell
cd apps\central
copy .env.example .env      # complete POSTGRES_PASSWORD (también en DATABASE_URL), JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
# En DATABASE_URL deje el host "db" (nombre del contenedor)
docker compose -f docker-compose.local.yml up -d --build
powershell -ExecutionPolicy Bypass -File .\publicar-tailscale.ps1
```
La primera vez, Tailscale muestra un enlace para **habilitar Funnel** en su tailnet: ábralo, acepte y vuelva a ejecutar el script. Al final verá las dos direcciones. Agregue `URL_PUBLICA=https://<pc>.<tailnet>.ts.net` al `.env` y vuelva a ejecutar `docker compose -f docker-compose.local.yml up -d`.

**Para que funcione siempre:**
- La PC debe quedar encendida: Configuración › Sistema › Energía › "Suspender: Nunca" (enchufada).
- Docker Desktop: "Start Docker Desktop when you sign in". Los contenedores se reinician solos.
- La configuración de Tailscale se conserva al reiniciar.
- **Respaldo diario:** programe `respaldo-central.ps1` (instrucciones dentro del archivo) y copie los respaldos fuera de la PC.

Si la PC se apaga, las tiendas **siguen vendiendo con normalidad**: solo dejan de enviar errores y tickets hasta que vuelva. El agente reintenta solo.

**Cuando crezca:** el mismo `docker-compose.yml` (con Caddy) corre en un VPS con dominio (sección anterior). Mueva la base con `pg_dump`/`pg_restore` y cambie `CENTRAL_URL` en las tiendas.

## Conectar una tienda

1. En el panel: **Clientes e instalaciones › Nuevo cliente** y luego **Nueva instalación**. Copie el token: se muestra una sola vez.
2. En el servidor de la tienda, agregue a `C:\ProgramData\SPVI\config\.env`:
   ```
   CENTRAL_URL=https://central.sudominio.com
   CENTRAL_TOKEN=<token>
   ```
3. Reinicie el servicio **SPVI-API**. En unos segundos la instalación aparece "En línea".

Si un token se filtra o se reinstala el servidor: **Nuevo token** (el anterior deja de funcionar). Si el cliente deja de pagar: **Revocar**.

## Qué hace cada sección

| Sección | Para qué |
|---|---|
| **Resumen** | Instalaciones en línea, tickets pendientes, errores nuevos y versiones en uso |
| **Soporte** | Tickets enviados desde el botón Ayuda del portal, con captura y datos técnicos. La respuesta le llega al usuario dentro de SPVI |
| **Errores** | Errores del API y del portal de todas las tiendas, agrupados (el mismo error cuenta una vez, con su número de repeticiones) |
| **Anuncios y avisos** | Avisos (mantenimiento, novedades) y publicidad por plan y ubicación (inicio o ingreso), con impresiones y clics. Nunca se muestran durante el cobro |
| **Versiones** | Publique cada instalador (enlace y SHA-256). Las tiendas ven el aviso; los parches de seguridad se marcan como prioritarios. Use primero el canal **pruebas** con una o dos tiendas |

## Seguridad

**Respaldos cifrados de Central.** Cree una vez las llaves. La frase (mínimo 12 caracteres) la elige usted y se pide sin mostrarse:
```powershell
cd apps\central
$s = Read-Host 'Frase (mínimo 12 caracteres)' -AsSecureString
$env:SPVI_FRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
docker run --rm -e SPVI_FRASE -v "${PWD}:/c" node:22-alpine node /c/respaldo-cripto.js generar --publica /c/respaldo-publica.pem --privada /c/llave-recuperacion-central.pem
Remove-Item Env:SPVI_FRASE
```
Desde ese momento `respaldo-central.ps1` guarda los respaldos cifrados (`.dump.spvi`). **Mueva `llave-recuperacion-central.pem` fuera de esta PC** (USB y gestor de contraseñas) y guarde la frase aparte.

Para abrir un respaldo (con la misma lectura segura de la frase en `$env:SPVI_FRASE`):
```powershell
docker run --rm -e SPVI_FRASE -v "<carpeta de la llave>:/c" -v "<carpeta del respaldo>:/r" node:22-alpine node /c/respaldo-cripto.js descifrar --privada /c/llave-recuperacion-central.pem --entrada /r/<archivo>.spvi --salida /r/central.dump
```
Necesita también `respaldo-cripto.js` en la carpeta de la llave (está en `apps/central`).
Use como destino (`-Destino`) una carpeta de OneDrive o Google Drive: así existe una copia fuera de la PC.
- Tokens de instalación: solo se guarda su huella (SHA-256); comparación en tiempo constante.
- Contraseñas del panel con Argon2; sesión de 10 horas; límite de intentos de ingreso.
- HTTPS obligatorio (Caddy). Respalde el volumen `datos` de PostgreSQL.
