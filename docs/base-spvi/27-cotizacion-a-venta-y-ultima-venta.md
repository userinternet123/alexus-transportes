# Cotización → venta en el punto de venta · «Enviar última venta»

## Convertir una cotización
**Ventas y cotizaciones › (abrir la cotización) › Convertir** ya no cobra directo: abre el **punto de venta en una pestaña NUEVA** con la cotización.
- **Las pestañas que estaban en curso no se tocan**: no se pierde ningún avance.
- **Productos**: los de la cotización, con el **precio y la existencia de hoy**.
  - Si un producto ya no está disponible, no se agrega y se avisa.
  - Si un descuento pasa del permitido hoy, se ajusta y se avisa.
- **Cliente**: el de la cotización (o CF), **y se puede cambiar**. El comprador puede ser otro.
- **Antes de cobrar** se puede cambiar todo: productos, marcas, cantidades y descuentos.
- **Aviso en la pestaña**: «Venta desde la cotización COT-110 (cotizada a Juan Pérez)».
- **Sin duplicados**: si la cotización ya está abierta en otra pestaña, la selecciona en vez de abrirla otra vez.
- **Al cobrar**:
  - La venta queda ligada a la cotización y la cotización pasa a **convertida**.
  - Si dos cajas intentan cobrar la misma, solo una lo logra; la otra recibe «ya se cobró en otra caja».
  - Una cotización convertida, anulada o vencida no se puede cobrar.
  - Las **listas reutilizables** quedan abiertas y no vencen.

## Enviar la última venta
- **En Ventas**: «**Enviar última venta (PDF, WhatsApp, correo)**», con número, **NIT, nombre**, total y estado de FEL.
- **En Cotizaciones**: «Enviar cotización…» con la última cotización.
- **Cada modo tiene la suya**: antes se mezclaban.

## Aplicar
- `api-acumulado-lotes-16-al-37.zip` y `frontend-acumulado-lotes-16-al-41.zip`.
- **No hay migración.** Reinicie el API y recargue con Ctrl+F5.
