# Lista de validación de todo lo acumulado

Tiempo estimado: **45 a 60 minutos**. Vaya en orden y marque cada casilla. Si algo falla, **deténgase en ese punto** y envíeme lo que indica la sección 7: no siga aplicando cosas encima de un error.

Paquetes vigentes (cada uno reemplaza a todos los anteriores):

| Parte | Paquete |
|---|---|
| Servidor (API) | `api-acumulado-lotes-16-al-34.zip` |
| Portal | `frontend-acumulado-lotes-16-al-39.zip` |
| Motor analítico | `spvi-analitica.zip` |
| SPVI Central | `spvi-central.zip` |

---

## 0. Respaldo (5 min): no se lo salte
```bash
pg_dump -U spvi -d spvi -Fc -f ~/respaldo-antes-validacion-$(date +%Y%m%d-%H%M).dump
cp -r ~/migration ~/migration-respaldo-$(date +%Y%m%d)
ls -la ~/respaldo-antes-validacion-*.dump   # debe pesar más de 0 bytes
```
- [ ] Respaldo de la base creado
- [ ] Copia de la carpeta del proyecto creada

---

## 1. Servidor (API)
```bash
cd ~/migration/portalAdmin/api
unzip -o /sdcard/Download/api-acumulado-lotes-16-al-34.zip
npm install
npx --no-install prisma migrate dev --create-only --name validacion
grep -E "^(CREATE|ALTER|DROP)" prisma/migrations/*_validacion/migration.sql
```

### Revise el SQL antes de aplicarlo
Debe contener **solo** cosas de esta lista. Si ya había aplicado alguna migración antes, verá **una parte** de la lista, y eso está bien.

| Tipo | Lo que puede aparecer |
|---|---|
| Tipos nuevos | `CREATE TYPE "EstadoPedido"`, `"MedioGasto"`, `"EstadoGasto"` |
| Tablas nuevas | `temporadas`, `temporadas_alcance`, `plantillas_analiticas`, `tableros_analiticos`, `analitica_compartida`, `uso_diario`, `opiniones`, `proveedores_producto`, `pedidos_compra`, `pedidos_compra_detalle`, `categorias_gasto`, `gastos` |
| Columnas nuevas | `productos.por_conseguir`; `ventas.reutilizable`, `ventas.nombre_lista`, `ventas.compradores_esperados` |
| Complementos | `CREATE INDEX` / `CREATE UNIQUE INDEX` y `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` de esas tablas |

- [ ] **No hay ningún `DROP`.** Si hay uno, **NO siga**: envíeme el archivo `migration.sql` completo.
- [ ] No aparece nada fuera de la lista. Si aparece algo distinto, envíeme el SQL antes de seguir.

```bash
npx --no-install prisma migrate dev
npm run typecheck
SEED_ADMIN_PASSWORD='MiClaveNueva2026' npm run db:seed
```
- [ ] La migración se aplicó sin errores
- [ ] `typecheck`: **0 errores**
- [ ] `db:seed` terminó (agrega permisos nuevos, áreas y puestos básicos si no tenía)
- [ ] Reinicié el API y arrancó sin errores rojos

En Termux verá el aviso **«Licencias en MODO ABIERTO»**: es normal mientras no pegue la llave de Central.

---

## 2. Motor analítico (Python)
En la carpeta donde lo tiene (guía 15):
```bash
unzip -o /sdcard/Download/spvi-analitica.zip
cd analitica && pip install -r requirements.txt
./iniciar.sh
curl -s http://127.0.0.1:4100/salud   # desde otra terminal: debe decir "ok"
```
- [ ] El motor responde `ok`

---

## 3. Portal
```bash
cd ~/migration/src
unzip -o /sdcard/Download/frontend-acumulado-lotes-16-al-39.zip
node verificar-imports.mjs
```
- [ ] `verificar-imports`: todo en ✔
- [ ] Reinicié el portal y en el navegador recargué con **Ctrl+F5**, para no quedarme con la versión vieja en caché

---

## 4. Pruebas por pantalla

### A. Entrada y caja
- [ ] Entro con `admin`. Como administrador, la primera vez aparece **«Ayúdenos a mejorar SPVI»**: elija «Sí» o «No» y, si quiere, llene el perfil del negocio.
- [ ] **Ventas** con una caja abierta de ayer: en lugar del punto de venta sale **«Su caja es de un día anterior»** con los pasos. «Ir a cerrar la caja» lleva al cuadre.
- [ ] Cierro esa caja, abro la de hoy y vuelvo a Ventas: funciona normal.

