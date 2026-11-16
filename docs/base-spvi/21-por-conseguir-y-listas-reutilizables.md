# Productos «por conseguir» y listas reutilizables

## Producto que no tenemos (por conseguir)
- **Dónde:** en el punto de venta, **modo cotización**, botón **«+ Producto que no tenemos»**. Se escribe el nombre y un precio estimado.
- **Cómo queda:** se crea con código `PC-00123`, en «Por clasificar».
  - **Se puede cotizar.**
  - **No se puede vender** hasta que llegue: el sistema lo explica si alguien lo intenta.
- **En «Qué comprar»:** criterio **«Por conseguir (cotizados)»**, con la cantidad pedida en cotizaciones vigentes.
- **Al llegar:** cuando se registra su primera compra, se vuelve un producto normal y ya se puede vender. Conviene completar su categoría y precio definitivo en Productos.

## Listas reutilizables (por ejemplo, la lista de útiles de un colegio)
- **Crear:** en el punto de venta, modo cotización, marque **«Lista reutilizable»**, póngale nombre («Colegio Belén 3.º primaria») y, si quiere, cuántos alumnos espera. También se puede convertir una cotización existente desde **Ventas del día › Hacer lista reutilizable**.
- **Vender:** en **Ventas del día › Listas reutilizables**, abra la lista y pulse **Convertir**.
  - **Lo que lleva cada comprador:** se marca y se ajusta (por ejemplo, un alumno que ya tiene lápices). El efectivo se ajusta al total.
  - **La lista sigue abierta** para el siguiente comprador, y muestra «vendida 5 de 30 veces».
  - **No vence por fecha:** para cerrarla, anúlela.
- **En «Qué comprar»:** criterio **«Para listas reutilizables»**. Calcula lo que falta: `cantidad por alumno × (alumnos esperados − ventas ya hechas) − existencia`.

## Aplicar
```bash
cd ~/migration/portalAdmin/api && unzip -o /sdcard/Download/api-acumulado-lotes-16-al-32.zip
npx --no-install prisma migrate dev --create-only --name listas_y_por_conseguir
cat prisma/migrations/*_listas_y_por_conseguir/migration.sql
```
**Revise el SQL.** Debe ser solo `ALTER TABLE "productos" ADD COLUMN "por_conseguir"…` y `ALTER TABLE "ventas" ADD COLUMN "reutilizable" / "nombre_lista" / "compradores_esperados"`. **Ningún DROP.** Si todo está bien:
```bash
npx --no-install prisma migrate dev && npm run typecheck
cd ~/migration/src && unzip -o /sdcard/Download/frontend-acumulado-lotes-16-al-37.zip && node verificar-imports.mjs
```
