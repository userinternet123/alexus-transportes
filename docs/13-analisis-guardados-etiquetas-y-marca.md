# Análisis guardados · Etiquetas de código de barras · Marca ALEXUS con licencia

## 1. Mis análisis y tableros (Reportes › Mis análisis y tableros)
- **Guardar:** en «Pregunta a tus datos», cada respuesta trae «Guardar como análisis». El sistema convierte las fechas en un **período relativo** ("este mes", "últimos 12 meses"): al abrirlo mañana usa los datos de mañana. Si las fechas no corresponden a ningún período conocido, avisa y las deja fijas.
- **Abrir:** se ejecuta **al instante y sin IA** (no gasta). «Explicar con IA» es un botón opcional.
- **Cambiar el período** al abrir (excepto en análisis con proyección, que usan su propio historial).
- **Tableros:** varios análisis juntos (hasta 12) con un **período común** que se cambia con un solo selector.
- **Compartir:** el análisis o tablero es **personal**; su dueño lo comparte con **usuarios o roles completos**. Quien lo recibe lo ve y ejecuta con **sus propios permisos** (si usted incluyó costos y esa persona no puede verlos, se le avisa). No puede modificarlo; puede «Guardar copia» propia. Al compartir un tablero se comparten sus análisis, solo para verlos dentro de él.
- Límites: 100 análisis y 30 tableros por usuario.
- Permiso: `reportes.analitica` (el del Dashboard analítico). «Explicar con IA» además pide `reportes.analitica.agente`.

## 2. Código de barras en la ficha del producto
- **Generar código:** crea un código propio (EAN-13 de uso interno, prefijo 29, con dígito verificador) que no existe en otro producto. Hay que **guardar el producto** para conservarlo.
- **Imprimir etiqueta:** tamaños 40×25, 50×30 y 60×40 mm, copias (hasta 500), con nombre y precio opcionales. Dibuja EAN-13, EAN-8, UPC-A o Code 128 según el código del producto (los códigos propios del negocio también salen).
- Si el código es muy largo para una etiqueta pequeña, avisa que quizá no se lea.
- Se imprime en la **impresora predeterminada**. Con impresión silenciosa (`--kiosk-printing`), esa debe ser la de etiquetas, o abra SPVI en una ventana normal para elegir impresora.
- Dos usuarios que generan un código al mismo tiempo podrían recibir el mismo: el segundo que guarde verá el aviso de código repetido y debe generar otro.

## 3. Marca «SPVI by ALEXUS»
- **Fija** (siempre) en **Login** e **Inicio**. Se quitó del menú lateral.
- **Removible con licencia** en lo que ve el cliente final: **tickets**, **pantalla completa** del punto de venta, cotizaciones y ventas (y, cuando se hagan, PDF y Word).
- **Pantalla completa:** nombre del negocio (y su logo, si lo subió) arriba, y la firma abajo.
- **Licencia:** módulo `sinmarca`, **no incluido en ningún plan** (es el servicio mensual). Para emitirla: `npm run licencia:emitir -- … --agregar sinmarca`, y pegarla en SPVI Central (botón «Licencia» de la instalación). Se renueva con la licencia mensual.

## Activación
1. Aplicar `api-acumulado-lotes-16-al-20.zip`. `npx --no-install prisma migrate dev --create-only --name analisis-guardados` y **revisar** el SQL: solo `CREATE TABLE plantillas_analiticas`, `tableros_analiticos`, `analitica_compartida` (y `producto_alias` si aún no la creó), sus índices y llaves foráneas. **Ningún `DROP`.** Luego `npx --no-install prisma migrate dev`.
2. `npm run typecheck`.
3. Aplicar `frontend-acumulado-lotes-16-al-22.zip` y `node verificar-imports.mjs`.
No hace falta `db:seed` (no hay permisos nuevos en este lote).

## Pruebas sugeridas
1. Pregunte «¿cuál es la categoría que más se vende este año?» → «Guardar como análisis» → ábralo desde Mis análisis y cambie el período.
2. Cree un tablero con 2 análisis; cambie el período común.
3. Comparta un análisis con un rol y entre con un usuario de ese rol: debe verlo con «Compartido por…» y sin botones de editar.
4. Producto sin código de barras → «Generar código» → guardar → «Imprimir etiqueta» → pruebe leerla con el lector.
5. Con un usuario SIN permiso de costos, abra un análisis de utilidad compartido: debe avisarle, no mostrarle cifras.
6. Verifique que, con la licencia `sinmarca`, desaparezca la firma del ticket y de la pantalla completa, y siga en Login e Inicio.

## Lo que NO está verificado
- La IA real (explicaciones, costo) y la capa de Prisma en ejecución (el SQL sí se probó en PostgreSQL 16 y los tipos compilan).
- La impresión física de etiquetas: el código se leyó con un lector de software, pero conviene probar con su lector y su impresora reales, y calibrar el tamaño de etiqueta.