### B. Formularios y catálogos (validación nueva)
- [ ] **Recursos humanos › Áreas de la empresa**: aparecen las 4 básicas (si no había creado ninguna).
- [ ] **Puestos › Agregar**: la lista «Área» muestra las áreas.
- [ ] **Empleados › Agregar** y pulse **Crear** sin llenar nada: los campos obligatorios quedan **en rojo con su mensaje debajo**, arriba sale el resumen y no se guarda nada.
- [ ] Empleado con NIT **«CF»**: dice que aquí se necesita un NIT real.
- [ ] Empleado con DPI de 12 dígitos: dice «lleva 12». Con 13 dígitos y lo demás bien, **se guarda**.
- [ ] **Clientes › Nuevo** y Guardar vacío: marca NIT («o CF si no tiene») y Nombres. Con NIT `CF` se guarda.
- [ ] **Productos › Nuevo** y Guardar vacío: marca 5 datos. El botón Guardar **no** está gris.
- [ ] **Usuarios › Nuevo** y Guardar vacío: marca usuario, nombre, roles y sucursales.
- [ ] Si el servidor rechaza algo, el formulario **sigue abierto con lo escrito** y el aviso queda bajo el campo.

### C. Cotizaciones, listas y productos por conseguir
- [ ] En el punto de venta, **modo cotización**: aparecen «+ Producto que no tenemos» y «Lista reutilizable».
- [ ] Agrego un producto por conseguir (nombre y precio): entra a la cotización.
- [ ] Marco «Lista reutilizable», le pongo nombre y alumnos, y guardo la cotización.
- [ ] En **venta** normal, intento vender ese producto por conseguir: dice que todavía no se ha conseguido.
- [ ] **Ventas del día**: arriba aparece la lista reutilizable. La abro, pulso **Convertir**, desmarco un renglón, cambio una cantidad y cobro. La lista **sigue abierta** y dice «vendida 1 de N veces».

### D. Compras
- [ ] **Compras › Qué comprar y pedidos**: con cada criterio (sin existencia, bajo el mínimo, poca existencia, **por conseguir**, **para listas**) salen productos con sentido.
- [ ] Cambio el proveedor de un producto: pasa al grupo de ese proveedor.
- [ ] Creo los pedidos: se arma **uno por proveedor**.
- [ ] En **Pedidos a proveedores**: el PDF abre **sin precios**, WhatsApp abre el chat con el mensaje, y el pedido pasa a «Enviado».
- [ ] Registro una compra del producto por conseguir: después **ya se puede vender**.

### E. Gastos y finanzas
- [ ] **Caja › Gastos (fuera de caja)**: aparecen las 12 categorías básicas.
- [ ] Registro un gasto, creo una categoría nueva y anulo un gasto (pide un motivo de 10+ caracteres).
- [ ] **Reportes › Salud financiera**: aparece la columna «Otros gastos» y el gasto entra al resultado del mes.

### F. Analítica (con el motor encendido)
- [ ] **Temporadas › Detectar temporadas** responde (con poca historia puede no encontrar ninguna: eso es correcto).
- [ ] **Salud financiera** carga sus indicadores con semáforo.

### G. Ticket (si tiene la SAT 22T a mano)
- [ ] Una venta corta y una larga salen en **una sola tira**, el corte no toca el texto y el cliente CF dice «Consumidor final».

### H. Licencia (en Termux, modo abierto)
- [ ] **Configuración › Licencia y módulos** muestra el **código de este equipo** y los cuatro límites.

---

## 5. SPVI Central (si lo tiene corriendo)
```bash
cd <carpeta de central>
unzip -o /sdcard/Download/spvi-central.zip
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml logs --tail 50
```
- [ ] Central arranca sin errores (crea solo sus tablas nuevas)
- [ ] Panel › **Licencias**: aparecen los 3 planes y **Llave pública** muestra la llave
- [ ] Panel › **Experiencia de clientes** abre
- [ ] Después del siguiente latido de la tienda (o al reiniciar el API), la instalación muestra su **código de equipo** al emitir una licencia

### Prueba de licencia real (opcional; mejor en la PC de prueba con Windows)
1. Copie la llave pública de Central a `apps/api/src/modules/licencia/clave-publica.ts` y reinicie el API. El sistema queda **bloqueado** y muestra el código del equipo.
2. En Central, emita una licencia **por archivo** con ese código y descargue el `.lic`.
3. Cárguelo en «Active la licencia» e inicie sesión de nuevo: debe funcionar con los módulos y límites elegidos.
4. Para volver al modo abierto en Termux, deje `clave-publica.ts` como estaba (`= ''`) y reinicie.

- [ ] La licencia firmada por Central funciona en la tienda

---

## 6. Si necesita regresar todo
```bash
pg_restore -U spvi -d spvi --clean --if-exists ~/respaldo-antes-validacion-AAAAMMDD-HHMM.dump
rm -rf ~/migration && cp -r ~/migration-respaldo-AAAAMMDD ~/migration
```

---

## 7. Si algo falla, envíeme
1. **El número de paso** (por ejemplo «4.C, tercera casilla»).
2. **El comando y su salida completa**, o una **captura** de la pantalla.
3. **El error del API**: las últimas 30 líneas de su terminal.
4. Si falló la migración: el archivo `migration.sql` completo.
