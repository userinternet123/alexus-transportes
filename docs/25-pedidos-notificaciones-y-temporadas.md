# Pedidos, notificaciones, temporadas y Salud financiera

## Pedidos a proveedores (Compras › Qué comprar y pedidos › Pedidos a proveedores)
- **Agrupar por año, mes o día** en que se generó el pedido. También se puede **filtrar por estado**.
- **Ver**: muestra lo que tiene cada pedido (y lo que ya llegó).
- **PDF consolidado**: «PDF del grupo» (el mes o día que está viendo) y «PDF de todo». Es un solo documento con todos los pedidos, agrupados por proveedor, con lo pedido y lo recibido, sin precios.
- **«Ya lo envié»**: marca el pedido como enviado e indica el medio (WhatsApp, correo, teléfono, en persona u otro). Al compartirlo por WhatsApp o correo desde SPVI, se marca solo. El envío **aparece en la campana**.
- **«Registrar lo que llegó»**: lista de verificación por producto. De entrada todo viene marcado con la cantidad pendiente.
  - **Llegó todo**: el pedido queda «Recibido».
  - **Llegó menos o no llegó algo**: desmarque o corrija la cantidad. El pedido queda **«Recibido en parte»** y avisa en la campana cuántos productos faltan.
  - **El resto llega después**: con «Registrar lo que faltaba» se **suma** a lo anterior.

## Qué comprar
- **Dos formas de calcular**:
  - **Por existencias y ventas**: los criterios de siempre.
  - **Por temporada (modelo)**: lo que el motor analítico espera vender en esa temporada según los años anteriores, menos lo que hay.
- **Ventas de**: los últimos 30, 60 o 90 días, 6 meses, el último año, o **un rango de fechas** (por ejemplo, la misma temporada del año pasado).
- **Pedir para**: 7, 15, 30, 45, 60 o 90 días, u **otro** número de días.

## Notificaciones (campana)
- Cada notificación tiene estado **visto / no visto**, guardado por usuario en el servidor: ya no depende del navegador.
- El número de la campana cuenta solo las **no vistas**. Abrir la campana ya no las marca todas como vistas.
- Las **vistas siguen en la lista**, abajo y en gris. Los hechos (pedido enviado, recibido…) se muestran **7 días**.
- Cada una se puede marcar como vista o volver a «no vista»; también hay «Marcar todo como visto».

## Temporadas (corregido)
La temporada mostraba su aviso en pantalla pero no en la campana. Había tres causas:
1. La campana guardaba el cálculo **6 horas** y no se enteraba de los cambios. Ahora se recalcula al crear, editar, confirmar, descartar o detectar temporadas.
2. Si el **motor analítico** no respondía, no avisaba nada. Ahora avisa igual («no se pudo calcular qué comprar»).
3. Si **no faltaba ningún producto** (por ejemplo, con poca historia), no avisaba. Ahora siempre avisa y dice si alcanza.

El botón **«Qué comprar»** de Temporadas, y el aviso de la campana, llevan a **Qué comprar en modo temporada** con esa temporada elegida.

## Salud financiera (corregido)
El motor analítico **descartaba en silencio los gastos fuera de caja**: el modelo de su ruta no tenía ese campo. Actualice el motor con `spvi-analitica.zip`.

Si después de actualizar sigue saliendo un error, envíeme el **mensaje exacto** o una captura y las últimas líneas del API y del motor.

## Aplicar
**Respaldo primero** (paso 0 de la guía 24).
```bash
cd ~/migration/portalAdmin/api
unzip -o /sdcard/Download/api-acumulado-lotes-16-al-35.zip
npx --no-install prisma migrate dev --create-only --name pedidos_y_notificaciones
grep -E "^(CREATE|ALTER|DROP)" prisma/migrations/*_pedidos_y_notificaciones/migration.sql
```
El SQL debe contener **solo** lo siguiente:

| Qué | SQL esperado |
|---|---|
| Estado nuevo | `ALTER TYPE "EstadoPedido" ADD VALUE 'RECIBIDO_PARCIAL'` |
| Columnas de pedidos | `ALTER TABLE "pedidos_compra" ADD COLUMN "medio_envio" / "recibido_en" / "nota_recepcion"` |
| Lo recibido | `ALTER TABLE "pedidos_compra_detalle" ADD COLUMN "cantidad_recibida" … DEFAULT 0` |
| Tablas nuevas | `CREATE TABLE "eventos_notificacion"`, `CREATE TABLE "notificaciones_vistas"` y sus índices |

**Ningún DROP.** Si todo está bien:
```bash
npx --no-install prisma migrate dev && npm run typecheck
cd ~/migration/src && unzip -o /sdcard/Download/frontend-acumulado-lotes-16-al-40.zip && node verificar-imports.mjs
```
Actualice el **motor analítico** con `spvi-analitica.zip` y reinícielo. En el navegador, recargue con **Ctrl+F5**.
