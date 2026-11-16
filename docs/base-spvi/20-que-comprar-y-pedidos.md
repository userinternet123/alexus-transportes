# Qué comprar y pedidos a proveedores

**Dónde:** Compras › Qué comprar y pedidos. Se ve con el permiso `compras.ver`; para crear pedidos se necesita `compras.crear`.

## Cómo funciona
1. **Qué buscar:**
   - **Sin existencia.**
   - **Bajo el mínimo.**
   - **Con poca existencia:** "N o menos".
   - **Solo productos que se han vendido** (activado de entrada): deja fuera los productos que ya no se mueven.
2. **Cantidad sugerida:** lo necesario para cubrir los días que usted indica (30 de entrada) al ritmo de venta de los últimos 60 días, y nunca menos que el mínimo. Se puede cambiar.
3. **Proveedor de cada producto:**
   - **Primero:** el que usted eligió antes.
   - **Si no eligió ninguno:** el de la última compra.
   - **Para cambiarlo:** puede elegir entre los que ya le vendieron ese producto (con fecha y último costo, si tiene permiso de ver costos) o buscar «Otro proveedor…».
   - **«Recordar el proveedor elegido»:** guarda su elección para la próxima vez.
4. **Lista de verificación:** usted marca qué comprar. Al crear, se arma **un pedido por proveedor**.
5. **Pedidos a proveedores:**
   - **PDF:** con el logo y los colores del diseño de cotizaciones, sin precios.
   - **WhatsApp:** en el teléfono adjunta el PDF; en la computadora lo descarga y abre el chat del proveedor con el mensaje listo.
   - **Correo.**
   - **Estados:** por enviar → enviado → recibido, o anulado. Al compartirlo por WhatsApp o correo, el pedido pasa solo a «enviado».

## Aplicar
```bash
cd ~/migration/portalAdmin/api && unzip -o /sdcard/Download/api-acumulado-lotes-16-al-31.zip
npx --no-install prisma migrate dev --create-only --name pedidos_compra
cat prisma/migrations/*_pedidos_compra/migration.sql | grep -E "CREATE|DROP|ALTER"
```
**Revise el SQL.** Debe crear `proveedores_producto`, `pedidos_compra`, `pedidos_compra_detalle` y el tipo `EstadoPedido`. Puede tener `ALTER TABLE … ADD CONSTRAINT` para las llaves foráneas. **Ningún DROP.** Si todo está bien:
```bash
npx --no-install prisma migrate dev && npm run typecheck
cd ~/migration/src && unzip -o /sdcard/Download/frontend-acumulado-lotes-16-al-36.zip && node verificar-imports.mjs
```

## Lo que sigue
- **App móvil:** ver los pedidos y compartir su PDF. Las rutas del servidor ya están listas (`/pedidos`, `/pedidos/:id`, `/pedidos/:id/pdf`).
- **«Recibir pedido»:** que abra el ingreso de compra ya lleno con lo pedido.
- **Cotizaciones con productos «por conseguir»**, que entren a esta lista.
- **Listas reutilizables:** por ejemplo, la lista de útiles de un colegio.
