# Compilar, probar y desarrollar SIN INTERNET: `kit.mjs`

**Un solo archivo de Node, sin dependencias.** Funciona en cualquier terminal (PowerShell, cmd, bash) y **no usa scripts `.ps1`**, que muchos bancos bloquean. Solo necesita **Node.js 22**. Reemplaza a `kit-desarrollo.ps1`.

**Para preparar el kit basta el `package.json` de cada proyecto**; no hace falta copiar el código.

## 1. En la PC CON internet (una vez; Windows x64 con Node 22)
```
node kit.mjs preparar --api C:\ruta\api\package.json --portal C:\ruta\portal\package.json
```
- **Cada ruta** puede ser el `package.json` o su carpeta.
- **Con `package-lock.json` al lado**: usa exactamente esas versiones. **Sin él**: resuelve las versiones de hoy y guarda el lock en el kit.
- **No toca su proyecto**: trabaja en una carpeta temporal.

Se crea `kit-desarrollo`:

| Contenido | Para qué |
|---|---|
| `kit.mjs` | una copia del script: **con llevar la carpeta basta** |
| `npm-cache\` | todos los paquetes |
| `proyectos\<api, portal>\` | el `package.json` y el `package-lock.json` usados |
| `prisma-motores\` | los motores de Prisma de esa PC |
| `kit.json` y `MANIFIESTO.txt` | versiones y huella SHA-256 de cada archivo, para el área de seguridad |

Si Prisma no se puede descargar desde esa PC, indique los archivos a mano con `--motores <carpeta>`.

## 2. En la PC SIN internet (Node 22 instalado, con el código que ya tenga allí)
**`--api` y `--portal` deben apuntar a su CÓDIGO** (la carpeta que tiene `src` y `tsconfig.json`), **no** a `kit-desarrollo\proyectos`: allí el kit solo guarda copias del `package.json` y el lock. Si ejecuta los comandos **dentro de la carpeta del código**, puede omitir `--api` y `--portal`: usa la carpeta actual.

Ejemplo, solo el backend, parado en la carpeta del API con `kit-desarrollo` dentro:
```
node kit-desarrollo/kit.mjs instalar
node kit-desarrollo/kit.mjs compilar
node kit-desarrollo/kit.mjs probar
node kit-desarrollo/kit.mjs prisma -- migrate deploy
```
Con rutas explícitas (funciona desde cualquier carpeta):
```
node kit-desarrollo\kit.mjs compilar --api C:\src\api --portal C:\src\portal
```
- **`instalar`**: instala los módulos desde el kit y prepara Prisma con sus motores. Si su código no tiene `package-lock.json`, **copia el del kit** para instalar las mismas versiones.
- **`compilar`** y **`probar`**: ejecutan los scripts `build`, `typecheck` y `test` que existan; el resumen marca ✔ o ✗ y el código de salida es 1 si algo falla.
- **`prisma`**: ejecuta Prisma con los motores del kit. Todo lo que va después de `--` es de Prisma. Necesita `DATABASE_URL` en el `.env` del API.
- **`entorno`**: muestra las variables para que `npx prisma ...` funcione en su terminal sin descargar nada.
- **`bd`**: levanta PostgreSQL (sección siguiente).

Si usa Git, agregue `kit-desarrollo/` a su `.gitignore`: la caché pesa cientos de MB.

## 3. PostgreSQL en Windows, sin instalar y sin administrador
**Si ya tiene un PostgreSQL disponible** (instalado, de un servidor o de otro equipo), no hace falta esto: use su `DATABASE_URL`.

**Si no**, el kit lleva un PostgreSQL portátil:

1. **En la PC con internet**, agréguelo al kit. No repite lo demás ni borra lo ya preparado:
   ```
   node kit.mjs preparar --postgres
   ```
   Baja el mismo zip de PostgreSQL que usa el instalador, más Visual C++. Si el banco usa un repositorio interno, use `--pg-url <url>`. También puede poner el zip a mano en `kit-desarrollo\postgresql\`, con nombre `postgresql-16.6-1-windows-x64-binaries.zip`.
2. **En la laptop del banco**, dentro de la carpeta del API:
   ```
   node kit-desarrollo/kit.mjs bd
   ```
   Extrae PostgreSQL, crea la base de desarrollo, la inicia en `127.0.0.1:5432` y crea la base `spvi`. Al final muestra la `DATABASE_URL`:
   ```
   postgresql://spvi:spvi@127.0.0.1:5432/spvi
   ```
3. **Póngala en el `.env` del API** y cree las tablas:
   ```
   node kit-desarrollo/kit.mjs prisma -- migrate deploy
   SEED_ADMIN_PASSWORD='MiClaveNueva2026' npm run db:seed
   ```
   (Sintaxis de Git Bash. En PowerShell: `$env:SEED_ADMIN_PASSWORD='MiClaveNueva2026'; npm run db:seed`).
4. **Apagarla:** `node kit-desarrollo/kit.mjs bd --detener`. Los datos se conservan; `bd` otra vez la vuelve a encender.

Opciones: `--puerto 5433` (si el 5432 está ocupado) y `--destino <carpeta>` (dónde guardar la base; por defecto `%LOCALAPPDATA%\SPVI-dev`).

**Cuidado**
- **No abra la terminal como administrador**: PostgreSQL no arranca así.
- **Si no arranca por falta de librerías**, instale `kit-desarrollo\postgresql\vc_redist.x64.exe`.
- **Es solo para desarrollo:** escucha en `127.0.0.1` y su usuario y clave son `spvi`. No use datos reales.

## Qué verifiqué
Con el `package-lock` **real** del API y la red cortada:

| Prueba | Resultado |
|---|---|
| Preparar desde **solo dos `package.json`** en una carpeta vacía (uno sin lock) | funcionó |
| Instalar con solo la carpeta del kit y el código sin lock | 614 y 78 módulos, cliente de Prisma generado |
| Compilar | API y portal compilados |
| Probar | typecheck sin errores y **18 pruebas en verde** |
| `prisma validate` con los motores del kit | válido |
| **Tu error** (`--api` apuntando a `kit-desarrollo/proyectos/api`) | ahora explica que ahí no está el código y qué hacer |
| Compilar **solo el backend** desde su carpeta, sin `--api`, con `kit-desarrollo` dentro del proyecto | compiló; el typecheck y las 18 pruebas siguen pasando |
| `bd`: descargar, extraer, crear, iniciar, crear la base | funcionó |
| `bd` repetido, apagar y volver a encender | no recrea nada y **conserva los datos** |
| La base de desarrollo | escucha solo en `127.0.0.1` y rechaza una contraseña incorrecta |
| `bd` con el puerto ocupado o sin PostgreSQL en el kit | mensaje claro |
| Una prueba que falla | marca ✗ y sale con código 1 |
| Un paquete que el kit no trae | avisa cuál y falla con el error de npm, sin salir a internet |
| Sin kit o sin indicar proyecto | mensajes claros |

## Qué NO pude verificar
- **Probé en Linux, no en Windows.** Ejecútelo en Windows con internet antes de llevarlo al banco.
- **La descarga de los motores reales de Prisma:** desde aquí no llego a su sitio, así que probé con motores de prueba. El comando que usa es el mismo script de instalación de Prisma; si falla, el script lo dice y puede usar `--motores`.
- **Los binarios de PostgreSQL de Windows.** La lógica de `bd` la probé con un PostgreSQL de Linux con la misma estructura de carpetas (`pgsql\bin`, `lib`, `share`, la que usa su instalador). Los `.exe` no pude ejecutarlos.
- **La descarga real** (`get.enterprisedb.com`, la misma dirección que ya usa `empaquetar.ps1`): desde mi entorno no llego. La función de descarga la probé con un servidor local.
- **Rutas con espacios en Windows:** están contempladas, pero no las probé.

## Límites a tener en cuenta
- **Un paquete nuevo** requiere volver a preparar el kit en la PC con internet. Sin internet no se puede instalar algo que no esté en el kit.
- **Prepare el kit en Windows x64**: algunos paquetes y los motores de Prisma son propios de cada sistema.
- **`prisma validate` y otros comandos de Prisma** necesitan `DATABASE_URL` (en el `.env` del API); sin ella, Prisma falla con "Environment variable not found".
