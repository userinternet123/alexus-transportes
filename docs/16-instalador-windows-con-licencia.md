# Instalador de Windows con licencia: paso a paso

## 0. Qué necesita
- **Una PC con Windows 10/11 de 64 bits** para compilar. Puede ser la misma donde correrá SPVI Central. Debe tener **Node.js 22**, **Git** e **Inno Setup 6**.
- **El proyecto completo**: portal, API con **todas** sus migraciones e `instalador/`.
- **Otra PC con Windows para probar la instalación**, de preferencia limpia. Una máquina virtual sirve.

## 1. Llaves de licencias (UNA sola vez, donde emitirá las licencias)
```bash
cd ~/migration/portalAdmin/api
npm run licencia:claves
```
- **Qué crea:** la llave privada en `~/.spvi-licencias/privada.pem` y la pública dentro de `src/modules/licencia/clave-publica.ts`.
- **Respalde `privada.pem` en DOS lugares fuera del equipo** (por ejemplo, una USB cifrada y un gestor de contraseñas). **Nunca** la suba a Git ni la envíe por correo.
  - Si se **pierde**: no podrá emitir ni renovar licencias. Generar otra invalida TODAS las emitidas.
  - Si se **filtra**: cualquiera podría crear licencias.
- **Desde ese momento su entorno de desarrollo también exige licencia.** Emítase una de desarrollo y actívela en **Configuración › Licencia y módulos**:
  ```bash
  npm run licencia:emitir -- --empresa "ALEXUS desarrollo" --nit CF --plan EMPRESARIAL --vence 2030-12-31 --agregar sinmarca
  ```

## 2. Ensayo en limpio de las migraciones (antes de cada versión)
Simula la base de una tienda nueva, donde se aplican **todas** las migraciones desde cero:
```bash
cd ~/migration/portalAdmin/api
ls -d prisma/migrations/*/ | wc -l ; ls prisma/migrations/*/migration.sql | wc -l   # deben dar el MISMO número
psql -U spvi -d spvi -c "CREATE DATABASE spvi_ensayo"
# Use su DATABASE_URL del .env, cambiando solo el nombre de la base al final por spvi_ensayo:
DATABASE_URL="postgresql://spvi:SU_CLAVE@localhost:5432/spvi_ensayo" npx --no-install prisma migrate deploy
DATABASE_URL="postgresql://spvi:SU_CLAVE@localhost:5432/spvi_ensayo" SEED_ADMIN_PASSWORD='Prueba2026' npm run db:seed
psql -U spvi -d spvi -c "DROP DATABASE spvi_ensayo"
```
Si los dos números no coinciden, falta un `migration.sql`. Puede ser la migración vacía antigua `20261030163936_acumulado_lotes_8_al_15`: si su carpeta no tiene `migration.sql`, borre la carpeta, porque ya la quitamos del registro. Si `migrate deploy` falla, **no compile**: pégueme el error.

## 3. Llevar el proyecto a la PC de compilación
1. **Archivos de dependencias al día:** en Termux ejecute `npm install` en el portal y en `api/`. El empaquetador usa `npm ci`, que exige que `package-lock.json` esté al día.
2. **Súbalo a un repositorio privado** (GitHub privado, por ejemplo):
   ```bash
   git add -A && git commit -m "Versión 2.1.0" && git push
   ```
   Confirme que `.env` y `privada.pem` **no** se suben (deben estar en `.gitignore` y fuera del repositorio).
3. **En la PC con Windows** cree esta estructura. El empaquetador espera el API dentro del portal:
   ```
   C:\SPVI\                 ← portal (package.json, src\ …)
   C:\SPVI\api\             ← copia de portalAdmin/api (con prisma\migrations)
   C:\SPVI\instalador\      ← carpeta del instalador (instalador-windows.zip)
   C:\SPVI\analitica\       ← motor analítico (spvi-analitica.zip / apps/analitica)
   ```
   La primera compilación descarga también Python embebido (python.org) y las librerías del motor (pypi.org): la PC de compilación necesita internet esa vez.
4. **Agregue al `package.json` del portal:** `"release": "powershell -NoProfile -ExecutionPolicy Bypass -File instalador/empaquetar.ps1 -Version"`.

## 4. Compilar
```powershell
cd C:\SPVI
npm run release -- 2.1.0
```
- **Resultado:** `instalador\salida\SPVI-Setup-2.1.0.exe` y su huella `.sha256`.
- **La primera vez** descarga unos 400 MB de componentes (Node portátil, PostgreSQL y otros) a `instalador\cache`.
- **Si un candado detiene la compilación**, el mensaje dice qué hacer. Sin llave pública **no** compila (protege contra entregar un sistema "todo abierto").

## 5. Emitir la licencia de una tienda
```bash
npm run licencia:emitir -- --empresa "Librería Denisse" --nit 1234567K --plan PROFESIONAL --vence 2027-11-30 --sucursales 2 --agregar giros
```
- **Qué produce:** un archivo `1234567K-PROFESIONAL.lic`, que es solo texto. Se puede enviar sin riesgo de que lo modifiquen: cualquier cambio la invalida.
- **Opciones:**
  - `--plan BASICO|PROFESIONAL|EMPRESARIAL`, `--sucursales N` y `--usuarios N`.
  - `--agregar giros` (campos por giro) y `--agregar sinmarca` (quitar "SPVI by ALEXUS", servicio mensual).
  - `--vence AAAA-MM-DD`: al vencer, el sistema baja al plan Básico sin perder datos. Para la licencia mensual, emita una nueva cada mes.

## 6. Instalar y activar en la PC de prueba
1. Ejecute `SPVI-Setup-2.1.0.exe` como administrador. Elija el puerto (8080) y la contraseña de `admin`.
2. Abra `http://localhost:8080`. Sin licencia, el sistema funciona limitado al plan Básico.
3. Vaya a **Configuración › Licencia y módulos**, pegue el texto del `.lic` (o elija el archivo) y pulse **Activar licencia**.

**Lista de validación:**
- **Licencia:** se activan los módulos del plan.
- **Límite de sucursales:** al pasarlo, crear una más da el aviso de la licencia.
- **Sucursal nueva:** se crea con su bodega y su caja.
- **Ventas:** una venta y una cotización en PDF y Word.
- **Caja:** el cuadre.
- **Respaldos:** el menú Inicio › SPVI › Simulacro de restauración.
- **Otras cajas:** desde otra computadora de la red, `http://IP-del-servidor:8080`.

## 7. Lo que esta versión todavía NO trae
- ~~Motor Python~~ **Ya incluido:** servicio `SPVI-Analitica` con Python embebido, solo en este equipo. Valide en la PC de prueba que en `services.msc` aparezca «SPVI Analitica» en ejecución y que en Temporadas funcione «Detectar temporadas».
- **FEL y pago en línea:** esperan credenciales.
- **Licencia sin atar al equipo:** la licencia no está ligada a la máquina. Un `.lic` copiado funcionaría en otra PC. Más adelante SPVI Central puede detectar dos instalaciones con la misma licencia.

## 8. SPVI Central en su propio equipo
Siga `apps/central/README.md`, sección «Opción recomendada: su dominio con túnel de Cloudflare»:
1. Instale Docker Desktop.
2. Cree el túnel `spvi-central` en Cloudflare y pegue su token.
3. Agregue las rutas `central.alexusgt.com` y `agentes.alexusgt.com`.
4. Inicie Central:
   ```powershell
   docker compose -f docker-compose.local.yml up -d --build
   ```
Active «Iniciar Docker Desktop al encender» para que Central vuelva sola después de un reinicio.
