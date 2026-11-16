# Cotizaciones y facturas en PDF y Word · Envío por WhatsApp y correo · Pago en línea

## 1. Qué incluye
- **Formato de documentos** (Configuración › Formato de documentos, permiso `documentos.configurar`):
  - **Cotización y venta por separado:** cada una tiene su propio diseño.
  - **Opciones:** papel (Carta, Media carta, A4), color, tamaño de letra, logo (posición y altura), datos del negocio y del cliente, columnas, desglose, monto en letras, forma de pago, validez, notas, pie, líneas de firma, y los textos del mensaje de WhatsApp y del correo.
  - **Vista previa:** con datos de ejemplo, a escala real del papel.
  - **«Ver PDF de prueba»:** genera el PDF real con lo que está editando, sin guardar.
  - **«Diseño de fábrica»:** restablece el diseño original.
- **En Ventas y cotizaciones**, el botón **«PDF, Word o WhatsApp»** en el detalle:
  - **En computadora:** «WhatsApp» descarga el archivo y abre WhatsApp con el número y el mensaje. «Correo» descarga y abre su programa de correo (Outlook, Mail), o Gmail u Outlook en el navegador, con asunto y texto listos.
  - **En el teléfono con HTTPS:** «Compartir» adjunta el archivo directamente a la app que elija.
- **Lo que llevan los documentos:**
  - **Comunes:** monto en letras («SON: … QUETZALES CON 50/100»), páginas numeradas, y tabla que continúa en la hoja siguiente con sus encabezados.
  - **Factura certificada:** autorización FEL y frases.
  - **Cotización:** «Este documento no es una factura».
  - **Venta sin certificar:** «Documento sin validez fiscal».
- **Marca:** «SPVI by ALEXUS» en el pie, salvo con la licencia `sinmarca`.
- **Costos:** nunca salen. El servidor ni siquiera los lee al armar el documento.

## 2. Limitaciones (decididas a propósito)
- **Correo y WhatsApp no adjuntan el archivo solos.** Un enlace solo puede abrir el mensaje. Por eso el archivo se descarga y se adjunta con el clip o arrastrándolo.
- **«Compartir» con archivo adjunto requiere HTTPS.** Si el portal se abre por `http://` (IP de la red o de Tailscale), el teléfono usa el mismo camino que la computadora.
- **El logo debe ser PNG o JPG.** Es lo que admiten PDF y Word; si es de otro tipo, el documento sale sin logo.
- **Fuentes del PDF:** cubren el español completo (tildes, ñ, ¿¡). Los caracteres de otros idiomas o emojis se reemplazan por «?» en el PDF. En Word salen bien.

## 3. Activación
1. Aplicar `api-acumulado-lotes-16-al-21.zip` (trae `package.json` con dos librerías nuevas: `pdfkit` y `docx`).
2. `npm install` en `~/migration/portalAdmin/api`.
3. `npm run typecheck`.
4. `SEED_ADMIN_PASSWORD='MiClaveNueva2026' npm run db:seed`. Agrega el permiso `documentos.configurar` a GERENTE.
5. No hay migración de base de datos: el diseño se guarda en los parámetros del sistema.
6. Aplicar `frontend-acumulado-lotes-16-al-23.zip` y `node verificar-imports.mjs`.

## 4. Pruebas sugeridas
1. Configuración › Formato de documentos: cambie el color y el título, y pulse «Ver PDF de prueba».
2. Abra una cotización › «PDF, Word o WhatsApp» › WhatsApp (el cliente con teléfono) › adjunte el PDF descargado.
3. La misma cotización en Word: ábrala en Word y edítela.
4. Una cotización de muchas líneas: verifique la segunda hoja (encabezados repetidos y «Página 2 de 2»).
5. Desde el celular: si el portal usa HTTPS, «Compartir»; si no, el camino de descarga.

## 5. Pago en línea — recomendación: Recurrente (verificar condiciones antes de firmar)
- **Por qué Recurrente:**
  - Es guatemalteca y genera enlaces de pago.
  - Tiene API para crear cobros desde el sistema.
  - Avisa a SPVI cuando el cliente paga (webhooks firmados), así la venta se marca pagada sola.
  - Cobra en quetzales y tiene llaves de prueba para integrar sin dinero real.
  - No cobra mensualidad.
- **Costo publicado** (ficha de su app): 4.5 % + Q2 por cobro con tarjeta; transferencias sin costo.
- **Alternativas a cotizar:**
  - **Paggo:** guatemalteca, enlaces de pago y API desde 2025.
  - **Pagadito:** opera en Guatemala, sin mensualidad.
  - **VisaNet Guatemala:** afiliación bancaria con más trámites; cobra USD 0.25 por autorización más la tasa, y liquida en 2 días hábiles.
- **Cada tienda abre su propia cuenta.** El dinero va directo a su banco; ALEXUS nunca lo toca. Sus llaves se guardarán cifradas en la base.
- **Para empezar la integración necesito:**
  1. Que una tienda (o ALEXUS para pruebas) abra cuenta en Recurrente.
  2. Las llaves de prueba (`pk_test…` y `sk_test…`).
  3. El secreto de webhooks.
  Su documentación oficial está en Postman; no la pude leer desde aquí, así que construiré contra ella con las llaves de prueba.

## Lo que NO está verificado
- **Prisma real:** el servicio de documentos no se ejecutó contra Prisma real. Los generadores de PDF y Word sí se probaron a fondo, y los tipos compilan.
- **Word abierto en Microsoft Word:** se verificó con otro lector (python-docx), pero conviene abrir uno en Word.
- **Enlaces de Gmail y Outlook web:** se probaron sus formatos, no contra los servicios reales.
- **Recurrente:** condiciones y comisiones tomadas de fuentes públicas; pueden cambiar. Confírmelas con ellos.
